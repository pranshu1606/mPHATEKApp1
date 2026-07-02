import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import {
  getOrgInvites,
  getOrgMembers,
  getOrganisationById,
  isOrgAdmin,
  isOrgMember
} from "@/lib/organisations";
import { listJobDescriptionsForOrg, listResumesForOrg } from "@/lib/resumes";
import { getSession } from "@/lib/session";

// GET /api/organisations/[orgId] — full org detail
export async function GET(
  _request: NextRequest,
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
  const isMember = isOrgMember(session.user.id, orgId);

  if (!isSuperAdmin && !isMember) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const members = getOrgMembers(orgId);
  const invites = getOrgInvites(orgId);
  const resumes = listResumesForOrg(orgId);
  const jobDescriptions = listJobDescriptionsForOrg(orgId);

  return NextResponse.json({
    org,
    members,
    invites,
    resumes,
    jobDescriptions,
    viewerRole: isSuperAdmin ? "super_admin" : isAdmin ? "admin" : "member"
  });
}
