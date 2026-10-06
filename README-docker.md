# Docker quickstart

Both services read secrets from `.env` (copy `.env.example` and fill it in first).

```bash
docker compose up -d --build
```

- Frontend: http://localhost:3000 (OAuth callback URLs must use `http://localhost:3000`)
- Backend: http://localhost:8000 (the frontend reaches it internally at `http://backend:8000`)

Data persists in named volumes, separate from your local `data/` folder:

- `web-data` — SQLite auth/app DB and uploaded resume PDFs (`/app/data` in the frontend)
- `vector-data` — Chroma vector store (`/app/data/vectorstore` in the backend)

`docker compose down` keeps the volumes; `docker compose down -v` wipes them.
