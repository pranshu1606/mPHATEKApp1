from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ParsedProject(BaseModel):
    title: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)


class ParsedResume(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    skills: list[str] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    projects: list[ParsedProject] = Field(default_factory=list)


class ProcessResponse(BaseModel):
    resume_id: str
    parsed: ParsedResume
    extracted_text: str = ""


class SearchRequest(BaseModel):
    query: str
    org_id: Optional[str] = None
    resume_ids: Optional[list[str]] = None
    limit: int = 20


class SearchResult(BaseModel):
    resume_id: str
    org_id: str = ""
    score: float
    best_chunk: str = ""


class SearchResponse(BaseModel):
    results: list[SearchResult]
