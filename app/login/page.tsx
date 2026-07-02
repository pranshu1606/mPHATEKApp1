import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/login-panel";
import { getEnabledProviders } from "@/lib/auth-options";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="shell">
      <section className="auth-card">
        <span className="eyebrow">Sign in</span>
        <h1>Sign in to the resume portal</h1>
        <p>
          Existing users can sign in here. New users should use the signup page, which provisions a resume-upload
          account automatically.
        </p>
        <LoginPanel buttonPrefix="Sign in with" callbackUrl="/dashboard" providers={getEnabledProviders()} />
        <div className="button-row">
          <a className="secondary-button" href="/signup">
            New user sign up
          </a>
        </div>
      </section>
    </main>
  );
}
