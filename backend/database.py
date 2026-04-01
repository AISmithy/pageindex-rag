import os
import json
import uuid
import aiosqlite
from datetime import datetime, timezone
from typing import Optional, List

from models import DocumentTree, Citation, MessageRecord

DATABASE_PATH = os.getenv("DATABASE_PATH", "./pageindex.db")

CREATE_DOCUMENTS = """
CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status      TEXT DEFAULT 'pending'
)
"""

CREATE_TREES = """
CREATE TABLE IF NOT EXISTS trees (
    document_id TEXT PRIMARY KEY REFERENCES documents(id),
    tree_json   TEXT NOT NULL,
    built_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_MESSAGES = """
CREATE TABLE IF NOT EXISTS messages (
    id            TEXT PRIMARY KEY,
    session_id    TEXT REFERENCES sessions(id),
    role          TEXT NOT NULL,
    content       TEXT NOT NULL,
    sections_used TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)
"""


async def init_db() -> None:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(CREATE_DOCUMENTS)
        await db.execute(CREATE_TREES)
        await db.execute(CREATE_SESSIONS)
        await db.execute(CREATE_MESSAGES)
        await db.commit()


async def save_document(filename: str, tree: DocumentTree) -> str:
    doc_id = str(uuid.uuid4())
    tree_json = tree.model_dump_json()
    now = datetime.now(timezone.utc).isoformat()

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO documents (id, filename, uploaded_at, status) VALUES (?, ?, ?, ?)",
            (doc_id, filename, now, "ready"),
        )
        await db.execute(
            "INSERT INTO trees (document_id, tree_json, built_at) VALUES (?, ?, ?)",
            (doc_id, tree_json, now),
        )
        await db.commit()

    return doc_id


async def get_tree(document_id: str) -> Optional[DocumentTree]:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute(
            "SELECT tree_json FROM trees WHERE document_id = ?", (document_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return DocumentTree.model_validate_json(row[0])


async def create_session(document_id: str) -> tuple[str, str]:
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO sessions (id, document_id, created_at) VALUES (?, ?, ?)",
            (session_id, document_id, now),
        )
        await db.commit()

    return session_id, now


async def get_document_id_for_session(session_id: str) -> Optional[str]:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute(
            "SELECT document_id FROM sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None


async def save_message(
    session_id: str,
    role: str,
    content: str,
    sections_used: Optional[List[Citation]] = None,
) -> str:
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    sections_json = (
        json.dumps([c.model_dump() for c in sections_used]) if sections_used else None
    )

    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content, sections_used, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, session_id, role, content, sections_json, now),
        )
        await db.commit()

    return msg_id


async def get_messages(session_id: str) -> List[MessageRecord]:
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute(
            "SELECT id, session_id, role, content, sections_used, created_at "
            "FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ) as cursor:
            rows = await cursor.fetchall()

    records = []
    for row in rows:
        sections = None
        if row[4]:
            raw = json.loads(row[4])
            sections = [Citation(**c) for c in raw]
        records.append(
            MessageRecord(
                id=row[0],
                session_id=row[1],
                role=row[2],
                content=row[3],
                sections_used=sections,
                created_at=row[5],
            )
        )
    return records
