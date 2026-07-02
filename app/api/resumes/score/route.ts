import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import { getOrganisationBySlug, isOrgAdmin, isOrgMember } from "@/lib/organisations";
import {
  insertJobDescription,
  insertResumeScore,
  listJobDescriptionsForOrg,
  listResumesForOrg
} from "@/lib/resumes";
import { searchResumesInBackend } from "@/lib/resume-backend";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    org?: string;
    jobId?: string;
  };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const orgSlug = typeof body.org === "string" ? body.org.trim() : "";
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";

  if (!jobId && (!title || !description)) {
    return NextResponse.json({ message: "title and description (or jobId) are required" }, { status: 400 });
  }

  if (!orgSlug) {
    return NextResponse.json({ message: "org is required" }, { status: 400 });
  }

  const org = getOrganisationBySlug(orgSlug);
  if (!org) return NextResponse.json({ message: "Organisation not found" }, { status: 404 });

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isAdmin = isOrgAdmin(session.user.id, org.id);

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ message: "Forbidden — only org admins can score candidates" }, { status: 403 });
  }

  const { database } = await import("@/lib/database");

  try {
    let jobDescription: { id: string; title: string; description: string };

    if (jobId) {
      const existingJob = database
        .prepare("SELECT id, title, description FROM job_descriptions WHERE id = ?")
        .get(jobId) as { id: string; title: string; description: string } | undefined;

      if (!existingJob) {
        return NextResponse.json({ message: "Selected job listing not found" }, { status: 404 });
      }
      jobDescription = existingJob;
    } else {
      // Create new job description record
      jobDescription = insertJobDescription({
        orgId: org.id,
        userId: session.user.id,
        title,
        description
      });
    }

    const finalTitle = jobDescription.title;
    const finalDescription = jobDescription.description;

    // Get all resumes for this org
    const resumes = listResumesForOrg(org.id);

    if (resumes.length === 0) {
      return NextResponse.json({
        jobDescription,
        rankings: [],
        message: "No resumes uploaded for this organisation yet"
      });
    }

    // Search ChromaDB for best matches
    const searchResults = await searchResumesInBackend({
      query: `${finalTitle}\n\n${finalDescription}`,
      orgId: org.id,
      limit: 50
    });

    // Build score map
    const scoreMap = new Map(searchResults.map((r) => [r.resume_id, r]));

    // Rank all resumes (those without vector results get score 0)
    const ranked = resumes
      .map((resume) => {
        const result = scoreMap.get(resume.id);
        return {
          resumeId: resume.id,
          score: result?.score ?? 0,
          rationale: result
            ? `Vector match score: ${result.score.toFixed(1)}%`
            : "No vector match found",
          ranking: 0,
          userName: resume.userName,
          userEmail: resume.userEmail,
          parsedName: resume.parsed.name,
          parsedEmail: resume.parsed.email,
          skills: resume.parsed.skills.slice(0, 6)
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, ranking: index + 1 }));

    // Persist scores
    for (const entry of ranked) {
      insertResumeScore({
        jobDescriptionId: jobDescription.id,
        resumeId: entry.resumeId,
        score: entry.score,
        rationale: entry.rationale,
        ranking: entry.ranking
      });
    }

    return NextResponse.json({ jobDescription, rankings: ranked });
  } catch (error) {
    console.error("[POST /api/resumes/score] Error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Scoring failed" },
      { status: 500 }
    );
  }
}