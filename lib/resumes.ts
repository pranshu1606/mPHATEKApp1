import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createId, database, now } from "@/lib/database";

export type ParsedProject = {
  title: string;
  tech_stack: string[];
  highlights: string[];
};

export type ParsedResume = {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  education: string[];
  projects: ParsedProject[];
};

export type ResumeRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  user_name: string | null;
  user_email: string | null;
  original_filename: string;
  mime_type: string | null;
  file_path: string;
  extracted_text: string;
  parsed_json: string;
  parsed_name: string | null;
  parsed_email: string | null;
  parsed_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type JobDescriptionRow = {
  id: string;
  org_id: string | null;
  created_by_user_id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ResumeScoreRow = {
  id: string;
  job_description_id: string;
  resume_id: string;
  score: number;
  rationale: string;
  ranking: number;
  created_at: string;
  updated_at: string;
};

export type ResumeDashboardItem = {
  id: string;
  userId: string;
  orgId: string | null;
  userName: string | null;
  userEmail: string | null;
  originalFilename: string;
  mimeType: string | null;
  parsed: ParsedResume;
  createdAt: string;
  latestScore: {
    jobDescriptionId: string;
    title: string;
    description: string;
    score: number;
    rationale: string;
    ranking: number;
  } | null;
};

const RESUME_STORAGE_DIR = path.resolve(
  process.env.RESUME_STORAGE_DIR ?? "data/resumes"
);

export function ensureResumeStorageDir() {
  mkdirSync(RESUME_STORAGE_DIR, { recursive: true });
}

function normalizeArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
}

function normalizeParsedResume(
  value: Partial<ParsedResume> & Record<string, unknown>
): ParsedResume {
  return {
    name: typeof value.name === "string" ? value.name.trim() : "",
    email: typeof value.email === "string" ? value.email.trim() : "",
    phone: typeof value.phone === "string" ? value.phone.trim() : "",
    skills: normalizeArray(value.skills),
    education: normalizeArray(value.education),
    projects: Array.isArray(value.projects)
      ? value.projects.map((project) => {
          const entry = project as Record<string, unknown>;
          return {
            title: typeof entry.title === "string" ? entry.title.trim() : "",
            tech_stack: normalizeArray(entry.tech_stack),
            highlights: normalizeArray(entry.highlights)
          };
        })
      : []
  };
}

function readParsedResume(value: string): ParsedResume {
  try {
    return normalizeParsedResume(
      JSON.parse(value) as Record<string, unknown>
    );
  } catch {
    return normalizeParsedResume({});
  }
}

