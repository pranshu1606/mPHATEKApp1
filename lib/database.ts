import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = path.resolve(process.env.DATABASE_PATH ?? "data/app.db");

type DatabaseGlobal = typeof globalThis & {
  appDatabase?: DatabaseSync;
};

const databaseGlobal = globalThis as DatabaseGlobal;

function createDatabase() {
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA busy_timeout = 5000");
  try {
    database.exec("PRAGMA journal_mode = WAL");
  } catch {
    // Concurrent server workers may attempt the one-time journal transition together.
  }
  database.exec("PRAGMA foreign_keys = ON");

  database.exec(`
    -- Auth tables (NextAuth)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      email_verified TEXT,
      image TEXT,
      role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      UNIQUE (provider, provider_account_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_token TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires TEXT NOT NULL,
      PRIMARY KEY (identifier, token)
    );

    -- Organisation tables
    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_members (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_role TEXT NOT NULL DEFAULT 'member',
      invited_by TEXT,
      joined_at TEXT NOT NULL,
      UNIQUE(org_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS org_invites (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
      invited_email TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      org_role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      UNIQUE(org_id, invited_email)
    );

    -- Resume + scoring tables
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT,
      file_path TEXT NOT NULL,
      extracted_text TEXT NOT NULL DEFAULT '',
      parsed_json TEXT NOT NULL DEFAULT '{}',
      parsed_name TEXT,
      parsed_email TEXT,
      parsed_phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_descriptions (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resume_scores (
      id TEXT PRIMARY KEY,
      job_description_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      score REAL NOT NULL,
      rationale TEXT NOT NULL DEFAULT '',
      ranking INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (job_description_id, resume_id)
    );
  `);

  return database;
}

export const database = databaseGlobal.appDatabase ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  databaseGlobal.appDatabase = database;
}

export function createId() {
  return randomUUID();
}

export function now() {
  return new Date().toISOString();
}
