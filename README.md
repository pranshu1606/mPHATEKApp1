# Resume Screening Portal

Fresh Next.js app with:

- Third-party login via `GitHub` or `Google`
- Concurrent multi-user sessions with NextAuth database sessions
- Roles: `member`, `editor`, `admin`, `super_admin`
- Resume upload flow for new joinees
- Admin resume review, parsed data viewing, and AI candidate scoring
- Server-enforced RBAC rules backed by direct SQLite queries
- Python FastAPI resume backend with LangChain parsing, Chroma vector storage, and AI scoring

## Setup

1. Update `.env` with a real `NEXTAUTH_SECRET`, a `GEMINI_API_KEY`, and optional `DATABASE_PATH`.
2. Add either `GITHUB_ID` / `GITHUB_SECRET` or `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. Set `SUPER_ADMIN_EMAIL` to the email that should receive the first `super_admin` role.
4. Set `ADMIN_DASHBOARD_EMAILS` to extra comma-separated emails that may still access dashboard controls.
5. Install Python backend dependencies from `backend/requirements.txt`.
6. Run `npm run dev:all` to start both services together, or use `npm run dev:backend` and `npm run dev` in separate terminals.
7. Open `http://localhost:3003`.

## Access Rules

- `member`: default role for new joinees, can upload a resume
- `editor`: can upload a resume and review parsed resume data
- `admin`: can view resume data and score candidates with AI
- `super_admin`: can assign all roles and edit all role permissions except the locked `super_admin` role

The main portal is at `/dashboard/resumes`.
`SUPER_ADMIN_EMAIL` is still treated as the founder account for role bootstrapping.

## Backend

The resume ingestion and scoring pipeline now lives in Python under [`backend/`](backend). The Next.js app keeps auth and the UI, then forwards resume upload, dashboard snapshot, scoring, and PDF download requests to the FastAPI service.

Set `RESUME_BACKEND_URL` if the Python service runs somewhere other than `http://127.0.0.1:8000`.
Set `RESUME_EMBEDDINGS_MODEL` only if you want to override the default `gemini-embedding-2` embedding model.

The backend stores parsed resume data in SQLite and indexed resume chunks in Chroma so the LangChain assistant can retrieve evidence for scoring and Q&A.

## Database

The Next.js auth layer keeps its SQLite tables under `data/app.db` by default; set `DATABASE_PATH` to use a different local database file.
Uploaded PDFs are stored under `data/resumes/` unless `RESUME_STORAGE_DIR` is set.
The Python backend uses `data/python-backend.db` and `data/vectorstore/` by default.
