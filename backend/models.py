from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List, Literal


class Section(BaseModel):
    id: str
    level: Literal[1, 2]
    number: str
    title: str
    page: int
    text: str
    children: List[Section] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


Section.model_rebuild()


class DocumentTree(BaseModel):
    title: str
    totalPages: int
    totalSections: int
    totalSubs: int
    sections: List[Section]


class Citation(BaseModel):
    id: str
    number: str
    title: str


class IngestRequest(BaseModel):
    filename: str
    text: str


class IngestResponse(BaseModel):
    document_id: str
    totalPages: int
    totalSections: int
    totalSubs: int
    tree: DocumentTree


class SessionRequest(BaseModel):
    document_id: str


class SessionResponse(BaseModel):
    session_id: str
    created_at: str


class ChatRequest(BaseModel):
    session_id: str
    question: str


class MessageRecord(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    sections_used: Optional[List[Citation]] = None
    created_at: str


class MessagesResponse(BaseModel):
    messages: List[MessageRecord]


class HealthResponse(BaseModel):
    status: str
    version: str
