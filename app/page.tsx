import Link from "next/link";

import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="shell">
      <section className="landing-card">
        <span className="eyebrow">Resume screening</span>
        <h1>Upload resumes, review candidates, and score them with AI</h1>
        <p>
          Users sign in with a third-party provider, upload PDF resumes to the backend, and let admins review
          parsed candidate data with AI-powered job description scoring.
        </p>
        <div className="button-row">
          <Link className="primary-button" href={session ? "/dashboard" : "/signup"}>
            {session ? "Open dashboard" : "Join now"}
          </Link>
          <Link className="secondary-button" href="/login">
            Sign in
          </Link>
          <Link className="secondary-button" href="/dashboard">
            Resume dashboard
          </Link>
          <a className="secondary-button" href="https://next-auth.js.org/providers/" rel="noreferrer" target="_blank">
            Provider setup guide
          </a>
        </div>
      </section>
    </main>
  );
}
