import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import { getOrganisationById, isOrgAdmin } from "@/lib/organisations";
import { deleteJobDescription, listJobDescriptionsForOrg, toggleJobStatus } from "@/lib/resumes";
import { getSession } from "@/lib/session";
import { database } from "@/lib/database";

// PATCH /api/organisations/[orgId]/jobs/[jobId] — Toggle status (active/paused)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ orgId: string; jobId: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orgId, jobId } = await context.params;
  const org = getOrganisationById(orgId);
  if (!org) return NextResponse.json({ message: "Organisation not found" }, { status: 404 });

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isAdmin = isOrgAdmin(session.user.id, orgId);

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ message: "Forbidden — only org admins can edit jobs" }, { status: 403 });
  }

  const body = (await request.json()) as { status?: string };
  const status = body.status === "paused" ? "paused" : "active";

  try {
    toggleJobStatus(jobId, status);
    const jobDescriptions = listJobDescriptionsForOrg(orgId);
    return NextResponse.json({ success: true, jobDescriptions });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to toggle job status" },
      { status: 500 }
    );
  }
}

// DELETE /api/organisations/[orgId]/jobs/[jobId] — Delete job role
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orgId: string; jobId: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orgId, jobId } = await context.params;
  const org = getOrganisationById(orgId);
  if (!org) return NextResponse.json({ message: "Organisation not found" }, { status: 404 });

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isAdmin = isOrgAdmin(session.user.id, orgId);

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ message: "Forbidden — only org admins can delete jobs" }, { status: 403 });
  }

  try {
    deleteJobDescription(jobId);
    const jobDescriptions = listJobDescriptionsForOrg(orgId);
    return NextResponse.json({ success: true, jobDescriptions });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete job role" },
      { status: 500 }
    );
  }
}
