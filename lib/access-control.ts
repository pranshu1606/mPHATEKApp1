import { createId, database, now } from "@/lib/database";
import { getOrganisationBySlug, getOrgsForUser, isOrgMember } from "@/lib/organisations";

// System role slugs
export const SYSTEM_ROLE_SLUGS = {
  member: "member",
  editor: "editor",
  admin: "admin",
  superAdmin: "super_admin"
} as const;

export const DEFAULT_PERMISSIONS = [
  {
    slug: "upload_resume",
    name: "Upload resume",
    description: "Allows uploading a resume into the system."
  },
  {
    slug: "view_resume_data",
    name: "View resume data",
    description: "Allows reviewing parsed resume data from other users."
  },
  {
    slug: "score_candidates",
    name: "Score candidates",
    description: "Allows running AI scoring against uploaded resumes."
  },
  {
    slug: "manage_users",
    name: "Manage users",
    description: "Allows changing user roles from the dashboard."
  },
  {
    slug: "manage_role_permissions",
    name: "Manage role permissions",
    description: "Allows updating which permissions are attached to a role."
  },
  {
    slug: "delete_resumes",
    name: "Delete resumes",
    description: "Allows deleting resumes from the system."
  }
] as const;

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  [SYSTEM_ROLE_SLUGS.member]: ["upload_resume"],
  [SYSTEM_ROLE_SLUGS.editor]: ["upload_resume", "view_resume_data", "score_candidates"],
  [SYSTEM_ROLE_SLUGS.admin]: [
    "upload_resume",
    "view_resume_data",
    "score_candidates",
    "manage_users",
    "manage_role_permissions",
    "delete_resumes"
  ],
  [SYSTEM_ROLE_SLUGS.superAdmin]: [
    "upload_resume",
    "view_resume_data",
    "score_candidates",
    "manage_users",
    "manage_role_permissions",
    "delete_resumes"
  ]
};

const ROLE_DEFINITIONS = [
  { slug: SYSTEM_ROLE_SLUGS.member, name: "Member", description: "Default role for members." },
  { slug: SYSTEM_ROLE_SLUGS.editor, name: "Editor", description: "Can upload and review resume data." },
  { slug: SYSTEM_ROLE_SLUGS.admin, name: "Admin", description: "Can manage users and score candidates." },
  { slug: SYSTEM_ROLE_SLUGS.superAdmin, name: "Super Admin", description: "Full system control." }
] as const;

type RoleRow = { id: string; slug: string; name: string; description: string | null };
type PermissionRow = { id: string; slug: string; name: string; description: string | null };
type UserRoleDetails = { id: string; role: string; email: string | null };

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);
  const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
  return Boolean(normalizedEmail && superAdminEmail && normalizedEmail === superAdminEmail);
}

// Alias for legacy usage
export const isFounderEmail = isSuperAdminEmail;

export function getAccessibleDashboardSlugs(email: string | null | undefined): string[] {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const slugs: string[] = [];

  // Super admin always gets the super-admin dashboard first
  if (isSuperAdminEmail(normalizedEmail)) {
    slugs.push("super-admin");
  }

  // Then any org slugs the user belongs to
  const user = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail) as { id: string } | undefined;

  if (user) {
    const orgs = getOrgsForUser(user.id);
    for (const org of orgs) {
      slugs.push(org.slug);
    }
  }

  return slugs;
}

export function getCompanyDashboardForEmail(email: string | null | undefined): string | null {
  const slugs = getAccessibleDashboardSlugs(email);
  return slugs[0] ?? null;
}

export function getAllCompanyDashboardSlugs(): string[] {
  return ["super-admin"];
}

export function canAccessCompanyDashboard(params: {
  email: string | null | undefined;
  companySlug: string;
}): boolean {
  const normalizedEmail = normalizeEmail(params.email);
  if (!normalizedEmail) return false;

  // Super admin can access the super-admin dashboard and any org
  if (isSuperAdminEmail(normalizedEmail)) return true;

  if (params.companySlug === "super-admin") return false;

  // Check org membership
  const user = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(normalizedEmail) as { id: string } | undefined;
  if (!user) return false;

  const org = getOrganisationBySlug(params.companySlug);
  if (!org) return false;

  return isOrgMember(user.id, org.id);
}

