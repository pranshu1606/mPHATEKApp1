import { NextRequest, NextResponse } from "next/server";

import { isSuperAdminEmail } from "@/lib/access-control";
import {
  addMemberToOrg,
  createOrgInvite,
  getOrgInvites,
  getOrgMembers,
  getOrganisationById,
  getUserByEmail,
  isOrgAdmin,
  removeMemberFromOrg,
  updateMemberRole
} from "@/lib/organisations";
import { getSession } from "@/lib/session";

// GET /api/organisations/[orgId]/members
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

  if (!isSuperAdmin && !isAdmin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const members = getOrgMembers(orgId);
  const invites = getOrgInvites(orgId);

  return NextResponse.json({ members, invites });
}

// POST /api/organisations/[orgId]/members — invite a user by email
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
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; orgRole?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const orgRole = body.orgRole === "admin" ? "admin" : "member";

  if (!email) {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  // Check if user exists in the system
  const existingUser = getUserByEmail(email);

  if (existingUser) {
    // Add immediately
    addMemberToOrg({
      orgId,
      userId: existingUser.id,
      orgRole,
      invitedBy: session.user.id
    });
    return NextResponse.json({ added: true, email, orgRole }, { status: 201 });
  } else {
    // Create invite — will be accepted on next sign-in
    const invite = createOrgInvite({
      orgId,
      invitedEmail: email,
      invitedBy: session.user.id,
      orgRole
    });
    return NextResponse.json({ invited: true, invite }, { status: 201 });
  }
}

// DELETE /api/organisations/[orgId]/members?userId=xxx — remove a member
export async function DELETE(
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
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!userId) {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }

  // Prevent removing yourself
  if (userId === session.user.id && !isSuperAdmin) {
    return NextResponse.json({ message: "Cannot remove yourself" }, { status: 400 });
  }

  removeMemberFromOrg(orgId, userId);
  return NextResponse.json({ removed: userId });
}

// PATCH /api/organisations/[orgId]/members?userId=xxx — change role
export async function PATCH(
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
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!userId) {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }

  const body = (await request.json()) as { orgRole?: string };
  const orgRole = body.orgRole === "admin" ? "admin" : "member";

  updateMemberRole(orgId, userId, orgRole);
  return NextResponse.json({ updated: userId, orgRole });
}
