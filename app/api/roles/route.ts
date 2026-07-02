import { NextRequest, NextResponse } from "next/server";

import {
  canAccessAdminDashboard,
  canAccessCompanyDashboard,
  canCreateRole,
  createRole,
  getDashboardSnapshot,
  getRoleBySlug,
  getUserRole,
  slugifyRoleName
} from "@/lib/access-control";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const companySlug = request.nextUrl.searchParams.get("company") ?? "";

  if (!companySlug) {
    return NextResponse.json({ message: "company is required" }, { status: 400 });
  }

  if (!canAccessCompanyDashboard({ email: session.user.email, companySlug })) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const actor = getUserRole(session.user.id);

  if (!actor) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  if (!canAccessAdminDashboard(session.user.email) && !canCreateRole(actor.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    description?: string;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const providedSlug = typeof body.slug === "string" ? body.slug.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const slug = providedSlug || slugifyRoleName(name);

  if (!name) {
    return NextResponse.json({ message: "Role name is required" }, { status: 400 });
  }

  if (!slug) {
    return NextResponse.json({ message: "Role slug is required" }, { status: 400 });
  }

  if (getRoleBySlug(slug)) {
    return NextResponse.json({ message: "A role with that slug already exists" }, { status: 409 });
  }

  try {
    createRole({
      name,
      slug,
      description: description || null
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create role" },
      { status: 400 }
    );
  }

  const snapshot = await getDashboardSnapshot(session.user.id, companySlug);
  return NextResponse.json(snapshot, { status: 201 });
}