export function canAccessAdminDashboard(email: string | null | undefined): boolean {
  return isSuperAdminEmail(email);
}

export function slugifyRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function isRoleSlugValid(slug: string) {
  return /^[a-z][a-z0-9_]*$/.test(slug);
}

export async function ensureAccessModelInitialized() {
  const timestamp = now();

  for (const permission of DEFAULT_PERMISSIONS) {
    database
      .prepare(
        `INSERT INTO permissions (id, slug, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at`
      )
      .run(createId(), permission.slug, permission.name, permission.description, timestamp, timestamp);
  }

  for (const role of ROLE_DEFINITIONS) {
    database
      .prepare(
        `INSERT INTO roles (id, slug, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at`
      )
      .run(createId(), role.slug, role.name, role.description, timestamp, timestamp);
  }

  const roles = database.prepare("SELECT id, slug FROM roles").all() as Array<Pick<RoleRow, "id" | "slug">>;

  for (const role of roles) {
    for (const permissionSlug of DEFAULT_ROLE_PERMISSIONS[role.slug] ?? []) {
      const permission = database
        .prepare("SELECT id FROM permissions WHERE slug = ?")
        .get(permissionSlug) as { id: string } | undefined;

      if (permission) {
        database
          .prepare(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id, assigned_at) VALUES (?, ?, ?)`
          )
          .run(role.id, permission.id, timestamp);
      }
    }
  }
}

export async function ensureUserRole(user: { id: string; email: string | null; roleId: string | null }) {
  await ensureAccessModelInitialized();

  const currentUser = database
    .prepare("SELECT role_id, email FROM users WHERE id = ?")
    .get(user.id) as { role_id: string | null; email: string | null } | undefined;

  const roleId = currentUser?.role_id ?? user.roleId;
  const email = normalizeEmail(currentUser?.email ?? user.email);
  const superAdminEmail = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);

  const desiredRoleSlug =
    email && superAdminEmail && email === superAdminEmail
      ? SYSTEM_ROLE_SLUGS.superAdmin
      : roleId
        ? null
        : SYSTEM_ROLE_SLUGS.member;

  if (!desiredRoleSlug) return;

  const role = getRoleBySlug(desiredRoleSlug);
  if (role) updateUserRole(user.id, role.id);
}

export async function getUserAccess(userId: string) {
  const role = database
    .prepare(
      `SELECT r.slug FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(userId) as { slug: string | null } | undefined;

  const roleSlug = role?.slug ?? SYSTEM_ROLE_SLUGS.member;

  const permissions = database
    .prepare(
      `SELECT p.slug FROM users u
       INNER JOIN role_permissions rp ON rp.role_id = u.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = ? ORDER BY p.slug`
    )
    .all(userId) as Array<{ slug: string }>;

  return {
    roleSlug,
    permissions: role?.slug ? permissions.map((p) => p.slug) : ["upload_resume"]
  };
}

export function getUserRole(userId: string) {
  return database
    .prepare(
      `SELECT u.id, COALESCE(r.slug, ?) AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(SYSTEM_ROLE_SLUGS.member, userId) as { id: string; role: string } | undefined;
}

export function getUserRoleDetails(userId: string) {
  return database
    .prepare(
      `SELECT u.id, u.email, COALESCE(r.slug, ?) AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(SYSTEM_ROLE_SLUGS.member, userId) as UserRoleDetails | undefined;
}

export function getRoleBySlug(slug: string) {
  return database
    .prepare("SELECT id, slug, name, description FROM roles WHERE slug = ?")
    .get(slug) as RoleRow | undefined;
}

export function getRoleById(id: string) {
  return database
    .prepare("SELECT id, slug, name, description FROM roles WHERE id = ?")
    .get(id) as RoleRow | undefined;
}

export function createRole(input: { name: string; slug: string; description: string | null }) {
  if (!isRoleSlugValid(input.slug)) {
    throw new Error("Role slug must start with a letter and use only lowercase letters, numbers, or underscores");
  }

  const roleId = createId();
  const timestamp = now();

  database
    .prepare(
      `INSERT INTO roles (id, slug, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(roleId, input.slug, input.name, input.description, timestamp, timestamp);

  return getRoleById(roleId);
}

export function updateUserRole(userId: string, roleId: string) {
  database
    .prepare("UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?")
    .run(roleId, now(), userId);
}

export function allPermissionsExist(permissionIds: string[]) {
  if (permissionIds.length === 0) return true;
  const placeholders = permissionIds.map(() => "?").join(", ");
  const result = database
    .prepare(`SELECT COUNT(*) AS count FROM permissions WHERE id IN (${placeholders})`)
    .get(...permissionIds) as { count: number };
  return result.count === new Set(permissionIds).size && result.count === permissionIds.length;
}

export function replaceRolePermissions(roleId: string, permissionIds: string[]) {
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(roleId);
    const insert = database.prepare(
      `INSERT INTO role_permissions (role_id, permission_id, assigned_at) VALUES (?, ?, ?)`
    );
    for (const permissionId of permissionIds) {
      insert.run(roleId, permissionId, now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function canCreateRole(actorRole: string) {
  return actorRole === SYSTEM_ROLE_SLUGS.superAdmin;
}

export function canUpdateUserRole(params: {
  actorId: string;
  actorRole: string;
  targetUserId: string;
  targetCurrentRole: string;
  targetNextRole: string;
}): boolean {
  const { actorId, actorRole, targetUserId, targetCurrentRole, targetNextRole } = params;
  if (actorId === targetUserId) return false;
  if (actorRole === SYSTEM_ROLE_SLUGS.superAdmin) return true;
  if (actorRole === SYSTEM_ROLE_SLUGS.admin) {
    return (
      targetCurrentRole !== SYSTEM_ROLE_SLUGS.superAdmin &&
      targetNextRole !== SYSTEM_ROLE_SLUGS.superAdmin
    );
  }
  return false;
}

export function canUpdateRolePermissions(params: {
  actorRole: string;
  targetRole: string;
}): boolean {
  const { actorRole, targetRole } = params;
  if (targetRole === SYSTEM_ROLE_SLUGS.superAdmin) return false;
  if (actorRole === SYSTEM_ROLE_SLUGS.superAdmin) return true;
  return actorRole === SYSTEM_ROLE_SLUGS.admin && targetRole === SYSTEM_ROLE_SLUGS.member;
}

export async function getDashboardSnapshot(userId: string, companySlug: string) {
  await ensureAccessModelInitialized();

  const actorAccess = await getUserAccess(userId);
  const actor = database
    .prepare("SELECT email FROM users WHERE id = ?")
    .get(userId) as { email: string | null } | undefined;

  const permissions = database
    .prepare("SELECT id, slug, name, description FROM permissions ORDER BY created_at")
    .all() as PermissionRow[];

  const roles = database
    .prepare("SELECT id, slug, name, description FROM roles ORDER BY created_at")
    .all() as RoleRow[];

  const rolePermissions = database
    .prepare(
      `SELECT rp.role_id, p.id, p.slug FROM role_permissions rp
       INNER JOIN permissions p ON p.id = rp.permission_id ORDER BY p.slug`
    )
    .all() as Array<{ role_id: string; id: string; slug: string }>;

  const users = database
    .prepare(
      `SELECT u.id, u.name, u.email, u.image, COALESCE(r.slug, ?) AS role
       FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.created_at`
    )
    .all(SYSTEM_ROLE_SLUGS.member) as Array<{
      id: string;
      name: string | null;
      email: string | null;
      image: string | null;
      role: string;
    }>;

  return {
    actor: {
      id: userId,
      role: actorAccess.roleSlug,
      permissions: actorAccess.permissions,
      currentCompanySlug: companySlug,
      isSuperAdmin: isSuperAdminEmail(actor?.email),
      canCreateRole: canCreateRole(actorAccess.roleSlug)
    },
    permissions: permissions.map((p) => ({ id: p.id, slug: p.slug, name: p.name, description: p.description })),
    roles: roles.map((role) => ({
      ...role,
      editable: canUpdateRolePermissions({ actorRole: actorAccess.roleSlug, targetRole: role.slug }),
      permissions: rolePermissions.filter((p) => p.role_id === role.id).map((p) => ({ id: p.id, slug: p.slug }))
    })),
    users: users.map((user) => ({
      ...user,
      canEdit: canUpdateUserRole({
        actorId: userId,
        actorRole: actorAccess.roleSlug,
        targetUserId: user.id,
        targetCurrentRole: user.role,
        targetNextRole: user.role
      })
    }))
  };
}
