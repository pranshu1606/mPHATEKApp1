import { NextRequest, NextResponse } from "next/server";

import {
  allPermissionsExist,
  canAccessCompanyDashboard,
  canUpdateRolePermissions,
  getDashboardSnapshot,
  getRoleById,
  getUserRole,
  replaceRolePermissions
} from "@/lib/access-control";
import { getSession } from "@/lib/session";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ roleId: string }> }
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

  const { roleId } = await context.params;
  const body = (await request.json()) as { permissionIds?: string[] };

  if (!Array.isArray(body.permissionIds)) {
    return NextResponse.json({ message: "permissionIds must be an array" }, { status: 400 });
  }

  const actor = getUserRole(session.user.id);
  const role = getRoleById(roleId);

  if (!actor || !role) {
    return NextResponse.json({ message: "Role not found" }, { status: 404 });
  }

  if (!allPermissionsExist(body.permissionIds)) {
    return NextResponse.json({ message: "One or more permissions are invalid" }, { status: 400 });
  }

  const allowed = canUpdateRolePermissions({
    actorRole: actor.role,
    targetRole: role.slug
  });

  if (!allowed) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  replaceRolePermissions(role.id, body.permissionIds);

  const snapshot = await getDashboardSnapshot(session.user.id, companySlug);
  return NextResponse.json(snapshot);
}
