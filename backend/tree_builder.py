import re
import uuid
from models import DocumentTree, Section

# Regex patterns from the spec
L1_RE = re.compile(r"^(\d+)\.\s+([A-Z].{2,70})$")
L2_RE = re.compile(r"^(\d+\.\d+)\s+(.{3,80})$")
ALL_CAPS_RE = re.compile(r"^[A-Z][A-Z\s]{3,58}[A-Z]$")

CHARS_PER_PAGE = 1800


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
        if ALL_CAPS_RE.match(line) and current_l1 is None:
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

    total_subs = sum(len(s.children) for s in sections)

    return DocumentTree(
        title=title,
        totalPages=page,
        totalSections=len(sections),
        totalSubs=total_subs,
        sections=sections,
    )


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
