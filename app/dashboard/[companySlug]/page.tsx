import { redirect } from "next/navigation";

import {
  canAccessCompanyDashboard,
  getAccessibleDashboardSlugs,
  isSuperAdminEmail
} from "@/lib/access-control";
import {
  getOrganisationBySlug,
  getOrgMembers,
  getOrgInvites,
  isOrgAdmin
} from "@/lib/organisations";
import { listJobDescriptionsForOrg, listResumesForOrg } from "@/lib/resumes";
import { getSession } from "@/lib/session";
import { SuperAdminDashboard } from "@/components/super-admin-dashboard";
import { OrgDashboard } from "@/components/org-dashboard";
import { getAllOrganisationStats } from "@/lib/organisations";

export default async function CompanyDashboardPage({
  params
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { companySlug } = await params;

  // Super-admin slug routes to super admin dashboard
  if (companySlug === "super-admin") {
    if (!isSuperAdminEmail(session.user.email)) {
      redirect("/dashboard");
    }
    const orgStats = JSON.parse(JSON.stringify(getAllOrganisationStats()));
    return <SuperAdminDashboard email={session.user.email ?? ""} orgStats={orgStats} />;
  }

  if (!canAccessCompanyDashboard({ email: session.user.email, companySlug })) {
    const slugs = getAccessibleDashboardSlugs(session.user.email);
    if (slugs.length > 0) {
      redirect(`/dashboard/${slugs[0]}`);
    }
    redirect("/login");
  }

  const org = getOrganisationBySlug(companySlug);
  if (!org) {
    const slugs = getAccessibleDashboardSlugs(session.user.email);
    redirect(slugs.length > 0 ? `/dashboard/${slugs[0]}` : "/login");
  }

  const isSuperAdmin = isSuperAdminEmail(session.user.email);
  const isAdmin = isOrgAdmin(session.user.id, org!.id);
  const members = JSON.parse(JSON.stringify(getOrgMembers(org!.id)));
  const invites = JSON.parse(JSON.stringify(getOrgInvites(org!.id)));
  const resumes = JSON.parse(JSON.stringify(listResumesForOrg(org!.id)));
  const jobDescriptions = JSON.parse(JSON.stringify(listJobDescriptionsForOrg(org!.id)));
  const dashboardSlugs = getAccessibleDashboardSlugs(session.user.email);

  return (
    <OrgDashboard
      org={JSON.parse(JSON.stringify(org!))}
      sessionUserId={session.user.id}
      sessionUserEmail={session.user.email ?? ""}
      isSuperAdmin={isSuperAdmin}
      isAdmin={isAdmin}
      members={members}
      invites={invites}
      initialResumes={resumes}
      initialJobDescriptions={jobDescriptions}
      dashboardSlugs={dashboardSlugs}
    />
  );
}
