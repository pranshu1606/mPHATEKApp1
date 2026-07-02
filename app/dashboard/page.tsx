import { redirect } from "next/navigation";

import { getAccessibleDashboardSlugs } from "@/lib/access-control";
import { getSession } from "@/lib/session";
import { listAllJobs, listApplicationsForCandidate } from "@/lib/resumes";
import { CandidateDashboard } from "@/components/candidate-dashboard";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const dashboardSlugs = getAccessibleDashboardSlugs(session.user.email);

  if (dashboardSlugs.length > 0) {
    redirect(`/dashboard/${dashboardSlugs[0]}`);
  }

  // Retrieve candidate portal data
  const jobs = JSON.parse(JSON.stringify(listAllJobs()));
  const applications = JSON.parse(JSON.stringify(listApplicationsForCandidate(session.user.id)));

  return (
    <CandidateDashboard
      sessionUserEmail={session.user.email ?? ""}
      jobs={jobs}
      applications={applications}
    />
  );
}
