from __future__ import annotations

import json
import os
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import chromadb
from dotenv import load_dotenv
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from .models import ParsedProject, ParsedResume, SearchResult


def normalize_permissions(value: str | list[str] | None) -> list[str]:
    if isinstance(value, list):
        return [entry.strip() for entry in value if entry and entry.strip()]
    if not value:
        return []
    return [entry.strip() for entry in value.split(",") if entry.strip()]


def normalize_project(value: Any) -> ParsedProject:
    if not isinstance(value, dict):
        return ParsedProject()
    return ParsedProject(
        title=str(value.get("title") or "").strip(),
        tech_stack=[str(e).strip() for e in value.get("tech_stack", []) if str(e).strip()],
        highlights=[str(e).strip() for e in value.get("highlights", []) if str(e).strip()],
    )


def normalize_resume(value: Any) -> ParsedResume:
    if not isinstance(value, dict):
        return ParsedResume()
    return ParsedResume(
        name=str(value.get("name") or "").strip(),
        email=str(value.get("email") or "").strip(),
        phone=str(value.get("phone") or "").strip(),
        skills=[str(e).strip() for e in value.get("skills", []) if str(e).strip()],
        education=[str(e).strip() for e in value.get("education", []) if str(e).strip()],
        projects=[normalize_project(p) for p in value.get("projects", []) if isinstance(p, dict)],
    )


@dataclass(frozen=True)
class BackendSettings:
    vector_store_dir: Path = Path(
        os.getenv("RESUME_VECTOR_STORE_PATH", "data/vectorstore")
    ).resolve()
    api_key: str | None = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    llm_model: str = os.getenv("RESUME_LLM_MODEL", "gemini-2.5-flash")
    embeddings_model: str = os.getenv("RESUME_EMBEDDINGS_MODEL", "gemini-embedding-2")


