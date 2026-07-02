/**
 * seed-hf-dataset.mjs  (v5 — builds resumes from 03_education.csv)
 *
 * Uses the Suriyaganesh/54k-resume dataset. Builds one candidate per
 * unique person_id found in the education file, composing a resume from
 * their education entries.
 *
 * Usage:
 *   node scripts/seed-hf-dataset.mjs
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import https from "node:https";
import http from "node:http";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_PATH    = path.resolve("data/app.db");
const CACHE_DIR  = path.resolve("data/hf-cache");

// Files already downloaded in previous run
const EDUC_PATH  = path.resolve(CACHE_DIR, "03_education.csv");
const EDUC_URL   = "https://huggingface.co/datasets/Suriyaganesh/54k-resume/resolve/main/03_education.csv";

// The abilities/experience CSVs are LFS (need auth). We skip them and use
// education + skills column only.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() { return new Date().toISOString(); }

async function downloadFile(url, destPath) {
  const { createWriteStream } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;

    function get(currentUrl) {
      const lib = currentUrl.startsWith("https") ? https : http;
      lib.get(currentUrl, { headers: { "User-Agent": "p1_1-seeder/5.0" } }, res => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          let loc = res.headers.location;
          if (loc && !loc.startsWith("http")) loc = new URL(loc, new URL(currentUrl).origin).href;
          res.resume();
          get(loc); return;
        }
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", c => body += c);
          res.on("end", () => reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`)));
          return;
        }
        total = parseInt(res.headers["content-length"] || "0", 10);
        res.on("data", c => {
          downloaded += c.length;
          const mb = (downloaded / 1024 / 1024).toFixed(1);
          const tmb = total > 0 ? `/${(total / 1024 / 1024).toFixed(1)}` : "";
          process.stdout.write(`\r    ${mb}${tmb} MB  `);
        });
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
        res.on("error", reject);
      }).on("error", reject);
    }
    get(url);
  });
}

// Simple but robust CSV parser
function parseCSV(content) {
  const result = [];
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return result;

  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = [];
    let cur = "";
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (inQ && line[j + 1] === '"') { cur += '"'; j++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        values.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || "").replace(/^"|"$/g, "").trim(); });
    result.push(row);
  }
  return result;
}

// Fake names for candidates without real names in the education data
const FIRST_NAMES = ["Alex","Jordan","Morgan","Taylor","Casey","Riley","Drew","Avery","Cameron","Quinn","Blake","Reese","Logan","Hayden","Skyler","Dakota","Emery","Finley","Rowan","Sage"];
const LAST_NAMES  = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Young","Lee"];

function fakeName(seed) {
  const n = parseInt(seed, 10) || Math.floor(Math.random() * 10000);
  return `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(n / FIRST_NAMES.length) % LAST_NAMES.length]}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Resume Dataset Seeder v5 ===");
  console.log("Source: Suriyaganesh/54k-resume (education file)\n");

  await mkdir(CACHE_DIR, { recursive: true });

  // Download education CSV if not cached
  if (!existsSync(EDUC_PATH)) {
    process.stdout.write("Downloading 03_education.csv (~6 MB)... ");
    await downloadFile(EDUC_URL, EDUC_PATH);
    console.log("\n✓ Downloaded\n");
  } else {
    console.log(`✓ Using cached: ${EDUC_PATH}\n`);
  }

  // Parse education CSV
  console.log("Parsing CSV...");
  const raw = await readFile(EDUC_PATH, "utf8");
  const rows = parseCSV(raw);
  console.log(`  Rows parsed: ${rows.length.toLocaleString()}`);
  if (rows.length > 0) console.log(`  Columns: ${Object.keys(rows[0]).join(", ")}\n`);

  // Group education rows by person_id
  const byPerson = new Map();
  for (const row of rows) {
    const pid = row["person_id"] || row["id"] || "";
    if (!pid) continue;
    if (!byPerson.has(pid)) byPerson.set(pid, []);
    byPerson.get(pid).push(row);
  }
  console.log(`  Unique people: ${byPerson.size.toLocaleString()}\n`);

  // Open DB
  console.log(`Opening database: ${DB_PATH}\n`);
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const { count: existingResumes } = db.prepare("SELECT COUNT(*) AS count FROM resumes").get();
  console.log(`Existing resumes: ${existingResumes.toLocaleString()}\n`);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, email_verified, image, role_id, created_at, updated_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?)
  `);

  const insertResume = db.prepare(`
    INSERT INTO resumes (id, user_id, original_filename, mime_type, file_path, extracted_text,
      parsed_json, parsed_name, parsed_email, parsed_phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped  = 0;
  let batch    = 0;
  const COMMIT_EVERY = 500;

  db.prepare("BEGIN").run();

  for (const [personId, educRows] of byPerson) {
    try {
      const name  = fakeName(personId);
      const userId   = randomUUID();
      const resumeId = randomUUID();
      const ts = now();
      const email = `candidate-${userId.slice(0,8)}@hf-dataset.local`;

      // Build education list
      const education = educRows.map(e => {
        const parts = [e.program, e.institution, e.location, e.start_date].filter(Boolean);
        return parts.join(" | ");
      }).filter(Boolean);

      // Build readable resume text
      const resumeText = [
        `Name: ${name}`,
        `\nEducation:`,
        ...education.map(e => `  - ${e}`),
      ].join("\n");

      const parsedJson = JSON.stringify({
        name,
        email: "",
        phone: "",
        skills: [],
        education,
        projects: []
      });

      insertUser.run(userId, name, email, ts, ts);
      insertResume.run(
        resumeId, userId,
        "resume.txt", "text/plain", "",
        resumeText, parsedJson,
        name, null, null,
        ts, ts
      );

      inserted++;
      batch++;
    } catch {
      skipped++;
    }

    if (batch >= COMMIT_EVERY) {
      db.prepare("COMMIT").run();
      db.prepare("BEGIN").run();
      batch = 0;
    }

    if ((inserted + skipped) % 2000 === 0) {
      process.stdout.write(`\r  Inserted: ${inserted.toLocaleString()}, skipped: ${skipped.toLocaleString()}  `);
    }
  }

  db.prepare("COMMIT").run();

  console.log(`\n\n=== Done ===`);
  console.log(`Inserted : ${inserted.toLocaleString()} resumes`);
  console.log(`Skipped  : ${skipped.toLocaleString()}`);

  const { count: finalResumes } = db.prepare("SELECT COUNT(*) AS count FROM resumes").get();
  const { count: finalUsers }   = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  console.log(`\nFinal DB → users: ${finalUsers.toLocaleString()}, resumes: ${finalResumes.toLocaleString()}`);
  db.close();
}

main().catch(err => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
