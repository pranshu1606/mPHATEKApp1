import { NextRequest, NextResponse } from "next/server";

import {
  canAccessCompanyDashboard,
  getCompanyDashboardForEmail,
  canUpdateUserRole,
  getDashboardSnapshot,
  getRoleBySlug,
  getUserRoleDetails,
  updateUserRole
} from "@/lib/access-control";
import { getSession } from "@/lib/session";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
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

  const { userId } = await context.params;
  const body = (await request.json()) as { roleSlug?: string };

  if (!body.roleSlug) {
    return NextResponse.json({ message: "roleSlug is required" }, { status: 400 });
  }

  const actor = getUserRoleDetails(session.user.id);
  const targetUser = getUserRoleDetails(userId);
  const nextRole = getRoleBySlug(body.roleSlug);

  if (!actor || !targetUser || !nextRole) {
    return NextResponse.json({ message: "User or role not found" }, { status: 404 });
  }

  if (getCompanyDashboardForEmail(targetUser.email) !== companySlug) {
    return NextResponse.json({ message: "Target user is not in this dashboard" }, { status: 403 });
  }

  const allowed = canUpdateUserRole({
    actorId: actor.id,
    actorRole: actor.role,
    targetUserId: targetUser.id,
    targetCurrentRole: targetUser.role,
    targetNextRole: nextRole.slug
  });

  if (!allowed) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  updateUserRole(targetUser.id, nextRole.id);

  const snapshot = await getDashboardSnapshot(session.user.id, companySlug);
  return NextResponse.json(snapshot);
}
