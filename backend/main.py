from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import ProcessResponse, SearchRequest, SearchResponse
from .service import BackendSettings, ResumeService

settings = BackendSettings()
service = ResumeService(settings)
app = FastAPI(title="Resume Processing Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process", response_model=ProcessResponse)
async def process_resume(
    resume_id: str = Form(...),
    org_id: str = Form(...),
    user_id: str = Form(...),
    original_filename: str = Form(...),
    file: UploadFile = File(...),
):
    """Parse a PDF resume, embed chunks into ChromaDB, return parsed data."""
    try:
        buffer = await file.read()
        parsed, extracted_text = service.process_resume(
            resume_id=resume_id,
            org_id=org_id,
            user_id=user_id,
            original_filename=original_filename,
            file_buffer=buffer,
        )
        return ProcessResponse(
            resume_id=resume_id,
            parsed=parsed,
            extracted_text=extracted_text,
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.post("/search", response_model=SearchResponse)
def search_resumes(payload: SearchRequest):
    """Vector search ChromaDB for resumes matching the query, scoped to an org."""
    try:
        results = service.search_resumes(
            query=payload.query,
            org_id=payload.org_id,
            resume_ids=payload.resume_ids,
            limit=payload.limit,
        )
        return SearchResponse(results=results)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.delete("/resumes/{resume_id}")
def delete_resume_chunks(resume_id: str):
    """Remove all vector chunks for a resume from ChromaDB."""
    try:
        service.delete_resume(resume_id)
        return {"deleted": resume_id}
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