function getLatestScoreForResume(
  resumeId: string,
  jobDescriptionId?: string
): ResumeScoreRow | null {
  if (jobDescriptionId) {
    return (
      (database
        .prepare(
          `SELECT id, job_description_id, resume_id, score, rationale, ranking, created_at, updated_at
           FROM resume_scores WHERE resume_id = ? AND job_description_id = ? LIMIT 1`
        )
        .get(resumeId, jobDescriptionId) as ResumeScoreRow | undefined) ?? null
    );
  }

  return (
    (database
      .prepare(
        `SELECT id, job_description_id, resume_id, score, rationale, ranking, created_at, updated_at
         FROM resume_scores WHERE resume_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(resumeId) as ResumeScoreRow | undefined) ?? null
  );
}

function getJobDescriptionById(id: string): JobDescriptionRow | null {
  return (
    (database
      .prepare(
        `SELECT id, org_id, created_by_user_id, title, description, created_at, updated_at
         FROM job_descriptions WHERE id = ?`
      )
      .get(id) as JobDescriptionRow | undefined) ?? null
  );
}

function mapResumeRow(
  row: ResumeRow,
  scoreRow: ResumeScoreRow | null,
  jobRow: JobDescriptionRow | null
): ResumeDashboardItem {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    userName: row.user_name,
    userEmail: row.user_email,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    parsed: readParsedResume(row.parsed_json),
    createdAt: row.created_at,
    latestScore:
      scoreRow && jobRow
        ? {
            jobDescriptionId: jobRow.id,
            title: jobRow.title,
            description: jobRow.description,
            score: scoreRow.score,
            rationale: scoreRow.rationale,
            ranking: scoreRow.ranking
          }
        : null
  };
}

export function saveResumeFile(
  resumeId: string,
  buffer: Buffer
): string {
  ensureResumeStorageDir();
  const storedPath = path.join(RESUME_STORAGE_DIR, `${resumeId}.pdf`);
  writeFileSync(storedPath, buffer);
  return storedPath;
}

export function insertResumeRecord(params: {
  id: string;
  userId: string;
  orgId: string | null;
  originalFilename: string;
  mimeType: string | null;
  filePath: string;
  extractedText: string;
  parsed: ParsedResume;
}): string {
  const timestamp = now();

  database
    .prepare(
      `INSERT INTO resumes (
        id, user_id, org_id, original_filename, mime_type, file_path,
        extracted_text, parsed_json, parsed_name, parsed_email, parsed_phone,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.id,
      params.userId,
      params.orgId,
      params.originalFilename,
      params.mimeType,
      params.filePath,
      params.extractedText,
      JSON.stringify(params.parsed),
      params.parsed.name || null,
      params.parsed.email || null,
      params.parsed.phone || null,
      timestamp,
      timestamp
    );

  return params.id;
}

export function deleteResumeRecord(resumeId: string): string | null {
  const row = database
    .prepare(`SELECT file_path FROM resumes WHERE id = ?`)
    .get(resumeId) as { file_path: string } | undefined;

  if (!row) return null;

  database.prepare(`DELETE FROM resumes WHERE id = ?`).run(resumeId);

  // Attempt to delete the stored file
  try {
    unlinkSync(row.file_path);
  } catch {
    // File may already be missing; ignore
  }

  return resumeId;
}

export function getResumeFilePath(resumeId: string): string | null {
  const row = database
    .prepare(`SELECT file_path FROM resumes WHERE id = ?`)
    .get(resumeId) as { file_path: string } | undefined;
  return row?.file_path ?? null;
}

export function listResumesForOrg(orgId: string): ResumeDashboardItem[] {
  const latestJob = database
    .prepare(
      `SELECT id, org_id, created_by_user_id, title, description, created_at, updated_at
       FROM job_descriptions WHERE org_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(orgId) as JobDescriptionRow | undefined;

  const rows = database
    .prepare(
      `SELECT r.id, r.user_id, r.org_id, u.name AS user_name, u.email AS user_email,
              r.original_filename, r.mime_type, r.file_path, r.extracted_text,
              r.parsed_json, r.parsed_name, r.parsed_email, r.parsed_phone,
              r.created_at, r.updated_at
       FROM resumes r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.org_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(orgId) as ResumeRow[];

  return rows.map((row) =>
    mapResumeRow(
      row,
      latestJob ? getLatestScoreForResume(row.id, latestJob.id) ?? null : null,
      latestJob ?? null
    )
  );
}

export function listResumesForUser(userId: string): ResumeDashboardItem[] {
  const rows = database
    .prepare(
      `SELECT r.id, r.user_id, r.org_id, u.name AS user_name, u.email AS user_email,
              r.original_filename, r.mime_type, r.file_path, r.extracted_text,
              r.parsed_json, r.parsed_name, r.parsed_email, r.parsed_phone,
              r.created_at, r.updated_at
       FROM resumes r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(userId) as ResumeRow[];

  return rows.map((row) =>
    mapResumeRow(row, getLatestScoreForResume(row.id) ?? null, null)
  );
}

export function listJobDescriptionsForOrg(orgId: string): JobDescriptionRow[] {
  return database
    .prepare(
      `SELECT id, org_id, created_by_user_id, title, description, status, created_at, updated_at
       FROM job_descriptions WHERE org_id = ? ORDER BY created_at DESC`
    )
    .all(orgId) as JobDescriptionRow[];
}

export function insertJobDescription(params: {
  orgId: string;
  userId: string;
  title: string;
  description: string;
}): JobDescriptionRow {
  const id = createId();
  const timestamp = now();

  database
    .prepare(
      `INSERT INTO job_descriptions (id, org_id, created_by_user_id, title, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, params.orgId, params.userId, params.title, params.description, "active", timestamp, timestamp);

  return getJobDescriptionById(id)!;
}

export function insertResumeScore(params: {
  jobDescriptionId: string;
  resumeId: string;
  score: number;
  rationale: string;
  ranking: number;
}): void {
  const timestamp = now();

  database
    .prepare(
      `INSERT INTO resume_scores (id, job_description_id, resume_id, score, rationale, ranking, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(job_description_id, resume_id) DO UPDATE SET
         score = excluded.score,
         rationale = excluded.rationale,
         ranking = excluded.ranking,
         updated_at = excluded.updated_at`
    )
    .run(
      createId(),
      params.jobDescriptionId,
      params.resumeId,
      params.score,
      params.rationale,
      params.ranking,
      timestamp,
      timestamp
    );
}

export type JobWithOrg = JobDescriptionRow & {
  org_name: string;
  org_slug: string;
};

export type CandidateApplication = {
  resume_id: string;
  original_filename: string;
  created_at: string;
  job_id: string;
  job_title: string;
  org_name: string;
  score: number | null;
  rationale: string | null;
};

export function listAllJobs(): JobWithOrg[] {
  return database
    .prepare(
      `SELECT jd.*, o.name AS org_name, o.slug AS org_slug
       FROM job_descriptions jd
       INNER JOIN organisations o ON o.id = jd.org_id
       WHERE jd.status = 'active'
       ORDER BY jd.created_at DESC`
    )
    .all() as JobWithOrg[];
}

export function listApplicationsForCandidate(userId: string): CandidateApplication[] {
  return database
    .prepare(
      `SELECT r.id AS resume_id, r.original_filename, r.created_at,
              jd.id AS job_id, jd.title AS job_title, o.name AS org_name,
              rs.score, rs.rationale
       FROM resumes r
       INNER JOIN resume_scores rs ON rs.resume_id = r.id
       INNER JOIN job_descriptions jd ON jd.id = rs.job_description_id
       INNER JOIN organisations o ON o.id = jd.org_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(userId) as CandidateApplication[];
}

export function toggleJobStatus(jobId: string, status: "active" | "paused"): void {
  database
    .prepare("UPDATE job_descriptions SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, now(), jobId);
}

export function deleteJobDescription(jobId: string): void {
  database.prepare("DELETE FROM job_descriptions WHERE id = ?").run(jobId);
}

export function hasCandidateApplied(userId: string, jobId: string): boolean {
  const row = database
    .prepare(
      `SELECT COUNT(*) as cnt FROM resumes r
       INNER JOIN resume_scores rs ON rs.resume_id = r.id
       WHERE r.user_id = ? AND rs.job_description_id = ?`
    )
    .get(userId, jobId) as { cnt: number } | undefined;
  return (row?.cnt ?? 0) > 0;
}