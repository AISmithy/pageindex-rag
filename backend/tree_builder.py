import json
import re
import logging
import os

from huggingface_hub import InferenceClient

from models import DocumentTree, Section

logger = logging.getLogger(__name__)

# Regex patterns from the spec
L1_RE = re.compile(r"^(\d+)\.\s+([A-Z].{2,70})$")
L2_RE = re.compile(r"^(\d+\.\d+)\s+(.{3,80})$")
# Fallback: bold ALL-CAPS headings common in legal documents
ALL_CAPS_RE = re.compile(r"^[A-Z][A-Z\s]{3,58}[A-Z]$")
# Short title-case line (≤ 80 chars) with no terminal punctuation — generic heading heuristic
TITLE_LINE_RE = re.compile(r"^[A-Z][A-Za-z0-9 ,\-&'/]{2,78}[A-Za-z0-9)]$")

CHARS_PER_PAGE = 1800
# Minimum chars a paragraph must have to become its own section in the fallback
MIN_PARA_CHARS = 80
# Target chars per fallback section (split large paragraphs)
FALLBACK_SECTION_CHARS = 1200

HF_TOKEN = os.getenv("HUGGINGFACE_API_TOKEN", "")
HF_MODEL = os.getenv("HF_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
LLM_TOC_MAX_TOKENS = 1024


def build_tree(text: str, filename: str) -> DocumentTree:
    """
    Single-pass line scanner that converts plain extracted text into
    a hierarchical DocumentTree.
    """
    # Derive a document title from the filename
    title = re.sub(r"\.[^.]+$", "", filename).replace("_", " ").replace("-", " ").strip()
    if not title:
        title = "Untitled Document"

    lines = text.splitlines()
    sections: list[Section] = []
    current_l1: Section | None = None
    current_l2: Section | None = None
    char_count = 0
    page = 1

    for raw_line in lines:
        char_count += len(raw_line) + 1

        # Page estimation: 1 page ≈ 1,800 characters
        estimated_page = max(1, char_count // CHARS_PER_PAGE + 1)
        if estimated_page > page:
            page = estimated_page

        line = raw_line.strip()
        if not line:
            continue

        # Level 1: numbered heading e.g. "3. System Architecture"
        m = L1_RE.match(line)
        if m:
            current_l2 = None
            current_l1 = Section(
                id=m.group(1),
                level=1,
                number=m.group(1),
                title=m.group(2).strip(),
                page=page,
                text="",
                children=[],
            )
            sections.append(current_l1)
            continue

        # Level 2: decimal-numbered subsection e.g. "3.2 Data Flow"
        if current_l1 is not None:
            m2 = L2_RE.match(line)
            if m2:
                current_l2 = Section(
                    id=m2.group(1),
                    level=2,
                    number=m2.group(1),
                    title=m2.group(2).strip(),
                    page=page,
                    text="",
                    children=[],
                )
                current_l1.children.append(current_l2)
                continue

        # Fallback: ALL-CAPS heading treated as L1 (e.g. legal contracts)
        if ALL_CAPS_RE.match(line):
            section_num = str(len(sections) + 1)
            current_l2 = None
            current_l1 = Section(
                id=section_num,
                level=1,
                number=section_num,
                title=line.title(),
                page=page,
                text="",
                children=[],
            )
            sections.append(current_l1)
            continue

        # Text accumulation — L2 preferred over L1
        if current_l2 is not None:
            current_l2.text += raw_line + "\n"
        elif current_l1 is not None:
            current_l1.text += raw_line + "\n"

    # Strip trailing whitespace from all text fields
    for s in sections:
        s.text = s.text.strip()
        for child in s.children:
            child.text = child.text.strip()

    # ── Fallback: LLM-based TOC, then paragraph-based sectioning ────────────
    # If no headings were detected, try LLM TOC generation first.
    # If that also fails, fall back to paragraph splitting.
    if not sections:
        logger.info(
            "No numbered/caps headings found in '%s'. "
            "Attempting LLM-based TOC generation.",
            filename,
        )
        sections = _llm_toc_fallback(text, filename)
        if not sections:
            logger.warning(
                "LLM TOC generation unavailable or failed for '%s'. "
                "Falling back to paragraph-based sectioning.",
                filename,
            )
            sections = _paragraph_fallback(text, title, page)

    total_subs = sum(len(s.children) for s in sections)

    return DocumentTree(
        title=title,
        totalPages=page,
        totalSections=len(sections),
        totalSubs=total_subs,
        sections=sections,
    )


def _paragraph_fallback(text: str, title: str, total_pages: int) -> list[Section]:
    """
    When heading detection yields nothing, split the text on double-newline
    paragraph boundaries and create numbered L1 sections from the chunks.
    Large chunks are further subdivided.
    """
    raw_paragraphs = re.split(r"\n\s*\n", text.strip())
    sections: list[Section] = []
    char_count = 0
    section_num = 0

    for para in raw_paragraphs:
        para = para.strip()
        if len(para) < MIN_PARA_CHARS:
            # Attach short paragraphs to the previous section
            if sections:
                sections[-1].text = (sections[-1].text + "\n\n" + para).strip()
            continue

        # Split very long paragraphs into sub-chunks
        chunks = _split_long_text(para, FALLBACK_SECTION_CHARS)
        for chunk in chunks:
            section_num += 1
            char_count += len(chunk)
            page = max(1, char_count // CHARS_PER_PAGE + 1)

            # Use the first line (up to 80 chars) as the section title
            first_line = chunk.splitlines()[0].strip()[:80]
            rest = chunk[len(first_line):].strip()

            sections.append(
                Section(
                    id=str(section_num),
                    level=1,
                    number=str(section_num),
                    title=first_line or f"Section {section_num}",
                    page=min(page, total_pages),
                    text=rest,
                    children=[],
                )
            )

    return sections


def _split_long_text(text: str, max_chars: int) -> list[str]:
    """Split text into chunks of at most max_chars, breaking at sentence ends."""
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    while len(text) > max_chars:
        # Try to break at the last sentence end within the limit
        boundary = text.rfind(". ", 0, max_chars)
        if boundary == -1:
            boundary = max_chars
        else:
            boundary += 1  # include the period
        chunks.append(text[:boundary].strip())
        text = text[boundary:].strip()
    if text:
        chunks.append(text)
    return chunks


# ── LLM-based TOC generation ──────────────────────────────────────────────────

_LLM_TOC_PROMPT = (
    "Analyze the document below and produce a hierarchical table of contents "
    "with up to 2 levels. Return ONLY a JSON array — no prose.\n\n"
    "Each object in the array must have:\n"
    '  "title"      – a short descriptive section title\n'
    '  "start_line" – the 1-based line number where the section begins\n'
    '  "level"      – 1 for a main section, 2 for a subsection\n\n'
    "Rules:\n"
    "• Create 3–20 sections that together cover the entire document.\n"
    "• Level-2 sections must appear directly after their parent level-1 section.\n"
    "• Use the document's own headings/topics when they exist; "
    "otherwise infer logical groupings.\n\n"
    "DOCUMENT (lines are numbered):\n{numbered_text}\n\n"
    "JSON array:"
)


def _extract_json_array(text: str) -> list[dict]:
    """Extract a JSON array from LLM output, tolerating surrounding prose."""
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass
    match = re.search(r"\[.*\]", stripped, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return []


def _llm_toc_fallback(text: str, filename: str) -> list[Section] | None:
    """
    Use an LLM to generate a table of contents when regex-based heading
    detection finds nothing.  Returns a list of Section objects, or None
    if the LLM call fails so the caller can fall back to paragraph splitting.
    """
    if not HF_TOKEN:
        logger.warning("No HUGGINGFACE_API_TOKEN set — skipping LLM TOC generation.")
        return None

    lines = text.splitlines()
    total_lines = len(lines)

    # Build a numbered preview within a character budget (~6 K tokens).
    MAX_CHARS = 24_000
    numbered: list[str] = []
    budget = MAX_CHARS
    for i, line in enumerate(lines, 1):
        entry = f"{i}: {line}"
        budget -= len(entry) + 1
        if budget < 0:
            numbered.append(f"... (truncated, {total_lines} lines total)")
            break
        numbered.append(entry)
    numbered_text = "\n".join(numbered)

    prompt = _LLM_TOC_PROMPT.format(numbered_text=numbered_text)

    # ── Call LLM ───────────────────────────────────────────────────────────
    try:
        client = InferenceClient(token=HF_TOKEN)
        completion = client.chat_completion(
            model=HF_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=LLM_TOC_MAX_TOKENS,
            temperature=0.1,
        )
        raw = completion.choices[0].message.content or ""
    except Exception as exc:
        logger.error("LLM TOC call failed for '%s': %s", filename, exc)
        return None

    toc_items = _extract_json_array(raw)
    if not toc_items or len(toc_items) < 2:
        logger.warning(
            "LLM TOC: insufficient sections returned (%d) for '%s'.",
            len(toc_items),
            filename,
        )
        return None

    # ── Build Section objects ──────────────────────────────────────────────
    toc_items.sort(key=lambda x: int(x.get("start_line", 1)))

    # Precompute cumulative character offsets for page estimation.
    line_char_offsets = [0]
    for ln in lines:
        line_char_offsets.append(line_char_offsets[-1] + len(ln) + 1)

    sections: list[Section] = []
    l1_sections: list[Section] = []

    for idx, item in enumerate(toc_items):
        start = max(0, int(item.get("start_line", 1)) - 1)
        if idx + 1 < len(toc_items):
            end = max(start, int(toc_items[idx + 1].get("start_line", 1)) - 1)
        else:
            end = total_lines
        start = min(start, total_lines)
        end = min(end, total_lines)

        section_text = "\n".join(lines[start:end]).strip()
        page = max(1, line_char_offsets[start] // CHARS_PER_PAGE + 1)

        level = int(item.get("level", 1))
        title = str(item.get("title", f"Section {idx + 1}"))

        if level == 2 and l1_sections:
            parent = l1_sections[-1]
            sub_num = f"{parent.number}.{len(parent.children) + 1}"
            parent.children.append(
                Section(
                    id=sub_num,
                    level=2,
                    number=sub_num,
                    title=title,
                    page=page,
                    text=section_text,
                    children=[],
                )
            )
        else:
            sec_num = str(len(l1_sections) + 1)
            section = Section(
                id=sec_num,
                level=1,
                number=sec_num,
                title=title,
                page=page,
                text=section_text,
                children=[],
            )
            sections.append(section)
            l1_sections.append(section)

    logger.info(
        "LLM TOC generated %d sections (%d subsections) for '%s'.",
        len(sections),
        sum(len(s.children) for s in sections),
        filename,
    )
    return sections if sections else None


def truncate_tree_for_navigation(tree: DocumentTree, max_chars: int = 400) -> dict:
    """
    Return a JSON-serialisable dict with each section's text field
    truncated to max_chars. Used for the navigate prompt.
    """
    def truncate_section(s: Section) -> dict:
        return {
            "id": s.id,
            "level": s.level,
            "number": s.number,
            "title": s.title,
            "page": s.page,
            "text": s.text[:max_chars] + ("..." if len(s.text) > max_chars else ""),
            "children": [truncate_section(c) for c in s.children],
        }

    return {
        "title": tree.title,
        "totalPages": tree.totalPages,
        "totalSections": tree.totalSections,
        "totalSubs": tree.totalSubs,
        "sections": [truncate_section(s) for s in tree.sections],
    }


def get_sections_by_ids(tree: DocumentTree, ids: list[str]) -> list[Section]:
    """
    Retrieve full Section objects (with untruncated text) by their IDs.
    Searches both L1 and L2 sections.
    """
    index: dict[str, Section] = {}
    for s in tree.sections:
        index[s.id] = s
        for child in s.children:
            index[child.id] = child

    return [index[i] for i in ids if i in index]
