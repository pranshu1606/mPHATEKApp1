import { createId, database, now } from "@/lib/database";

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OrgMember = {
  id: string;
  org_id: string;
  user_id: string;
  org_role: "admin" | "member";
  invited_by: string | null;
  joined_at: string;
  user_name: string | null;
  user_email: string | null;
  user_image: string | null;
};

export type OrgInvite = {
  id: string;
  org_id: string;
  invited_email: string;
  invited_by: string;
  org_role: string;
  created_at: string;
};

export type OrgStats = {
  org: Organisation;
  memberCount: number;
  resumeCount: number;
  adminEmail: string | null;
};

export function slugifyOrgName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createOrganisation(params: {
  name: string;
  slug: string;
  createdBy: string;
}): Organisation {
  const id = createId();
  const timestamp = now();

  database
    .prepare(
      `INSERT INTO organisations (id, name, slug, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, params.name, params.slug, params.createdBy, timestamp, timestamp);

  return getOrganisationById(id)!;
}

export function getAllOrganisations(): Organisation[] {
  return database
    .prepare(
      `SELECT id, name, slug, created_by, created_at, updated_at
       FROM organisations ORDER BY created_at DESC`
    )
    .all() as Organisation[];
}

export function getAllOrganisationStats(): OrgStats[] {
  const orgs = getAllOrganisations();
  return orgs.map((org) => {
    const memberCount = (
      database
        .prepare(`SELECT COUNT(*) as cnt FROM org_members WHERE org_id = ?`)
        .get(org.id) as { cnt: number }
    ).cnt;

    const resumeCount = (
      database
        .prepare(`SELECT COUNT(*) as cnt FROM resumes WHERE org_id = ?`)
        .get(org.id) as { cnt: number }
    ).cnt;

    const adminRow = database
      .prepare(
        `SELECT u.email FROM org_members om
         INNER JOIN users u ON u.id = om.user_id
         WHERE om.org_id = ? AND om.org_role = 'admin'
         LIMIT 1`
      )
      .get(org.id) as { email: string } | undefined;

    return {
      org,
      memberCount,
      resumeCount,
      adminEmail: adminRow?.email ?? null
    };
  });
}

export function getOrganisationById(id: string): Organisation | null {
  return (
    (database
      .prepare(
        `SELECT id, name, slug, created_by, created_at, updated_at
         FROM organisations WHERE id = ?`
      )
      .get(id) as Organisation | undefined) ?? null
  );
}

export function getOrganisationBySlug(slug: string): Organisation | null {
  return (
    (database
      .prepare(
        `SELECT id, name, slug, created_by, created_at, updated_at
         FROM organisations WHERE slug = ?`
      )
      .get(slug) as Organisation | undefined) ?? null
  );
}

export function getOrgsForUser(userId: string): Organisation[] {
  return database
    .prepare(
      `SELECT o.id, o.name, o.slug, o.created_by, o.created_at, o.updated_at
       FROM organisations o
       INNER JOIN org_members om ON om.org_id = o.id
       WHERE om.user_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(userId) as Organisation[];
}

export function getUserOrgRole(userId: string, orgId: string): string | null {
  const row = database
    .prepare(`SELECT org_role FROM org_members WHERE user_id = ? AND org_id = ?`)
    .get(userId, orgId) as { org_role: string } | undefined;
  return row?.org_role ?? null;
}

export function isOrgMember(userId: string, orgId: string): boolean {
  return getUserOrgRole(userId, orgId) !== null;
}

export function isOrgAdmin(userId: string, orgId: string): boolean {
  return getUserOrgRole(userId, orgId) === "admin";
}

export function getOrgMembers(orgId: string): OrgMember[] {
  return database
    .prepare(
      `SELECT om.id, om.org_id, om.user_id, om.org_role, om.invited_by, om.joined_at,
              u.name AS user_name, u.email AS user_email, u.image AS user_image
       FROM org_members om
       INNER JOIN users u ON u.id = om.user_id
       WHERE om.org_id = ?
       ORDER BY om.joined_at ASC`
    )
    .all(orgId) as OrgMember[];
}

export function addMemberToOrg(params: {
  orgId: string;
  userId: string;
  orgRole: "admin" | "member";
  invitedBy: string;
}): void {
  const id = createId();
  const timestamp = now();

  database
    .prepare(
      `INSERT OR IGNORE INTO org_members (id, org_id, user_id, org_role, invited_by, joined_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, params.orgId, params.userId, params.orgRole, params.invitedBy, timestamp);
}

export function updateMemberRole(
  orgId: string,
  userId: string,
  orgRole: "admin" | "member"
): void {
  database
    .prepare(`UPDATE org_members SET org_role = ? WHERE org_id = ? AND user_id = ?`)
    .run(orgRole, orgId, userId);
}

export function removeMemberFromOrg(orgId: string, userId: string): void {
  database
    .prepare(`DELETE FROM org_members WHERE org_id = ? AND user_id = ?`)
    .run(orgId, userId);
}

export function createOrgInvite(params: {
  orgId: string;
  invitedEmail: string;
  invitedBy: string;
  orgRole: "admin" | "member";
}): OrgInvite {
  const id = createId();
  const timestamp = now();
  const email = params.invitedEmail.trim().toLowerCase();

  database
    .prepare(
      `INSERT OR REPLACE INTO org_invites (id, org_id, invited_email, invited_by, org_role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, params.orgId, email, params.invitedBy, params.orgRole, timestamp);

  return {
    id,
    org_id: params.orgId,
    invited_email: email,
    invited_by: params.invitedBy,
    org_role: params.orgRole,
    created_at: timestamp
  };
}

export function getPendingInvitesForEmail(email: string): OrgInvite[] {
  return database
    .prepare(
      `SELECT id, org_id, invited_email, invited_by, org_role, created_at
       FROM org_invites WHERE invited_email = ?`
    )
    .all(email.trim().toLowerCase()) as OrgInvite[];
}

export function getOrgInvites(orgId: string): OrgInvite[] {
  return database
    .prepare(
      `SELECT id, org_id, invited_email, invited_by, org_role, created_at
       FROM org_invites WHERE org_id = ? ORDER BY created_at DESC`
    )
    .all(orgId) as OrgInvite[];
}

export function deleteOrgInvite(id: string): void {
  database.prepare(`DELETE FROM org_invites WHERE id = ?`).run(id);
}

export function getUserByEmail(email: string) {
  return database
    .prepare(`SELECT id, name, email FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as { id: string; name: string | null; email: string } | undefined;
}
