from typing import Any

from pydantic import BaseModel, Field


class SaveTranscriptRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Texto da transcrição")
    title: str = Field(default="Transcrição", description="Título do documento")
    formats: list[str] = Field(
        default=["pdf", "txt", "json"], description="Formatos a salvar"
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Dados adicionais"
    )


class TranscriptResponse(BaseModel):
    success: bool
    message: str
    files: dict[str, str]
    metadata: dict[str, Any]


class TranscriptListResponse(BaseModel):
    total: int
    pdfs: list[str]
    texts: list[str]
    metadata: list[str]
