# PageIndex — Vectorless RAG: Technical Specification

> **Version:** 1.0
> **Last Updated:** 2026-04-08
> **Status:** Implementation Reference

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [Backend](#4-backend)
5. [Frontend](#5-frontend)
6. [Infrastructure](#6-infrastructure)
7. [API Contract](#7-api-contract)
8. [LLM Client (Placeholder)](#8-llm-client-placeholder)
9. [Security Considerations](#9-security-considerations)

---

## 1. Overview

### 1.1 Problem Statement

Traditional RAG (Retrieval-Augmented Generation) systems rely on vector embeddings and cosine similarity to locate relevant context. This approach requires a vector database, embedding model, chunking strategy, and index maintenance — adding significant operational complexity and cost. Similarity search can also return semantically "close" but contextually irrelevant chunks, degrading answer quality.

### 1.2 Solution Approach

PageIndex replaces the vector pipeline with **structured LLM-navigated retrieval**. Documents are parsed into a hierarchical section tree (a table of contents), and the LLM itself navigates this tree to identify the exact sections relevant to a user query. The selected sections are fetched in full — with untruncated body text — and used as a focused context window for answer generation.

There are no embeddings, no vector index, and no cosine similarity at any stage. The document structure itself is the index.

### 1.3 Key Design Principles

| Principle | Implementation |
|---|---|
| **No vectors / no embeddings** | Section retrieval is performed by LLM reasoning over the document tree structure |
| **Hierarchical indexing** | Documents are represented as a 2-level tree: L1 sections and L2 subsections |
| **Streaming UX** | Answers are streamed token-by-token via Server-Sent Events (SSE) |
| **Citation transparency** | Every answer includes references to the exact sections used |
| **Audit trail** | All questions, responses, and cited sections are persisted to SQLite |
| **In-browser PDF parsing** | PDF text extraction runs entirely client-side via pdf.js — no server-side PDF libraries needed |
| **Swappable LLM backend** | The LLM client is isolated behind a well-defined interface; any conforming provider can be substituted |

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│                                                                  │
│  ┌────────────┐  ┌──────────────────┐  ┌───────────────────────┐│
│  │ UploadZone │  │ DocumentSidebar  │  │      ChatPanel        ││
│  │            │  │                  │  │  ┌───────────────────┐ ││
│  │ PDF/TXT    │  │  TreeNode        │  │  │  MessageBubble    │ ││
│  │ extraction │  │  SectionDetail   │  │  │  CitationRow      │ ││
│  │ (pdf.js)   │  │                  │  │  │  InputBar         │ ││
│  └─────┬──────┘  └──────────────────┘  │  └───────────────────┘ ││
│        │                                └───────────────────────┘│
└────────┼──────────────────────────────────────────────────────────┘
         │  HTTP POST (extracted text)        SSE stream (tokens)
         ▼                                          ▲
┌────────┴──────────────────────────────────────────┴───────────────┐
│                        BACKEND (FastAPI)                           │
│                                                                    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ /ingest  │  │   /session   │  │           /chat              │ │
│  │          │  │              │  │                              │ │
│  │  Tree    │  │ Session CRUD │  │  LangGraph Pipeline          │ │
│  │  Builder │  │              │  │  ┌──────────────┐            │ │
│  └────┬─────┘  └──────────────┘  │  │   navigate   │─┐         │ │
│       │                           │  └──────────────┘ │         │ │
│       │                           │  ┌────────────────▼───────┐ │ │
│       │                           │  │   fetch_sections       │ │ │
│       │                           │  └────────────────┬───────┘ │ │
│       │                           │  ┌────────────────▼───────┐ │ │
│       │                           │  │  generate (SSE stream) │ │ │
│       │                           │  └────────────────────────┘ │ │
│       │                           └──────────────────────────────┘ │
│       ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   SQLite (aiosqlite)                         │  │
│  │   documents │ trees │ sessions │ messages                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              LLM Client (Placeholder — see §8)               │  │
│  │   HuggingFace · OpenAI · Ollama · Anthropic · vLLM/TGI      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request Lifecycle

**Document Ingestion:**
```
User drops PDF/TXT → pdf.js extracts text (client-side)
  → POST /ingest {filename, text}
  → TreeBuilder parses headings into hierarchical tree (3-tier strategy)
  → DocumentTree + document metadata persisted to SQLite
  → Response: {document_id, totalPages, totalSections, totalSubs, tree}
  → POST /session {document_id}
  → Response: {session_id, created_at}
```

**Chat Query:**
```
User submits question → POST /chat {session_id, question}
  → User message saved to SQLite
  → LangGraph pipeline executes:
      1. navigate:       LLM reads truncated tree, returns relevant section IDs
      2. fetch_sections: Full section text retrieved from tree by ID
  → SSE stream opens:
      3. citation event: {type: "citation", sections_used: [...]}
      4. generate:       LLM streams answer; each token → delta event
      5. done event:     {type: "done"}
  → Assistant message + citations persisted to SQLite (finally block)
```

### 2.3 Component Responsibilities

| Component | Responsibility |
|---|---|
| `main.py` | FastAPI application, endpoint routing, CORS middleware, lifespan management, SSE streaming |
| `models.py` | Pydantic schemas for all domain types and request/response contracts |
| `database.py` | Async SQLite persistence (documents, trees, sessions, messages) via aiosqlite |
| `tree_builder.py` | Document parsing: heading detection, tree construction, 3-tier fallback strategy |
| `pipeline.py` | LangGraph StateGraph: navigate → fetch_sections; async streaming generate |
| `App.tsx` | Root React component, all application state, PDF extraction, SSE consumption |
| Frontend components | UI rendering: upload zone, document sidebar, chat panel, citations |

---

## 3. Data Models

### 3.1 Domain Models (Pydantic — `models.py`)

#### Section
```python
class Section(BaseModel):
    id:       str                    # Unique identifier (e.g. "1", "3.2")
    level:    Literal[1, 2]          # Hierarchy depth: 1=L1, 2=L2 subsection
    number:   str                    # Display number matching heading (e.g. "3.2")
    title:    str                    # Section heading text
    page:     int                    # Estimated page number (1-based)
    text:     str                    # Full section body text
    children: List[Section] = []     # L2 subsections (populated for L1 only)
```

#### DocumentTree
```python
class DocumentTree(BaseModel):
    title:         str            # Document title (derived from filename)
    totalPages:    int            # Estimated total page count
    totalSections: int            # Count of L1 sections
    totalSubs:     int            # Count of L2 subsections
    sections:      List[Section]  # Top-level sections with nested children
```

#### Citation
```python
class Citation(BaseModel):
    id:     str   # Section ID referenced in the answer (e.g. "3.1")
    number: str   # Section number for display
    title:  str   # Section title for display
```

#### MessageRecord
```python
class MessageRecord(BaseModel):
    id:            str                          # UUID
    session_id:    str                          # Parent session UUID
    role:          Literal["user", "assistant"] # Message author
    content:       str                          # Message body
    sections_used: Optional[List[Citation]]     # Citations — assistant messages only
    created_at:    str                          # ISO 8601 UTC timestamp
```

### 3.2 Request / Response Schemas

| Schema | Fields | Used By |
|---|---|---|
| `IngestRequest` | `filename: str`, `text: str` | `POST /ingest` |
| `IngestResponse` | `document_id`, `totalPages`, `totalSections`, `totalSubs`, `tree: DocumentTree` | `POST /ingest` |
| `SessionRequest` | `document_id: str` | `POST /session` |
| `SessionResponse` | `session_id: str`, `created_at: str` | `POST /session` |
| `ChatRequest` | `session_id: str`, `question: str` | `POST /chat` |
| `MessagesResponse` | `messages: List[MessageRecord]` | `GET /session/{id}/messages` |
| `HealthResponse` | `status: str`, `version: str` | `GET /health` |

### 3.3 Database Schema (SQLite)

```sql
-- Documents: uploaded file metadata
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,               -- UUID (server-generated)
    filename    TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status      TEXT DEFAULT 'pending'          -- 'pending' | 'ready'
);

-- Trees: serialised DocumentTree JSON per document
CREATE TABLE IF NOT EXISTS trees (
    document_id TEXT PRIMARY KEY REFERENCES documents(id),
    tree_json   TEXT NOT NULL,                  -- Full DocumentTree as JSON
    built_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions: chat sessions linked to a document
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,               -- UUID
    document_id TEXT REFERENCES documents(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages: full chat audit trail
CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY,             -- UUID
    session_id    TEXT REFERENCES sessions(id),
    role          TEXT NOT NULL,                -- 'user' | 'assistant'
    content       TEXT NOT NULL,
    sections_used TEXT,                         -- JSON array of Citation objects (nullable)
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Design Notes:**
- All primary keys are UUIDs generated server-side via `uuid.uuid4()`.
- `tree_json` stores the complete `DocumentTree` serialised via Pydantic's `model_dump_json()`. This avoids a normalised section table and allows full-tree retrieval in a single read.
- `sections_used` in `messages` is a JSON-serialised `List[Citation]`. Only populated for assistant messages; `NULL` for user messages.
- All timestamps are ISO 8601 UTC, generated with `datetime.now(timezone.utc).isoformat()`.
- No connection pooling — each database function opens and closes its own `aiosqlite` connection.

---

## 4. Backend

### 4.1 FastAPI Application (`main.py`)

**Lifespan:** Database tables are initialised on startup via `init_db()` inside an `@asynccontextmanager` lifespan handler.

**CORS:** Explicit allowlist:
```
http://localhost:5173   http://127.0.0.1:5173
http://localhost:5174   http://127.0.0.1:5174
http://localhost:4173
```
All methods and headers permitted (`allow_methods=["*"]`, `allow_headers=["*"]`). Credentials enabled.

**Endpoints:** Five routes — `GET /health`, `POST /ingest`, `POST /session`, `POST /chat`, `GET /session/{id}/messages`. See [§7 — API Contract](#7-api-contract) for full details.

**SSE Streaming (`/chat`):**
The `/chat` endpoint returns a `StreamingResponse` with `media_type="text/event-stream"`. The inner async generator:
1. Saves the user message to SQLite.
2. Invokes `run_pipeline()` — an async generator that yields event dicts.
3. Serialises each event as `data: {json}\n\n` and yields it to the client.
4. In the `finally` block, assembles the full answer text and persists the assistant message with citation metadata.

Response headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no` (prevents nginx proxy buffering).

### 4.2 Tree Builder (`tree_builder.py`)

Converts raw document text into a `DocumentTree`. Uses a **3-tier fallback strategy** with automatic escalation:

#### Tier 1 — Regex Heading Detection (Primary)

Single-pass line scanner. Each line is tested against four compiled regex patterns in order:

| Pattern | Matches | Example |
|---|---|---|
| `L1_RE = re.compile(r"^(\d+)\.\s+([A-Z].{2,70})$")` | Numbered L1 headings | `3. System Architecture` |
| `L2_RE = re.compile(r"^(\d+\.\d+)\s+(.{3,80})$")` | Decimal-numbered L2 headings | `3.2 Data Flow` |
| `ALL_CAPS_RE = re.compile(r"^[A-Z][A-Z\s]{3,58}[A-Z]$")` | ALL-CAPS headings (legal docs) | `COMPLIANCE REQUIREMENTS` |
| `TITLE_LINE_RE = re.compile(r"^[A-Z][A-Za-z0-9 ,\-&'/]{2,78}[A-Za-z0-9)]$")` | Title-case lines (defined but passive) | *(not used in main scan)* |

**Page estimation:** `page = max(1, cumulative_char_count // CHARS_PER_PAGE + 1)` where `CHARS_PER_PAGE = 1800`.

**Text accumulation:** Body text is appended to the current deepest open section — L2 preferred over L1.

**ALL-CAPS handling:** Treated as L1; section number is auto-assigned as `str(len(sections) + 1)`; title is converted to title-case for display.

#### Tier 2 — LLM-Based TOC Generation (Fallback)

Triggered when Tier 1 detects zero headings. Requires `HUGGINGFACE_API_TOKEN` to be set.

1. Document text is numbered line-by-line up to a 24,000-character budget.
2. The `_LLM_TOC_PROMPT` is sent to the LLM (non-streaming, `temperature=0.1`, `max_tokens=1024`).
3. The response is parsed as a JSON array of `{title, start_line, level}` objects.
4. Section text is extracted using `lines[start:next_start]` slices.
5. Page numbers are derived from cumulative character offsets via `line_char_offsets[]`.
6. L2 items are attached as children to the preceding L1 section; sub-numbers are generated as `{parent.number}.{n}`.

Returns `None` (not an empty list) on any failure, allowing the caller to proceed to Tier 3.

#### Tier 3 — Paragraph Splitting (Final Fallback)

Triggered when both Tier 1 and Tier 2 yield no sections.

1. Text is split on double-newline boundaries (`\n\s*\n`).
2. Short paragraphs (`< MIN_PARA_CHARS = 80` chars) are merged into the preceding section.
3. Long paragraphs are subdivided at sentence boundaries (`". "`) into chunks of `FALLBACK_SECTION_CHARS = 1200` chars max (`_split_long_text()`).
4. The first line (up to 80 chars) of each chunk becomes the section title; the remainder becomes body text.

#### Tree Utility Functions

| Function | Signature | Purpose |
|---|---|---|
| `truncate_tree_for_navigation` | `(tree, max_chars=400) -> dict` | Returns JSON-serialisable tree with each section's `text` truncated to `max_chars`. Used to fit the navigate prompt within token limits. |
| `get_sections_by_ids` | `(tree, ids) -> list[Section]` | Retrieves full (untruncated) `Section` objects by ID, searching both L1 and L2 levels. |

### 4.3 Reasoning Pipeline (`pipeline.py`)

Implemented as a **LangGraph `StateGraph`** with typed state (`TypedDict`).

#### Pipeline State

```python
class PipelineState(TypedDict):
    question:               str             # User's query
    tree:                   DocumentTree    # Full document tree (from SQLite)
    truncated_tree_json:    str             # Tree with text truncated to 400 chars/section
    relevant_section_ids:   list[str]       # Section IDs identified by navigate
    citations:              list[Citation]  # Citation metadata for identified sections
    full_section_text:      str             # Formatted text of retrieved sections
```

#### Graph Topology

```
[navigate] ──→ [fetch_sections] ──→ END
```

The graph is compiled once at module level (`_graph = build_graph()`) and reused across requests.

**Node: `navigate`**
- Truncates tree text to 400 chars per section via `truncate_tree_for_navigation()`.
- Formats `NAVIGATE_SYSTEM` prompt with truncated tree JSON and user question.
- Calls the LLM (`temperature=0.1`, `max_tokens=512`, non-streaming).
- Parses response with `_extract_json_array()`: tries direct JSON parse first, then regex `\[.*?\]` extraction as fallback; invalid output defaults to `[]`.
- Builds `Citation` objects and extracts `ids` list.
- Returns: `{truncated_tree_json, relevant_section_ids, citations}`.

**Node: `fetch_sections`**
- Calls `get_sections_by_ids(tree, ids)` to retrieve full `Section` objects.
- **Fallback:** if no sections matched any ID, uses `tree.sections[:2]` (first two L1 sections).
- Formats a structured text block: `[Section N.M] Title\n body\n  [N.M.1] Subtitle\n  body`.
- Returns: `{full_section_text}`.

#### Streaming Generation

Generation runs **outside the graph** to support SSE streaming. The full `run_pipeline()` async generator flow:

1. LangGraph graph is executed synchronously in a `ThreadPoolExecutor(max_workers=1)` via `loop.run_in_executor()`.
2. Citations are emitted as the first SSE event.
3. A producer thread calls `_stream_generate_sync()` with `stream=True` (`temperature=0.3`, `max_tokens=1024`).
4. Tokens are transferred from the producer thread to the async event loop via `asyncio.Queue` + `asyncio.run_coroutine_threadsafe()`.
5. A sentinel object signals stream completion; `future.result()` re-raises any thread exception.
6. A `done` event is emitted after the queue is drained.

#### Prompt Templates

See [§8.7 — Prompt Templates](#87-prompt-templates) for verbatim prompt text.

### 4.4 Database Layer (`database.py`)

All operations use `aiosqlite` for async SQLite access. Each function opens and closes its own connection (no persistent connection pool).

| Function | Signature | Description |
|---|---|---|
| `init_db()` | `async → None` | Creates all four tables if they don't exist. Called once at startup. |
| `save_document()` | `async (filename, tree) → str` | Inserts document + serialised tree. Returns `document_id`. |
| `get_tree()` | `async (document_id) → DocumentTree \| None` | Retrieves and deserialises `DocumentTree` via `model_validate_json()`. |
| `create_session()` | `async (document_id) → tuple[str, str]` | Creates session, returns `(session_id, created_at)`. |
| `get_document_id_for_session()` | `async (session_id) → str \| None` | Resolves session → document link. |
| `save_message()` | `async (session_id, role, content, sections_used) → str` | Persists message; serialises citations as JSON. Returns `message_id`. |
| `get_messages()` | `async (session_id) → List[MessageRecord]` | Returns all messages for a session ordered by `created_at ASC`. |

### 4.5 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.111.0 | HTTP framework, routing, request/response validation |
| `uvicorn[standard]` | 0.30.1 | ASGI server (includes websockets, uvloop) |
| `pydantic` | 2.7.4 | Data validation, serialisation, schema generation |
| `aiosqlite` | 0.20.0 | Async SQLite driver |
| `huggingface-hub` | ≥0.23.4 | *Placeholder LLM client — see §8* |
| `langgraph` | ≥0.2.4 | Graph-based pipeline orchestration |
| `python-dotenv` | ≥1.0.1 | `.env` file loading |
| `python-multipart` | 0.0.9 | Multipart form parsing (FastAPI dependency) |

---

## 5. Frontend

### 5.1 Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI library |
| TypeScript | 5.4 | Type safety across all components |
| Vite | 5.3 | Build tool and dev server |
| Tailwind CSS | 3.4 | Utility-first CSS |
| pdf.js | 3.11.174 (CDN) | In-browser PDF text extraction |

No external state management library (Redux, Zustand, etc.). No CSS-in-JS. No component library.

### 5.2 Application State (`App.tsx`)

All state lives in the root `App` component via `useState` hooks.

| State Variable | Type | Purpose |
|---|---|---|
| `doc` | `DocumentTree \| null` | Parsed document tree returned from `/ingest` |
| `uploadState` | `'idle' \| 'processing' \| 'ready'` | Controls which UI phase is rendered |
| `progress` | `number` | Ingestion progress bar value (0–100) |
| `progressLabel` | `string` | Human-readable label for the current progress step |
| `messages` | `Message[]` | Chat message history (local, not re-fetched from server) |
| `thinking` | `boolean` | `true` while the LLM is generating a response |
| `activeSection` | `string \| null` | Section ID selected in the document sidebar |
| `highlighted` | `Set<string>` | Section IDs cited in the most recent assistant response |
| `sessionId` | `string \| null` | Active chat session UUID |
| `ingestError` | `string \| null` | Error message from document ingestion |

### 5.3 UI Phases

The application renders one of three phases, controlled by `uploadState`:

#### Phase 1: Upload (`idle`)
- **UploadZone:** Drag-and-drop target or file picker button.
- Accepted file types: `.pdf`, `.txt`, `.md`.
- **Sample Document:** Link to load a built-in KYC demo document (`sample-doc.ts`).

#### Phase 2: Processing (`processing`)
- **ProgressOverlay:** Animated progress bar with five labelled steps:
  `Reading document` → `Detecting headings` → `Building tree` → `Extracting text` → `Done`
- Steps advance via `setTimeout` to provide a minimum 3-second visible animation, running concurrently with the actual `/ingest` and `/session` API calls.

#### Phase 3: Chat (`ready`)
- **DocumentSidebar** (left, 240 px): Hierarchical tree view of all sections. Clicking a node opens the full section text in a `SectionDetail` drawer below the tree. Sections cited in the last answer glow green (driven by the `highlighted` state set).
- **ChatPanel** (right, flex): Auto-scrolling message list, starter question chips generated from document section titles, text input bar. Shows a typing indicator while `thinking = true`.

### 5.4 Component Tree

```
App
├── HeaderBar                      # Logo, document name badge, "New Document" reset
├── UploadZone                     # Drag-and-drop zone, file picker, sample doc link
├── ProgressOverlay                # Animated progress bar with step indicators
├── DocumentSidebar                # Left panel (phase: ready)
│   ├── Stat (×3)                  # Pages / Sections / Subsections counts
│   ├── TreeNode (recursive)       # Hierarchical section list; highlights cited nodes
│   └── SectionDetail              # Expandable full-text viewer for selected section
└── ChatPanel                      # Right panel (phase: ready)
    ├── EmptyState                 # Placeholder + starter question chips
    ├── MessageBubble (×N)         # User and assistant message renders
    │   └── CitationRow            # Clickable citation chips (§ number + title)
    └── InputBar                   # Auto-resizing textarea, send button
```

### 5.5 PDF Text Extraction

PDF parsing runs **entirely client-side** using pdf.js loaded via CDN in `index.html`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
```

Extraction flow (`extractPdfText` in `App.tsx`):

1. Read the `File` as an `ArrayBuffer`.
2. Set `pdfjsLib.GlobalWorkerOptions.workerSrc` to the CDN worker URL.
3. Load the PDF via `pdfjsLib.getDocument({ data: arrayBuffer }).promise`.
4. For each page (1 → `numPages`), call `page.getTextContent()`.
5. Iterate `items`; use `item.transform[5]` (Y-coordinate) to detect line breaks — items with a different Y from the previous item emit a newline before their `str`.
6. Concatenate all page texts with `\n` separators.

This Y-position-based line detection preserves heading structure so the backend's regex-based Tier 1 scanner can detect numbered and ALL-CAPS headings correctly.

### 5.6 SSE Stream Consumption

The chat handler reads the SSE stream using the Fetch API's `ReadableStream`:

```
Response body → ReadableStream → TextDecoder → line-split buffer → JSON.parse
```

The buffer accumulates chunks from the decoder. On each `\n\n` boundary a complete SSE frame is extracted, the `data: ` prefix is stripped, and the payload is parsed as JSON.

**Event dispatch:**

| Event Type | Action |
|---|---|
| `citation` | Store `sections_used` array; populate `highlighted` Set with cited IDs |
| `delta` | Append `content` token to the last message's `content` string |
| `done` | Set `thinking = false` |
| `error` | Log error message; set `thinking = false` |

### 5.7 Design System Tokens

| Token | Value | Usage |
|---|---|---|
| Background (primary) | `#07111C` | Main app background |
| Background (elevated) | `#0C1E38` | Cards, input fields, upload zone |
| Background (subtle) | `#090F1E` | Assistant message bubbles |
| Border | `#112236` | Panel borders, dividers |
| Accent (primary) | `#D97706` (amber-600) | Logo, active states, send button, progress bar |
| Accent (citation) | `#86EFAC` (green-300) | Cited sections highlight, citation chips |
| Text (primary) | `#e2e8f0` | Headings, labels, important content |
| Text (secondary) | `#94a3b8` / `#cbd5e1` | Body text, section titles |
| Text (muted) | `#64748b` / `#334155` | Hints, placeholders |
| Font (mono) | SF Mono, Fira Code, monospace | Section numbers, IDs, code |
| Font (sans) | Inter, system-ui, sans-serif | All body text |

---

## 6. Infrastructure

### 6.1 Docker Compose

Two services defined in `docker-compose.yml` (version 3.9):

**`backend`:**
- Build context: `./backend` (Dockerfile: `python:3.11-slim`)
- Port mapping: `8000:8000`
- Environment: loaded from `./backend/.env` via `env_file`
- Volume: named volume `db_data` mounted at `/app/data` for SQLite file persistence across restarts
- Restart policy: `unless-stopped`
- Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`

**`frontend`:**
- Build: multi-stage — `node:20-alpine` for `npm run build`, then `nginx:alpine` for static serving
- Port mapping: `5173:80`
- Depends on `backend` (startup ordering)
- Restart policy: `unless-stopped`
- nginx config: SPA routing via `try_files $uri $uri/ /index.html`; 1-year `Cache-Control: public, immutable` on hashed static assets

**Named volumes:**
```yaml
volumes:
  db_data:
```

### 6.2 Local Development Scripts (PowerShell)

**`start.ps1`** — starts both services for local development:
1. Creates Python venv at `backend/.venv` if absent.
2. Installs `backend/requirements.txt` into the venv.
3. Launches `uvicorn main:app --reload --port 8000` (backend).
4. Installs `frontend/node_modules` if absent (`npm install`).
5. Launches `npm run dev` (Vite dev server on port 5173).
6. Writes both process IDs to `.app-pids`.

**`stop.ps1`** — stops all running services:
1. Reads `.app-pids` and sends `Stop-Process` to stored PIDs.
2. Scans ports 8000, 5173, 5174 for orphaned `python`, `node`, `uvicorn`, `esbuild` processes and kills them.
3. Removes the PID file.

### 6.3 Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `HUGGINGFACE_API_TOKEN` | `""` | **Yes** | Authentication token for the LLM inference provider |
| `HF_MODEL` | `mistralai/Mistral-7B-Instruct-v0.3` | No | Model identifier passed to the LLM client |
| `DATABASE_PATH` | `./pageindex.db` | No | SQLite database file path |
| `APP_VERSION` | `1.0.0` | No | Application version string (reported in `/health`) |
| `VITE_BACKEND_URL` | `http://localhost:8000` | No | Backend base URL injected at frontend build time |

---

## 7. API Contract

Base URL (local dev): `http://localhost:8000`

All request/response bodies are `application/json` unless noted.

---

### 7.1 `GET /health`

**Purpose:** Health check and version probe.

**Response:** `200 OK`
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

### 7.2 `POST /ingest`

**Purpose:** Accept raw extracted document text, build the PageIndex section tree, persist to SQLite, return the tree and metadata.

**Request:**
```json
{
  "filename": "Morrison_KYC_Package_2026.txt",
  "text": "1. Customer Identification\n1.1 Personal Information\nFull Name: James Alexander Morrison\n..."
}
```

**Response:** `200 OK`
```json
{
  "document_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "totalPages": 4,
  "totalSections": 6,
  "totalSubs": 12,
  "tree": {
    "title": "Morrison KYC Package 2026",
    "totalPages": 4,
    "totalSections": 6,
    "totalSubs": 12,
    "sections": [
      {
        "id": "1",
        "level": 1,
        "number": "1",
        "title": "Customer Identification",
        "page": 1,
        "text": "",
        "children": [
          {
            "id": "1.1",
            "level": 2,
            "number": "1.1",
            "title": "Personal Information",
            "page": 1,
            "text": "Full Name: James Alexander Morrison\nDate of Birth: 14 March 1978\n...",
            "children": []
          }
        ]
      }
    ]
  }
}
```

**Error Responses:**
| Status | Condition |
|---|---|
| `400 Bad Request` | `text` field is empty or whitespace-only |
| `422 Unprocessable Entity` | All three parsing tiers failed — no sections could be extracted |

---

### 7.3 `POST /session`

**Purpose:** Create a new chat session linked to a previously ingested document.

**Request:**
```json
{
  "document_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response:** `200 OK`
```json
{
  "session_id": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
  "created_at": "2026-04-08T12:00:00.000000+00:00"
}
```

**Error Responses:**
| Status | Condition |
|---|---|
| `404 Not Found` | `document_id` not found in database |

---

### 7.4 `POST /chat`

**Purpose:** Submit a question and receive a streaming answer via Server-Sent Events.

**Request:**
```json
{
  "session_id": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
  "question": "What is the customer's risk rating?"
}
```

**Response:** `200 OK` — `Content-Type: text/event-stream`

Headers:
```
Cache-Control: no-cache
X-Accel-Buffering: no
```

SSE event sequence:
```
data: {"type": "citation", "sections_used": [{"id": "3.1", "number": "3.1", "title": "Risk Profile"}]}

data: {"type": "delta", "content": "Based"}
data: {"type": "delta", "content": " on"}
data: {"type": "delta", "content": " the onboarding"}
data: {"type": "delta", "content": " assessment,"}
...

data: {"type": "done"}
```

**SSE Event Types:**

| Type | Payload Fields | Description |
|---|---|---|
| `citation` | `sections_used: Citation[]` | Sections identified by the navigate node. Emitted once, before any delta. |
| `delta` | `content: string` | A single generated token. Emitted repeatedly as the LLM streams. |
| `done` | *(none)* | Generation complete. No further events will be sent. |
| `error` | `message: string` | Pipeline or LLM error. Generation may be incomplete. |

**Error Responses (HTTP — before stream opens):**
| Status | Condition |
|---|---|
| `404 Not Found` | `session_id` not found, or linked document tree not in database |

---

### 7.5 `GET /session/{session_id}/messages`

**Purpose:** Retrieve the full chat message history for a session (audit trail).

**Path Parameter:** `session_id` — UUID of an existing session.

**Response:** `200 OK`
```json
{
  "messages": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "session_id": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
      "role": "user",
      "content": "What is the customer's risk rating?",
      "sections_used": null,
      "created_at": "2026-04-08T12:00:00.000000+00:00"
    },
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "session_id": "f9e8d7c6-b5a4-3210-fedc-ba9876543210",
      "role": "assistant",
      "content": "Based on the onboarding assessment, the customer has been assigned a Medium risk rating...",
      "sections_used": [
        {"id": "3.1", "number": "3.1", "title": "Risk Profile"}
      ],
      "created_at": "2026-04-08T12:00:04.512000+00:00"
    }
  ]
}
```

**Error Responses:**
| Status | Condition |
|---|---|
| `404 Not Found` | `session_id` not found in database |

---

## 8. LLM Client (Placeholder)

> **This section documents a placeholder interface.** The current implementation uses the HuggingFace Inference API as a concrete provider. Any team can substitute their preferred LLM backend by implementing the protocol described in §8.4 and updating the two environment variables in §8.6.

### 8.1 Current Implementation

The codebase uses `huggingface_hub.InferenceClient` (synchronous) in two files:

- `pipeline.py` — navigate and generate calls
- `tree_builder.py` — TOC fallback call

The client is instantiated inline at call sites via `_make_client()` in `pipeline.py` and directly via `InferenceClient(token=HF_TOKEN)` in `tree_builder.py`. There is no singleton or dependency injection; swapping providers requires editing these two files.

### 8.2 Required LLM Capabilities

Any replacement LLM client must support:

| Capability | Description |
|---|---|
| **Chat completion** | Standard `messages: [{role, content}]` interface |
| **Streaming** | Token-by-token streaming via an iterable/generator interface (`stream=True`) |
| **Temperature control** | `temperature` parameter (0.0–1.0) for output determinism |
| **Max tokens** | `max_tokens` parameter to bound output length |
| **Structured JSON output** | The navigate call requires the model to reliably produce valid JSON arrays when instructed. Models with poor instruction-following may require a system prompt or grammar-constrained decoding. |

### 8.3 Integration Points

The LLM client is called in exactly **three locations**:

| # | Location | File | Function | Purpose | Parameters |
|---|---|---|---|---|---|
| 1 | **Navigate** | `pipeline.py` | `navigate_node()` | Identify relevant section IDs from truncated tree | `temperature=0.1`, `max_tokens=512`, non-streaming |
| 2 | **Generate** | `pipeline.py` | `_stream_generate_sync()` | Stream final answer from retrieved section text | `temperature=0.3`, `max_tokens=1024`, `stream=True` |
| 3 | **TOC Fallback** | `tree_builder.py` | `_llm_toc_fallback()` | Generate table of contents for unstructured documents | `temperature=0.1`, `max_tokens=1024`, non-streaming |

### 8.4 Abstraction Protocol

To swap the LLM provider, implement the following protocol (Python pseudocode):

```python
from typing import Iterator, Protocol

class CompletionMessage:
    content: str | None

class CompletionChoice:
    message: CompletionMessage   # non-streaming
    delta:   CompletionMessage   # streaming

class CompletionResponse:
    choices: list[CompletionChoice]

StreamChunk = CompletionResponse  # same shape, delta instead of message

class LLMClient(Protocol):
    def chat_completion(
        self,
        model: str,
        messages: list[dict[str, str]],  # [{"role": "user"|"assistant", "content": str}]
        max_tokens: int,
        temperature: float,
        stream: bool = False,
    ) -> CompletionResponse | Iterator[StreamChunk]:
        """
        Non-streaming (stream=False):
            Returns CompletionResponse.
            Access answer via: response.choices[0].message.content

        Streaming (stream=True):
            Returns an Iterator of StreamChunk.
            Access each token via: chunk.choices[0].delta.content  (str | None)
        """
        ...
```

`huggingface_hub.InferenceClient.chat_completion()` already matches this shape. OpenAI's `openai.OpenAI().chat.completions.create()` matches it with minor field name differences.

### 8.5 Supported Provider Examples

| Provider | Client Library | Notes |
|---|---|---|
| **HuggingFace Inference API** | `huggingface_hub.InferenceClient` | Current implementation. Open-source models hosted by HF. |
| **OpenAI / Azure OpenAI** | `openai.OpenAI` | Drop-in compatible chat completion API. |
| **Ollama (local)** | `ollama` or OpenAI-compatible endpoint | For fully offline / air-gapped deployments. |
| **Anthropic Claude** | `anthropic.Anthropic` | Requires message format adaptation (no `system` in `messages`, separate `system` param). |
| **vLLM / TGI** | OpenAI-compatible REST endpoint | Self-hosted model serving; compatible via `openai` client with custom `base_url`. |

### 8.6 Configuration

| Variable | Purpose |
|---|---|
| `HUGGINGFACE_API_TOKEN` | Authentication token for the LLM provider (rename as needed for other providers) |
| `HF_MODEL` | Model identifier passed to the client (e.g. `mistralai/Mistral-7B-Instruct-v0.3`) |

### 8.7 Prompt Templates

All prompts are defined as module-level constants. They are reproduced verbatim below.

---

**Navigate Prompt — `NAVIGATE_SYSTEM` (`pipeline.py`)**

```
You are the PageIndex Navigator for a document intelligence system.
Your sole function is to read the document tree below and identify which sections
contain information relevant to the user's question.
Do not answer the question — only identify the sections.

TREE:
{tree_json}

USER QUESTION: "{question}"

Respond ONLY with a valid JSON array of section objects.
No preamble, no explanation — just the JSON array:
[{"id": "1.2", "number": "1.2", "title": "Section Title"}]
```

*Applied at:* navigate call — `temperature=0.1`, `max_tokens=512`.
*`{tree_json}` is replaced with the JSON-serialised truncated tree (400 chars/section max).*

---

**Generate Prompt — `GENERATE_SYSTEM` (`pipeline.py`)**

```
You are a document review assistant.
Answer the user's question using ONLY the section content provided below.
Be precise and factual.
If the sections do not contain the answer, say so explicitly.

RELEVANT SECTIONS:
{sections_text}

USER QUESTION: "{question}"

Answer directly and concisely based only on the provided sections.
```

*Applied at:* streaming generate call — `temperature=0.3`, `max_tokens=1024`, `stream=True`.
*`{sections_text}` is the formatted output of `fetch_sections_node`.*

---

**TOC Generation Prompt — `_LLM_TOC_PROMPT` (`tree_builder.py`)**

```
Analyze the document below and produce a hierarchical table of contents
with up to 2 levels. Return ONLY a JSON array — no prose.

Each object in the array must have:
  "title"      – a short descriptive section title
  "start_line" – the 1-based line number where the section begins
  "level"      – 1 for a main section, 2 for a subsection

Rules:
• Create 3–20 sections that together cover the entire document.
• Level-2 sections must appear directly after their parent level-1 section.
• Use the document's own headings/topics when they exist;
  otherwise infer logical groupings.

DOCUMENT (lines are numbered):
{numbered_text}

JSON array:
```

*Applied at:* Tier 2 TOC fallback — `temperature=0.1`, `max_tokens=1024`, non-streaming.
*`{numbered_text}` is the document text with 1-based line numbers, budget-limited to 24,000 characters.*

---

## 9. Security Considerations

### 9.1 Input Validation

- All request bodies are validated through Pydantic v2 models with strict typing. Malformed JSON or missing required fields return HTTP `422` automatically.
- Empty document text is explicitly rejected with HTTP `400` before any processing begins.
- File extension filtering is enforced client-side (`.pdf`, `.txt`, `.md`). There is no server-side file type validation — a future hardening step if the API becomes publicly accessible.

### 9.2 CORS

- CORS is configured with an explicit origin allowlist (`localhost:5173`, `5174`, `4173` and `127.0.0.1` variants).
- `allow_methods=["*"]` and `allow_headers=["*"]` are broad. In production, tighten to `["GET", "POST"]` and enumerate required headers.
- The allowlist must be updated or replaced with an environment variable for any deployed environment.

### 9.3 SQL Injection

- All database queries use parameterised statements via aiosqlite's `?` placeholder syntax throughout `database.py`. No string interpolation is used in SQL at any point.

### 9.4 LLM Output Parsing

- Navigate output is parsed defensively via `_extract_json_array()`:
  1. Direct `json.loads()` attempted first.
  2. Regex `\[.*?\]` block extraction as fallback.
  3. On any failure, defaults to `[]` — the pipeline degrades gracefully to the first two L1 sections rather than raising an exception.
- The generate step streams raw LLM output directly to the client. No content filtering or output sanitisation is applied. For sensitive document domains (legal, medical, financial), content moderation middleware should be added.
- Prompt injection via document content or user questions is not mitigated. Documents with adversarially crafted content could influence the LLM's behaviour.

### 9.5 Authentication and Authorisation Gaps

- **No authentication layer exists.** All five API endpoints are publicly accessible without credentials.
- **No session ownership verification.** Any caller with a `session_id` can read its message history or submit questions against it.
- **No rate limiting.** The `/chat` endpoint makes synchronous LLM calls; concurrent requests will queue in the `ThreadPoolExecutor`.

**Recommended additions for production:**
- Add authentication middleware (JWT / API key) to all endpoints.
- Bind sessions to authenticated users; verify ownership on `/chat` and `/session/{id}/messages`.
- Add per-IP and per-user rate limiting.
- Enforce a maximum `text` length on `/ingest` to prevent abuse.

### 9.6 Client-Side PDF Parsing

- PDF binary files are never uploaded to the server — only the extracted plaintext is transmitted. This reduces server-side attack surface and avoids server-side PDF library vulnerabilities.
- pdf.js is loaded from a public CDN (`cdnjs.cloudflare.com`). For security-sensitive or air-gapped deployments, self-host the library and worker script to avoid CDN supply-chain risk.
