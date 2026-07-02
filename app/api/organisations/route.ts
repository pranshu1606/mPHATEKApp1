import { NextRequest, NextResponse } from "next/server";

import {
  canAccessCompanyDashboard,
  isSuperAdminEmail
} from "@/lib/access-control";
import {
  addMemberToOrg,
  createOrganisation,
  getAllOrganisationStats,
  getOrganisationBySlug,
  getOrgsForUser,
  slugifyOrgName
} from "@/lib/organisations";
import { getSession } from "@/lib/session";
import { database } from "@/lib/database";

// GET /api/organisations — list orgs (super admin sees all, user sees their own)
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (isSuperAdminEmail(session.user.email)) {
    const stats = getAllOrganisationStats();
    return NextResponse.json({ organisations: stats });
  }

  const orgs = getOrgsForUser(session.user.id);
  return NextResponse.json({ organisations: orgs.map((org) => ({ org, memberCount: 0, resumeCount: 0, adminEmail: null })) });
}

// POST /api/organisations — super admin creates a new organisation
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ message: "Forbidden — only super admin can create organisations" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    adminEmail?: string;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const adminEmail = typeof body.adminEmail === "string" ? body.adminEmail.trim().toLowerCase() : "";

  if (!name) {
    return NextResponse.json({ message: "Organisation name is required" }, { status: 400 });
  }

  if (!adminEmail) {
    return NextResponse.json({ message: "Admin email is required" }, { status: 400 });
  }

  const slug = slugifyOrgName(name);
  if (!slug) {
    return NextResponse.json({ message: "Invalid organisation name" }, { status: 400 });
  }

  const existing = getOrganisationBySlug(slug);
  if (existing) {
    return NextResponse.json({ message: "An organisation with that name already exists" }, { status: 409 });
  }

  const org = createOrganisation({ name, slug, createdBy: session.user.id });

  // If the admin user already exists, add them immediately
  const adminUser = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(adminEmail) as { id: string } | undefined;

  if (adminUser) {
    addMemberToOrg({
      orgId: org.id,
      userId: adminUser.id,
      orgRole: "admin",
      invitedBy: session.user.id
    });
  } else {
    // Create a pending invite so the admin is auto-added when they sign in
    const { createOrgInvite } = await import("@/lib/organisations");
    createOrgInvite({
      orgId: org.id,
      invitedEmail: adminEmail,
      invitedBy: session.user.id,
      orgRole: "admin"
    });
  }

  return NextResponse.json({ organisation: org }, { status: 201 });
}
