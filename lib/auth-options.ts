import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";

import {
  ensureUserRole,
  getAccessibleDashboardSlugs,
  getCompanyDashboardForEmail,
  getUserAccess,
  isSuperAdminEmail
} from "@/lib/access-control";
import { sqliteAdapter } from "@/lib/auth-adapter";
import {
  addMemberToOrg,
  deleteOrgInvite,
  getOrganisationById,
  getPendingInvitesForEmail,
  getUserByEmail
} from "@/lib/organisations";

type EnabledProvider = { id: "github" | "google"; name: string };

const enabledProviders: EnabledProvider[] = [];

if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  enabledProviders.push({ id: "github", name: "GitHub" });
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  enabledProviders.push({ id: "google", name: "Google" });
}

export function getEnabledProviders() {
  return enabledProviders;
}

export const authOptions: NextAuthOptions = {
  adapter: sqliteAdapter,
  session: { strategy: "database" },
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            allowDangerousEmailAccountLinking: true
          })
        ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true
          })
        ]
      : [])
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async session({ session, user }) {
      const access = await getUserAccess(user.id);
      const companySlug = getCompanyDashboardForEmail(user.email);
      const companyDashboards = getAccessibleDashboardSlugs(user.email);

      if (session.user) {
        session.user.id = user.id;
        session.user.role = access.roleSlug;
        session.user.permissions = access.permissions;
        session.user.companySlug = companySlug;
        session.user.companyDashboards = companyDashboards;
        session.user.isFounder = isSuperAdminEmail(user.email);
      }

      return session;
    }
  },
  events: {
    async createUser({ user }) {
      await ensureUserRole({ id: user.id, email: user.email ?? null, roleId: null });
    },
    async signIn({ user }) {
      await ensureUserRole({ id: user.id, email: user.email ?? null, roleId: null });

      // Automatically accept any pending org invites for this email
      if (user.email) {
        const invites = getPendingInvitesForEmail(user.email);
        for (const invite of invites) {
          const userRecord = getUserByEmail(user.email);
          const org = getOrganisationById(invite.org_id);
          if (userRecord && org) {
            try {
              addMemberToOrg({
                orgId: invite.org_id,
                userId: userRecord.id,
                orgRole: invite.org_role as "admin" | "member",
                invitedBy: invite.invited_by
              });
              deleteOrgInvite(invite.id);
            } catch {
              // If already a member, ignore
            }
          }
        }
      }
    }
  }
};
