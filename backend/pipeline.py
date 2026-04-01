"""
PageIndex LangGraph reasoning pipeline.

Four nodes:
  load_tree      — retrieves DocumentTree from SQLite (handled in main.py)
  navigate       — LLM reads truncated tree, returns relevant section IDs
  fetch_sections — retrieves full text for identified sections
  generate       — streams the final answer (called outside the graph for SSE)
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, AsyncGenerator, TypedDict

from huggingface_hub import InferenceClient
from langgraph.graph import END, StateGraph

from models import Citation, DocumentTree, Section
from tree_builder import get_sections_by_ids, truncate_tree_for_navigation

logger = logging.getLogger(__name__)

HF_TOKEN = os.getenv("HUGGINGFACE_API_TOKEN", "")
HF_MODEL = os.getenv("HF_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")

NAVIGATE_MAX_TOKENS = 512
GENERATE_MAX_TOKENS = 1024

NAVIGATE_SYSTEM = (
    "You are the PageIndex Navigator for a document intelligence system. "
    "Your sole function is to read the document tree below and identify which sections "
    "contain information relevant to the user's question. "
    "Do not answer the question — only identify the sections.\n\n"
    "TREE:\n{tree_json}\n\n"
    "USER QUESTION: \"{question}\"\n\n"
    "Respond ONLY with a valid JSON array of section objects. "
    "No preamble, no explanation — just the JSON array:\n"
    '[{{"id": "1.2", "number": "1.2", "title": "Section Title"}}]'
)

GENERATE_SYSTEM = (
    "You are a document review assistant. "
    "Answer the user's question using ONLY the section content provided below. "
    "Be precise and factual. "
    "If the sections do not contain the answer, say so explicitly.\n\n"
    "RELEVANT SECTIONS:\n{sections_text}\n\n"
    "USER QUESTION: \"{question}\"\n\n"
    "Answer directly and concisely based only on the provided sections."
)


class PipelineState(TypedDict):
    question: str
    tree: DocumentTree
    truncated_tree_json: str
    relevant_section_ids: list[str]
    citations: list[Citation]
    full_section_text: str


def _make_client() -> InferenceClient:
    return InferenceClient(token=HF_TOKEN)


def _extract_json_array(text: str) -> list[dict]:
    """
    Extract a JSON array from model output, even if surrounded by prose.
    """
    # Try direct parse first
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # Find first [...] block
    match = re.search(r"\[.*?\]", stripped, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.warning("navigate: could not extract JSON array from: %s", text[:300])
    return []


# ── LangGraph nodes ────────────────────────────────────────────────────────────

def navigate_node(state: PipelineState) -> dict:
    """
    Calls the LLM with the truncated tree to identify relevant section IDs.
    Returns updated state keys.
    """
    client = _make_client()
    tree: DocumentTree = state["tree"]
    question: str = state["question"]

    truncated = truncate_tree_for_navigation(tree, max_chars=400)
    tree_json = json.dumps(truncated, indent=2)

    prompt = NAVIGATE_SYSTEM.format(tree_json=tree_json, question=question)

    try:
        completion = client.chat_completion(
            model=HF_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=NAVIGATE_MAX_TOKENS,
            temperature=0.1,
        )
        raw = completion.choices[0].message.content or ""
    except Exception as exc:
        logger.error("navigate_node LLM call failed: %s", exc)
        raw = "[]"

    raw_sections = _extract_json_array(raw)

    citations: list[Citation] = []
    ids: list[str] = []
    for item in raw_sections:
        if isinstance(item, dict) and "id" in item:
            citations.append(
                Citation(
                    id=str(item.get("id", "")),
                    number=str(item.get("number", item.get("id", ""))),
                    title=str(item.get("title", "")),
                )
            )
            ids.append(str(item["id"]))

    return {
        "truncated_tree_json": tree_json,
        "relevant_section_ids": ids,
        "citations": citations,
    }


def fetch_sections_node(state: PipelineState) -> dict:
    """
    Retrieves full (un-truncated) section text for the identified section IDs.
    Composes the focused context window for the generate node.
    """
    tree: DocumentTree = state["tree"]
    ids: list[str] = state.get("relevant_section_ids", [])

    sections = get_sections_by_ids(tree, ids)

    if not sections:
        # Fallback: use first two L1 sections so generate always has something
        sections = tree.sections[:2]

    parts: list[str] = []
    for s in sections:
        header = f"[Section {s.number}] {s.title}"
        parts.append(header)
        if s.text:
            parts.append(s.text)
        for child in s.children:
            parts.append(f"  [{child.number}] {child.title}")
            if child.text:
                parts.append("  " + child.text.replace("\n", "\n  "))

    return {"full_section_text": "\n\n".join(parts)}


# ── Graph construction ─────────────────────────────────────────────────────────

def build_graph() -> Any:
    workflow: StateGraph = StateGraph(PipelineState)  # type: ignore[arg-type]
    workflow.add_node("navigate", navigate_node)
    workflow.add_node("fetch_sections", fetch_sections_node)
    workflow.set_entry_point("navigate")
    workflow.add_edge("navigate", "fetch_sections")
    workflow.add_edge("fetch_sections", END)
    return workflow.compile()


_graph = None


def get_graph() -> Any:
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


# ── Streaming generate ─────────────────────────────────────────────────────────

def _stream_generate_sync(question: str, section_text: str):
    """
    Synchronous generator that streams tokens from the LLM.
    Called inside a thread executor to avoid blocking the event loop.
    """
    client = _make_client()
    prompt = GENERATE_SYSTEM.format(sections_text=section_text, question=question)

    try:
        for chunk in client.chat_completion(
            model=HF_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=GENERATE_MAX_TOKENS,
            temperature=0.3,
            stream=True,
        ):
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:
        logger.error("generate stream failed: %s", exc)
        yield f"\n\n[Error generating answer: {exc}]"


async def run_pipeline(
    question: str,
    tree: DocumentTree,
) -> AsyncGenerator[dict, None]:
    """
    Async generator that yields SSE event dicts:
      {"type": "citation", "sections_used": [...]}
      {"type": "delta", "content": "..."}
      {"type": "done"}
      {"type": "error", "message": "..."}
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    loop = asyncio.get_event_loop()

    initial_state: PipelineState = {  # type: ignore[typeddict-item]
        "question": question,
        "tree": tree,
        "truncated_tree_json": "",
        "relevant_section_ids": [],
        "citations": [],
        "full_section_text": "",
    }

    # ── Step 1: navigate + fetch_sections (run sync graph in thread) ────────
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            final_state = await loop.run_in_executor(
                executor, lambda: get_graph().invoke(initial_state)
            )
    except Exception as exc:
        logger.error("pipeline graph failed: %s", exc)
        yield {"type": "error", "message": str(exc)}
        return

    citations: list[Citation] = final_state.get("citations", [])
    section_text: str = final_state.get("full_section_text", "")

    # ── Step 2: emit citation event ─────────────────────────────────────────
    yield {
        "type": "citation",
        "sections_used": [c.model_dump() for c in citations],
    }

    # ── Step 3: stream generate in thread, yield deltas ─────────────────────
    queue: asyncio.Queue = asyncio.Queue()
    sentinel = object()

    def producer() -> None:
        try:
            for token in _stream_generate_sync(question, section_text):
                asyncio.run_coroutine_threadsafe(queue.put(token), loop)
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(sentinel), loop)

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(producer)
        while True:
            item = await queue.get()
            if item is sentinel:
                break
            yield {"type": "delta", "content": item}
        future.result()  # re-raise any exception from the thread

    yield {"type": "done"}
