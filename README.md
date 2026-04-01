# ◈ PageIndex — Vectorless RAG Chatbot

A document intelligence chatbot that replaces vector similarity search with structured LLM-based reasoning over a hierarchical document tree.

**No vector database. No embeddings. No cosine similarity.**

The LLM navigates a structured table-of-contents tree, pinpoints relevant sections, then answers from the exact retrieved text.

## Architecture

```
Frontend (React + Vite)       Backend (FastAPI + Python)
─────────────────────         ──────────────────────────
Upload & PDF extraction  →   /ingest  →  TreeBuilder
Chat input               →   /chat    →  LangGraph pipeline
SSE stream display       ←             ↓
Citation chips + tree    ←   navigate → fetch_sections → generate (HuggingFace LLM)
                                                         SQLite audit log
```

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set HUGGINGFACE_API_TOKEN
# Get a free token at: https://huggingface.co/settings/tokens

uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### 3. Docker (both services)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your HUGGINGFACE_API_TOKEN

docker compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `HUGGINGFACE_API_TOKEN` | *(required)* | HuggingFace API token |
| `HF_MODEL` | `mistralai/Mistral-7B-Instruct-v0.3` | Open-source chat model |
| `DATABASE_PATH` | `./pageindex.db` | SQLite database path |

### Recommended open-source models

- `mistralai/Mistral-7B-Instruct-v0.3` — default, excellent instruction following
- `HuggingFaceH4/zephyr-7b-beta` — strong for structured tasks
- `meta-llama/Meta-Llama-3.1-8B-Instruct` — very capable (requires HF access agreement)
- `Qwen/Qwen2.5-72B-Instruct` — highest quality, may require Pro tier

## How It Works

1. **Upload** — PDF, TXT, or Markdown document
2. **Tree Construction** — document is parsed into a hierarchical JSON tree (L1/L2 sections) using regex heading detection. No vectors computed.
3. **Navigate** — LLM reads the truncated tree (≤400 chars/section) and identifies relevant section IDs for the query
4. **Fetch Sections** — full text for identified sections is retrieved from SQLite
5. **Generate** — LLM answers from the focused context, streamed back via SSE
6. **Citations** — every answer links to the exact sections used; clicking highlights them in the sidebar

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest` | Upload document text, returns tree |
| `POST` | `/session` | Create chat session |
| `POST` | `/chat` | Stream answer via SSE |
| `GET` | `/session/{id}/messages` | Full message history (audit trail) |
| `GET` | `/health` | Health check |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS |
| PDF parsing | pdf.js v3.11 (in-browser, CDN) |
| Backend | FastAPI 0.111, Python 3.11 |
| LLM pipeline | LangGraph 0.2 |
| LLM | HuggingFace Inference API (open-source models) |
| Database | SQLite + aiosqlite |
| Containerisation | Docker + docker-compose |