class ResumeService:
    def __init__(self, settings: BackendSettings | None = None):
        self.settings = settings or BackendSettings()
        self.settings.vector_store_dir.mkdir(parents=True, exist_ok=True)
        self._vector_client: chromadb.PersistentClient | None = None
        self._vector_collection: Any | None = None
        self._embeddings: GoogleGenerativeAIEmbeddings | None = None
        self._llm: ChatGoogleGenerativeAI | None = None
        self._splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=180)

    @property
    def llm(self) -> ChatGoogleGenerativeAI:
        if self._llm is None:
            if not self.settings.api_key:
                raise RuntimeError("GOOGLE_API_KEY or GEMINI_API_KEY is required")
            self._llm = ChatGoogleGenerativeAI(
                model=self.settings.llm_model,
                google_api_key=self.settings.api_key,
                temperature=0.2,
            )
        return self._llm

    @property
    def embeddings(self) -> GoogleGenerativeAIEmbeddings:
        if self._embeddings is None:
            if not self.settings.api_key:
                raise RuntimeError("GOOGLE_API_KEY or GEMINI_API_KEY is required")
            self._embeddings = GoogleGenerativeAIEmbeddings(
                model=self.settings.embeddings_model,
                google_api_key=self.settings.api_key,
            )
        return self._embeddings

    @property
    def vector_client(self) -> chromadb.PersistentClient:
        if self._vector_client is None:
            self._vector_client = chromadb.PersistentClient(
                path=str(self.settings.vector_store_dir)
            )
        return self._vector_client

    @property
    def vector_collection(self) -> Any:
        if self._vector_collection is None:
            self._vector_collection = self.vector_client.get_or_create_collection(
                name="resume_chunks",
                metadata={"hnsw:space": "cosine"},
            )
        return self._vector_collection

    def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        prepared = [f"title: none | text: {t}" for t in texts]
        return self.embeddings.embed_documents(prepared)

    def _embed_query(self, text: str) -> list[float]:
        return self.embeddings.embed_query(f"task: search result | query: {text}")

    def _parse_pdf(self, buffer: bytes) -> str:
        try:
            reader = PdfReader(BytesIO(buffer), strict=False)
            pages: list[str] = []
            for page in reader.pages:
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(text.strip())
            return "\n\n".join(pages).strip()
        except Exception:
            return ""

    def _clean_and_parse_json(self, raw_text: str) -> dict:
        t = raw_text.strip()
        # Remove markdown wrapper blocks
        if t.startswith("```"):
            lines = t.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            t = "\n".join(lines).strip()
        
        # Clean trailing garbage if present
        if not t.endswith("}"):
            idx = t.rfind("}")
            if idx != -1:
                t = t[:idx + 1]
        
        try:
            from json_repair import repair_json
            repaired = repair_json(t)
            return json.loads(repaired)
        except Exception:
            return json.loads(t)

    def _parse_resume_text(self, text: str) -> ParsedResume:
        parser = JsonOutputParser(pydantic_object=ParsedResume)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You extract ATS resume data. Return only valid JSON matching the schema exactly. Ensure all output fits the requested Pydantic fields."),
            (
                "user",
                "Extract the key candidate details from this resume.\n\nSchema:\n"
                "{format_instructions}\n\nResume text:\n{resume_text}\n",
            ),
        ])
        try:
            chain = prompt | self.llm | parser
            payload = chain.invoke({
                "resume_text": text,
                "format_instructions": parser.get_format_instructions(),
            })
            return normalize_resume(payload)
        except Exception as gemini_err:
            groq_key = os.getenv("GROQ_API_KEY")
            if not groq_key:
                # If no backup Groq key is configured, re-raise original error
                raise gemini_err

            print(f"[Warning] Gemini API failed: {gemini_err}. Attempting Groq fallback...")
            try:
                from langchain_groq import ChatGroq
                groq_llm = ChatGroq(
                    model="llama-3.3-70b-versatile",
                    groq_api_key=groq_key,
                    temperature=0.1,
                )
                # Query LLM directly to obtain the raw string output
                chain = prompt | groq_llm
                msg = chain.invoke({
                    "resume_text": text,
                    "format_instructions": parser.get_format_instructions(),
                })
                raw_output = str(msg.content)
                parsed_data = self._clean_and_parse_json(raw_output)
                print("[Success] Fallback parser via Groq completed successfully with clean parsing.")
                return normalize_resume(parsed_data)
            except Exception as groq_err:
                print(f"[Error] Groq fallback failed too: {groq_err}")
                # Raise the original Gemini error to indicate the primary failure
                raise gemini_err

    def get_collection(self) -> tuple[Any, bool]:
        """Returns (collection, is_local_fallback) based on Gemini embedding availability."""
        try:
            if not self.settings.api_key:
                raise RuntimeError("No Google API Key configured")
            # Test if Gemini embedding API works
            self.embeddings.embed_query("test query")
            col = self.vector_client.get_or_create_collection(
                name="resume_chunks",
                metadata={"hnsw:space": "cosine"},
            )
            return col, False
        except Exception as e:
            print(f"[Warning] Gemini embedding failed: {e}. Falling back to local ChromaDB embeddings...")
            from chromadb.utils import embedding_functions
            default_ef = embedding_functions.DefaultEmbeddingFunction()
            col = self.vector_client.get_or_create_collection(
                name="local_resume_chunks",
                metadata={"hnsw:space": "cosine"},
                embedding_function=default_ef
            )
            return col, True

    def process_resume(
        self,
        *,
        resume_id: str,
        org_id: str,
        user_id: str,
        original_filename: str,
        file_buffer: bytes,
    ) -> tuple[ParsedResume, str]:
        """Parse a PDF, embed chunks into ChromaDB, return (ParsedResume, extracted_text)."""
        extracted_text = self._parse_pdf(file_buffer)
        parsed = self._parse_resume_text(extracted_text)

        # Remove any existing chunks for this resume_id in both collections to allow clean re-processing
        for col_name in ["resume_chunks", "local_resume_chunks"]:
            try:
                col = self.vector_client.get_collection(name=col_name)
                existing = col.get(where={"resume_id": resume_id})
                if existing and existing.get("ids"):
                    col.delete(ids=existing["ids"])
            except Exception:
                pass

        col, is_local = self.get_collection()
        chunks = self._splitter.split_text(extracted_text)
        if chunks:
            ids = [str(uuid4()) for _ in chunks]
            metadatas = [
                {
                    "resume_id": resume_id,
                    "org_id": org_id,
                    "user_id": user_id,
                    "original_filename": original_filename,
                    "candidate_name": parsed.name,
                    "candidate_email": parsed.email,
                    "chunk_index": i,
                }
                for i, _ in enumerate(chunks)
            ]
            if is_local:
                # If local fallback, ChromaDB auto-embeds using its DefaultEmbeddingFunction
                col.add(
                    ids=ids,
                    documents=chunks,
                    metadatas=metadatas,
                )
            else:
                embeddings = self._embed_texts(chunks)
                col.add(
                    ids=ids,
                    documents=chunks,
                    metadatas=metadatas,
                    embeddings=embeddings,
                )

        return parsed, extracted_text

    def delete_resume(self, resume_id: str) -> None:
        """Remove all chunks for a resume from ChromaDB."""
        for col_name in ["resume_chunks", "local_resume_chunks"]:
            try:
                col = self.vector_client.get_collection(name=col_name)
                existing = col.get(where={"resume_id": resume_id})
                if existing and existing.get("ids"):
                    col.delete(ids=existing["ids"])
            except Exception:
                pass

    def search_resumes(
        self,
        *,
        query: str,
        org_id: str | None = None,
        resume_ids: list[str] | None = None,
        limit: int = 20,
    ) -> list[SearchResult]:
        """Vector-search ChromaDB for resumes matching query, scoped to org if given."""
        where: dict | None = None
        if org_id and resume_ids:
            where = {"$and": [{"org_id": org_id}, {"resume_id": {"$in": resume_ids}}]}
        elif org_id:
            where = {"org_id": org_id}
        elif resume_ids:
            where = {"resume_id": {"$in": resume_ids}}

        col, is_local = self.get_collection()
        try:
            if is_local:
                # Let ChromaDB auto-embed query texts locally
                result = col.query(
                    query_texts=[query],
                    n_results=min(limit * 4, 100),
                    where=where,
                    include=["documents", "metadatas", "distances"],
                )
            else:
                result = col.query(
                    query_embeddings=[self._embed_query(query)],
                    n_results=min(limit * 4, 100),
                    where=where,
                    include=["documents", "metadatas", "distances"],
                )
        except Exception as query_err:
            print(f"[Error] ChromaDB query failed: {query_err}")
            return []

        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]

        # Aggregate by resume_id: keep the best (lowest distance = highest score) chunk
        seen: dict[str, SearchResult] = {}
        for document, metadata, distance in zip(documents, metadatas, distances):
            rid = str(metadata.get("resume_id") or "")
            if not rid:
                continue
            score = max(0.0, min(100.0, (1.0 - float(distance)) * 100.0))
            if rid not in seen or score > seen[rid].score:
                seen[rid] = SearchResult(
                    resume_id=rid,
                    org_id=str(metadata.get("org_id") or ""),
                    score=round(score, 2),
                    best_chunk=str(document)[:500],
                )

        return sorted(seen.values(), key=lambda r: r.score, reverse=True)[:limit]
