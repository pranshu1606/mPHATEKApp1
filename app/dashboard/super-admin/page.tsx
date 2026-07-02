import { redirect } from "next/navigation";

import { isSuperAdminEmail } from "@/lib/access-control";
import { getAllOrganisationStats } from "@/lib/organisations";
import { getSession } from "@/lib/session";
import { SuperAdminDashboard } from "@/components/super-admin-dashboard";

export default async function SuperAdminPage() {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!isSuperAdminEmail(session.user.email)) {
    redirect("/dashboard");
  }

  const orgStats = JSON.parse(JSON.stringify(getAllOrganisationStats()));

  return (
    <SuperAdminDashboard
      email={session.user.email ?? ""}
      orgStats={orgStats}
    />
  );
}
