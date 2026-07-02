import { existsSync, readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import { isOrgAdmin, isOrgMember, getOrganisationById } from "@/lib/organisations";
import { deleteResumeRecord, getResumeFilePath } from "@/lib/resumes";
import { deleteResumeFromBackend } from "@/lib/resume-backend";
import { getSession } from "@/lib/session";
import { database } from "@/lib/database";

// GET /api/resumes/[resumeId] — serve the PDF file
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ resumeId: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { resumeId } = await context.params;
  const row = database
    .prepare("SELECT file_path, mime_type, original_filename, org_id, user_id FROM resumes WHERE id = ?")
    .get(resumeId) as {
      file_path: string;
      mime_type: string | null;
      original_filename: string;
      org_id: string | null;
      user_id: string;
    } | undefined;

  if (!row) {
    return NextResponse.json({ message: "Resume not found" }, { status: 404 });
  }

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isOwner = row.user_id === session.user.id;
  const isAdmin = row.org_id ? isOrgAdmin(session.user.id, row.org_id) : false;
  const isMember = row.org_id ? isOrgMember(session.user.id, row.org_id) : false;

  if (!isSuperAdmin && !isOwner && !isAdmin && !isMember) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!existsSync(row.file_path)) {
    return NextResponse.json({ message: "File not found on disk" }, { status: 404 });
  }

  const fileBuffer = readFileSync(row.file_path);
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": row.mime_type || "application/pdf",
      "Content-Disposition": `inline; filename="${row.original_filename}"`
    }
  });
}

// DELETE /api/resumes/[resumeId] — delete a resume (org admin or super admin only)
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ resumeId: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { resumeId } = await context.params;
  const row = database
    .prepare("SELECT org_id FROM resumes WHERE id = ?")
    .get(resumeId) as { org_id: string | null } | undefined;

  if (!row) {
    return NextResponse.json({ message: "Resume not found" }, { status: 404 });
  }

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isAdmin = row.org_id ? isOrgAdmin(session.user.id, row.org_id) : false;

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ message: "Forbidden — only org admins can delete resumes" }, { status: 403 });
  }

  // Delete from SQLite + disk
  deleteResumeRecord(resumeId);

  // Best-effort delete from ChromaDB (Python backend)
  try {
    await deleteResumeFromBackend(resumeId);
  } catch {
    // If Python backend is down, the SQLite record is already gone — acceptable
  }

  return NextResponse.json({ deleted: resumeId });
}
