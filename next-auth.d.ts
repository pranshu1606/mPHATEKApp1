import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      permissions: string[];
      companySlug: string | null;
      companyDashboards: string[];
      isFounder: boolean;
    };
  }
}
