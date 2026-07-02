import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { createId, database } from "@/lib/database";
import {
  insertResumeRecord,
  insertResumeScore,
  listApplicationsForCandidate,
  saveResumeFile
} from "@/lib/resumes";
import { processResumeWithBackend, searchResumesInBackend } from "@/lib/resume-backend";

// POST /api/resumes/apply — candidate submits application
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("resume");
  const jobId = formData.get("jobId") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "resume file is required" }, { status: 400 });
  }

  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ message: "Only PDF resumes are supported" }, { status: 400 });
  }

  if (!jobId) {
    return NextResponse.json({ message: "jobId is required" }, { status: 400 });
  }

  // Look up job details
  const job = database
    .prepare("SELECT id, org_id, title, description, status FROM job_descriptions WHERE id = ?")
    .get(jobId) as { id: string; org_id: string; title: string; description: string; status: string } | undefined;

  if (!job) {
    return NextResponse.json({ message: "Job listing not found" }, { status: 404 });
  }

  if (job.status !== "active") {
    return NextResponse.json(
      { message: "This job listing is currently paused and not accepting applications." },
      { status: 400 }
    );
  }

  const { hasCandidateApplied } = await import("@/lib/resumes");
  if (hasCandidateApplied(session.user.id, jobId)) {
    return NextResponse.json(
      { message: "You have already applied for this job role." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const resumeId = createId();
    const fileName = file.name || "resume.pdf";
    const mimeType = file.type || "application/pdf";

    // Save resume to disk
    const filePath = saveResumeFile(resumeId, buffer);

    // Call Python backend to parse + store vector embeddings
    const { parsed, extractedText } = await processResumeWithBackend({
      resumeId,
      orgId: job.org_id,
      userId: session.user.id,
      fileName,
      mimeType,
      buffer
    });

    // Save resume metadata to SQLite
    insertResumeRecord({
      id: resumeId,
      userId: session.user.id,
      orgId: job.org_id,
      originalFilename: fileName,
      mimeType,
      filePath,
      extractedText,
      parsed
    });

    // Automatically score this candidate's resume against the applied job description
    const searchResults = await searchResumesInBackend({
      query: `${job.title}\n\n${job.description}`,
      orgId: job.org_id,
      resumeIds: [resumeId],
      limit: 1
    });

    const result = searchResults[0];
    const score = result?.score ?? 0;
    const rationale = result
      ? `AI Matching Score: ${result.score.toFixed(1)}%\nMatch Snippet:\n"${result.best_chunk}"`
      : "Resume successfully processed. Recruiter will review shortly.";

    // Insert score record
    insertResumeScore({
      jobDescriptionId: job.id,
      resumeId,
      score,
      rationale,
      ranking: 1 // Candidate applications display their exact score match
    });

    // Get updated applications list for candidate
    const applications = listApplicationsForCandidate(session.user.id);

    return NextResponse.json({ success: true, applications });
  } catch (error) {
    console.error("[POST /api/resumes/apply] Application error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to apply" },
      { status: 500 }
    );
  }
}
