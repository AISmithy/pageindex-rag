import json
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

from database import (
    create_session,
    get_document_id_for_session,
    get_messages,
    get_tree,
    init_db,
    save_document,
    save_message,
)
from models import (
    ChatRequest,
    HealthResponse,
    IngestRequest,
    IngestResponse,
    MessagesResponse,
    SessionRequest,
    SessionResponse,
)
from pipeline import run_pipeline
from tree_builder import build_tree

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

APP_VERSION = os.getenv("APP_VERSION", "1.0.0")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialised.")
    yield


app = FastAPI(
    title="PageIndex Vectorless RAG",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ──────────────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", version=APP_VERSION)


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    """
    Accepts raw extracted text from the frontend, builds the PageIndex tree,
    persists it to SQLite, and returns the tree + metadata.
    """
    logger.info(
        "Ingest request: filename=%r  text_len=%d  first_120=%r",
        req.filename,
        len(req.text),
        req.text[:120],
    )
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Document text is empty.")

    tree = build_tree(req.text, req.filename)

    # After fallback sectioning, if we still have nothing the document is unusable
    if not tree.sections:
        raise HTTPException(
            status_code=422,
            detail="Could not extract any content from this document.",
        )

    doc_id = await save_document(req.filename, tree)
    logger.info("Ingested document %s -> %s (%d sections)", req.filename, doc_id, tree.totalSections)

    return IngestResponse(
        document_id=doc_id,
        totalPages=tree.totalPages,
        totalSections=tree.totalSections,
        totalSubs=tree.totalSubs,
        tree=tree,
    )


@app.post("/session", response_model=SessionResponse)
async def create_chat_session(req: SessionRequest):
    """
    Creates a new chat session linked to an ingested document.
    """
    tree = await get_tree(req.document_id)
    if tree is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    session_id, created_at = await create_session(req.document_id)
    return SessionResponse(session_id=session_id, created_at=created_at)


@app.post("/chat")
async def chat(req: ChatRequest):
    """
    Accepts a user question and streams the answer via SSE.

    SSE event types:
      data: {"type": "citation", "sections_used": [...]}
      data: {"type": "delta", "content": "token"}
      data: {"type": "done"}
      data: {"type": "error", "message": "..."}
    """
    doc_id = await get_document_id_for_session(req.session_id)
    if doc_id is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    tree = await get_tree(doc_id)
    if tree is None:
        raise HTTPException(status_code=404, detail="Document tree not found.")

    # Persist user message
    await save_message(req.session_id, "user", req.question)

    async def event_stream():
        full_answer: list[str] = []
        cited_sections = []

        try:
            async for event in run_pipeline(req.question, tree):
                if event["type"] == "citation":
                    cited_sections = event.get("sections_used", [])
                elif event["type"] == "delta":
                    full_answer.append(event.get("content", ""))
                elif event["type"] == "error":
                    logger.error("pipeline error: %s", event.get("message"))

                yield f"data: {json.dumps(event)}\n\n"

        except Exception as exc:
            logger.exception("Unexpected error in event_stream")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        finally:
            # Persist assistant message with audit trail
            answer_text = "".join(full_answer)
            if answer_text:
                from models import Citation
                citations = [Citation(**c) for c in cited_sections] if cited_sections else []
                await save_message(
                    req.session_id,
                    "assistant",
                    answer_text,
                    citations or None,
                )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/session/{session_id}/messages", response_model=MessagesResponse)
async def get_session_messages(session_id: str):
    """
    Returns the full message history for a session (audit trail).
    """
    doc_id = await get_document_id_for_session(session_id)
    if doc_id is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    messages = await get_messages(session_id)
    return MessagesResponse(messages=messages)
