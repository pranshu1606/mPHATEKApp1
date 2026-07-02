import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import { getOrganisationById, isOrgAdmin } from "@/lib/organisations";
import { insertJobDescription, listJobDescriptionsForOrg } from "@/lib/resumes";
import { getSession } from "@/lib/session";

// POST /api/organisations/[orgId]/jobs — Post a new job role
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orgId: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await context.params;
  const org = getOrganisationById(orgId);
  if (!org) return NextResponse.json({ message: "Organisation not found" }, { status: 404 });

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isAdmin = isOrgAdmin(session.user.id, orgId);

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ message: "Forbidden — only org admins can post jobs" }, { status: 403 });
  }

  const body = (await request.json()) as { title?: string; description?: string };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!title || !description) {
    return NextResponse.json({ message: "title and description are required" }, { status: 400 });
  }

  try {
    insertJobDescription({
      orgId,
      userId: session.user.id,
      title,
      description
    });

    const jobDescriptions = listJobDescriptionsForOrg(orgId);
    return NextResponse.json({ success: true, jobDescriptions }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to post job" },
      { status: 500 }
    );
  }
}
