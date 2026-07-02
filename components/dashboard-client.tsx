"use client";

import type { FormEvent } from "react";
import { useState } from "react";

type ParsedProject = {
  title: string;
  tech_stack: string[];
  highlights: string[];
};

type ParsedResume = {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  education: string[];
  projects: ParsedProject[];
};

type ResumeItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  originalFilename: string;
  mimeType: string | null;
  parsed: ParsedResume;
  createdAt: string;
  latestScore: {
    jobDescriptionId: string;
    title: string;
    description: string;
    score: number;
    rationale: string;
    ranking: number;
  } | null;
};

type JobDescriptionItem = {
  id: string;
  created_by_user_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type Snapshot = {
  actor: {
    id: string;
    role: string;
    permissions: string[];
    email: string | null;
    canUploadResume: boolean;
    canViewResumeData: boolean;
    canScoreCandidates: boolean;
    isAdmin: boolean;
  };
  resumes: ResumeItem[];
  jobDescriptions: JobDescriptionItem[];
  latestJobDescription: JobDescriptionItem | null;
};

type DashboardClientProps = {
  initialSnapshot: Snapshot;
};

export function DashboardClient({ initialSnapshot }: DashboardClientProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState(initialSnapshot.latestJobDescription?.title ?? "");
  const [jobDescription, setJobDescription] = useState(initialSnapshot.latestJobDescription?.description ?? "");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoringResults, setScoringResults] = useState<Array<{ resumeId: string; score: number; rationale: string; ranking: number }>>([]);

  async function refreshSnapshot() {
    const response = await fetch("/api/resumes", {
      cache: "no-store",
      credentials: "same-origin"
    });

    let data: Snapshot | { message?: string };
    try {
      data = (await response.json()) as Snapshot | { message?: string };
    } catch {
      throw new Error(`Failed to parse server response: ${response.status} ${response.statusText}`);
    }

    if (!response.ok || !("actor" in data)) {
      throw new Error("message" in data ? data.message : "Failed to refresh dashboard");
    }

    setSnapshot(data);
    setJobTitle(data.latestJobDescription?.title ?? jobTitle);
    setJobDescription(data.latestJobDescription?.description ?? jobDescription);
  }

  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resumeFile) {
      setError("Choose a PDF resume to upload.");
      return;
    }

    setBusyKey("upload");
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);

      const response = await fetch("/api/resumes", {
        method: "POST",
        body: formData,
        credentials: "same-origin"
      });

      let data: { message?: string };
      try {
        data = (await response.json()) as { message?: string };
      } catch {
        throw new Error(`Failed to parse server response: ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to upload resume");
      }

      setResumeFile(null);
      setMessage("Resume uploaded and parsed.");
      await refreshSnapshot();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to upload resume");
    } finally {
      setBusyKey(null);
    }
  }

  async function scoreCandidates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!jobTitle.trim() || !jobDescription.trim()) {
      setError("Enter both a job title and a job description.");
      return;
    }

    setBusyKey("score");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/resumes/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          title: jobTitle,
          description: jobDescription
        })
      });

      let data:
        | { rankings?: Array<{ resumeId: string; score: number; rationale: string; ranking: number }>; message?: string }
        | { message?: string };
      try {
        data = (await response.json()) as any;
      } catch {
        throw new Error(`Failed to parse server response: ${response.status} ${response.statusText}`);
      }

      if (!response.ok || !("rankings" in data)) {
        throw new Error("message" in data ? data.message : "Failed to score candidates");
      }

      setScoringResults(data.rankings ?? []);
      setMessage("Vector search completed.");
      await refreshSnapshot();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to score candidates");
    } finally {
      setBusyKey(null);
    }
  }

  const topCandidate = snapshot.resumes.find((resume) => resume.latestScore?.ranking === 1) ?? null;

  return (
    <div className="dashboard-grid resume-dashboard">
      <section className="panel hero-panel resume-hero">
        <div>
          <span className="eyebrow">Resume portal</span>
          <h2>Signed in as {snapshot.actor.role.replace("_", " ")}</h2>
          <p>
            New joinees upload resumes here. Admins can review parsed candidate data, paste a job description, and
            score the strongest matches with AI.
          </p>
        </div>

        <div className="pill-row">
          {snapshot.actor.permissions.map((permission) => (
            <span className="pill" key={permission}>
              {permission}
            </span>
          ))}
        </div>
      </section>

      {snapshot.actor.canUploadResume ? (
        <section className="panel grid-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Upload</span>
              <h3>Submit a resume</h3>
            </div>
            <p>PDF resumes are extracted, parsed, and stored in the backend for review.</p>
          </div>

          <form className="stack resume-form" onSubmit={uploadResume}>
            <label className="field file-field">
              <span>Resume PDF</span>
              <input
                accept="application/pdf"
                disabled={busyKey === "upload"}
                onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <small>{resumeFile ? resumeFile.name : "Choose a PDF resume to upload"}</small>
            </label>

            <div className="button-row">
              <button className="primary-button" disabled={busyKey === "upload"} type="submit">
                {busyKey === "upload" ? "Uploading..." : "Upload resume"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {snapshot.actor.canScoreCandidates ? (
        <section className="panel grid-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Vector search</span>
              <h3>Find the best resume for a job description</h3>
            </div>
            <p>Paste a JD, and the backend searches the indexed resume chunks to rank the strongest matches.</p>
          </div>

          <form className="role-form resume-form" onSubmit={scoreCandidates}>
            <label className="field">
              <span>Job title</span>
              <input
                disabled={busyKey === "score"}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Frontend Engineer"
                value={jobTitle}
              />
            </label>

            <label className="field field-wide">
              <span>Job description</span>
              <textarea
                disabled={busyKey === "score"}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Describe the role, stack, and must-have experience"
                rows={7}
                value={jobDescription}
              />
            </label>

            <div className="button-row">
              <button className="primary-button" disabled={busyKey === "score"} type="submit">
                {busyKey === "score" ? "Searching..." : "Find best matches"}
              </button>
            </div>
          </form>

          {scoringResults.length > 0 ? (
            <div className="ranking-list">
              {scoringResults.map((result) => {
                const resume = snapshot.resumes.find((item) => item.id === result.resumeId);
                return (
                  <article className="candidate-card" key={result.resumeId}>
                    <div className="candidate-header">
                      <div>
                        <h4>
                          #{result.ranking} {resume?.parsed.name || resume?.userName || "Unnamed candidate"}
                        </h4>
                        <p>{resume?.userEmail ?? resume?.parsed.email ?? "No email provided"}</p>
                      </div>
                      <span className="score-badge">{Math.round(result.score)} / 100</span>
                    </div>
                    <p>{result.rationale}</p>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel grid-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Candidates</span>
            <h3>Parsed resume data</h3>
          </div>
          <p>{snapshot.actor.canViewResumeData ? "Visible to admin reviewers." : "You can only see your own resume."}</p>
        </div>

        {snapshot.resumes.length === 0 ? (
          <div className="empty-state">
            <h4>No resumes uploaded yet</h4>
            <p>Upload a PDF to populate this list.</p>
          </div>
        ) : (
          <div className="resume-grid">
            {snapshot.resumes.map((resume) => (
              <article className="resume-card" key={resume.id}>
                <div className="resume-card-header">
                  <div>
                    <h4>{resume.parsed.name || resume.userName || "Unnamed candidate"}</h4>
                    <p>{resume.userEmail ?? resume.parsed.email ?? "No email provided"}</p>
                  </div>
                  {resume.latestScore ? <span className="badge badge-active">{Math.round(resume.latestScore.score)}%</span> : null}
                </div>

                <div className="resume-chip-row">
                  {resume.parsed.skills.slice(0, 8).map((skill) => (
                    <span className="resume-chip" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>

                <p className="resume-meta">Uploaded {new Date(resume.createdAt).toLocaleString()}</p>

                {resume.parsed.projects.length > 0 ? (
                  <div className="stack project-stack">
                    {resume.parsed.projects.slice(0, 2).map((project) => (
                      <div className="project-card" key={`${resume.id}-${project.title}`}>
                        <strong>{project.title || "Project"}</strong>
                        <small>{project.tech_stack.join(" • ")}</small>
                        <ul>
                          {project.highlights.slice(0, 3).map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}

                {resume.latestScore ? (
                  <div className="score-panel">
                    <strong>
                      Latest score: {Math.round(resume.latestScore.score)} / 100 for {resume.latestScore.title}
                    </strong>
                    <p>{resume.latestScore.rationale}</p>
                  </div>
                ) : null}

                <div className="button-row" style={{ marginTop: "1rem" }}>
                  <a
                    className="secondary-button"
                    href={`/api/resumes/${resume.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Original PDF
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {snapshot.latestJobDescription ? (
        <section className="panel grid-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Most recent JD</span>
              <h3>{snapshot.latestJobDescription.title}</h3>
            </div>
            <p>{new Date(snapshot.latestJobDescription.updated_at).toLocaleString()}</p>
          </div>
          <p>{snapshot.latestJobDescription.description}</p>

          {topCandidate ? (
            <div className="top-candidate">
              <span className="eyebrow">Top match</span>
              <h4>{topCandidate.parsed.name || topCandidate.userName || "Unnamed candidate"}</h4>
              <p>{topCandidate.latestScore?.rationale ?? "AI scoring did not return a rationale."}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {message ? <div className="error-banner success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}
