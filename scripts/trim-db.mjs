import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/app.db");
db.exec("PRAGMA foreign_keys = ON");

const { count: before } = db.prepare("SELECT COUNT(*) as count FROM resumes").get();
console.log("Resumes before:", before);

// Keep only the first 100 resumes
db.prepare(
  "DELETE FROM resumes WHERE id NOT IN (SELECT id FROM resumes ORDER BY created_at ASC LIMIT 100)"
).run();

// Delete orphaned seeded users
db.prepare(
  "DELETE FROM users WHERE id NOT IN (SELECT user_id FROM resumes) AND email LIKE '%@hf-dataset.local'"
).run();

const { count: after } = db.prepare("SELECT COUNT(*) as count FROM resumes").get();
const { count: users } = db.prepare("SELECT COUNT(*) as count FROM users").get();
console.log("Resumes after:", after);
console.log("Users after  :", users);
db.close();
