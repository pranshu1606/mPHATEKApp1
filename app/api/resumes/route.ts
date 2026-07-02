import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import { isOrgAdmin, isOrgMember, getOrganisationBySlug } from "@/lib/organisations";
import {
  deleteResumeRecord,
  insertJobDescription,
  insertResumeRecord,
  listJobDescriptionsForOrg,
  listResumesForOrg,
  saveResumeFile
} from "@/lib/resumes";
import { processResumeWithBackend } from "@/lib/resume-backend";
import { getSession } from "@/lib/session";
import { createId } from "@/lib/database";

// GET /api/resumes?org=orgSlug — list resumes for an org
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const orgSlug = request.nextUrl.searchParams.get("org") ?? "";
  if (!orgSlug) {
    return NextResponse.json({ message: "org parameter is required" }, { status: 400 });
  }

  const org = getOrganisationBySlug(orgSlug);
  if (!org) return NextResponse.json({ message: "Organisation not found" }, { status: 404 });

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  if (!isSuperAdmin && !isOrgMember(session.user.id, org.id)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const resumes = listResumesForOrg(org.id);
  const jobDescriptions = listJobDescriptionsForOrg(org.id);
  const isAdmin = isSuperAdmin || isOrgAdmin(session.user.id, org.id);

  return NextResponse.json({
    org,
    resumes,
    jobDescriptions,
    latestJobDescription: jobDescriptions[0] ?? null,
    actor: {
      id: session.user.id,
      isAdmin,
      isSuperAdmin,
      canDeleteResumes: isAdmin
    }
  });
}

// POST /api/resumes — upload a resume
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("resume");
  const orgSlug = formData.get("org") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "resume file is required" }, { status: 400 });
  }

  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ message: "Only PDF resumes are supported" }, { status: 400 });
  }

  if (!orgSlug) {
    return NextResponse.json({ message: "org is required" }, { status: 400 });
  }

  const org = getOrganisationBySlug(orgSlug);
  if (!org) return NextResponse.json({ message: "Organisation not found" }, { status: 404 });

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  if (!isSuperAdmin && !isOrgMember(session.user.id, org.id)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const resumeId = createId();
    const fileName = file.name || "resume.pdf";
    const mimeType = file.type || "application/pdf";

    // Store file on disk
    const filePath = saveResumeFile(resumeId, buffer);

    // Send to Python backend for parsing + embedding
    const { parsed, extractedText } = await processResumeWithBackend({
      resumeId,
      orgId: org.id,
      userId: session.user.id,
      fileName,
      mimeType,
      buffer
    });

    // Store metadata in SQLite
    insertResumeRecord({
      id: resumeId,
      userId: session.user.id,
      orgId: org.id,
      originalFilename: fileName,
      mimeType,
      filePath,
      extractedText,
      parsed
    });

    const resumes = listResumesForOrg(org.id);
    return NextResponse.json({ resumeId, resumes }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/resumes] Upload error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to upload resume" },
      { status: 500 }
    );
  }
}