import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/login-panel";
import { getEnabledProviders } from "@/lib/auth-options";
import { getSession } from "@/lib/session";

export default async function SignupPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <span className="eyebrow">Sign up</span>
        <h1>Create your resume account</h1>
        <p>
          New accounts join as members. You can upload a resume and participate in the screening workflow.
        </p>
        <LoginPanel buttonPrefix="Sign up with" callbackUrl="/dashboard" providers={getEnabledProviders()} />
      </section>
    </main>
  );
}