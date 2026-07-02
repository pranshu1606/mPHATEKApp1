"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { JobWithOrg, CandidateApplication } from "@/lib/resumes";

type Props = {
  sessionUserEmail: string;
  jobs: JobWithOrg[];
  applications: CandidateApplication[];
};

export function CandidateDashboard({
  sessionUserEmail,
  jobs,
  applications: initialApplications
}: Props) {
  const [applications, setApplications] = useState(initialApplications);
  const [activeTab, setActiveTab] = useState<"jobs" | "applications">("jobs");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobWithOrg | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function showMsg(text: string, ok = true) {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleApply(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile || !selectedJob) {
      showMsg("Please select a PDF file to apply.", false);
      return;
    }

    setBusyJobId(selectedJob.id);
    try {
      const formData = new FormData();
      formData.append("resume", selectedFile);
      formData.append("jobId", selectedJob.id);

      const res = await fetch("/api/resumes/apply", {
        method: "POST",
        body: formData,
        credentials: "same-origin"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Application failed");

      showMsg(`Successfully applied for "${selectedJob.title}"!`);
      setApplications(data.applications ?? []);
      setSelectedJob(null);
      setSelectedFile(null);
      setActiveTab("applications");
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed to apply", false);
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <div className="od-root">
      {/* Header */}
      <header className="od-header">
        <div className="od-header-left">
          <div className="od-org-badge">🎓</div>
          <div>
            <h1 className="od-title">Candidate Portal</h1>
            <p className="od-subtitle">{sessionUserEmail} · Job Seeker</p>
          </div>
        </div>
        <div className="od-header-right">
          <a className="od-btn-ghost" href="/">Home</a>
          <form action="/api/auth/signout" method="POST">
            <button className="od-btn-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      {/* Tabs */}
      <div className="od-tabs">
        <button
          className={`od-tab ${activeTab === "jobs" ? "od-tab-active" : ""}`}
          onClick={() => setActiveTab("jobs")}
        >
          💼 Browse Jobs ({jobs.length})
        </button>
        <button
          className={`od-tab ${activeTab === "applications" ? "od-tab-active" : ""}`}
          onClick={() => setActiveTab("applications")}
        >
          📥 My Applications ({applications.length})
        </button>
      </div>

      {message && (
        <div className={`od-toast ${message.ok ? "od-toast-ok" : "od-toast-err"}`} style={{ margin: "16px 40px" }}>
          {message.text}
        </div>
      )}

      <div className="od-content">
        {/* BROWSE JOBS TAB */}
        {activeTab === "jobs" && (
          <div className="od-resumes">
            {selectedJob && (
              <div className="od-card od-upload-card" style={{ borderLeftColor: "var(--primary)" }}>
                <h2 className="od-card-title">Apply for {selectedJob.title}</h2>
                <p className="od-card-desc">At {selectedJob.org_name} · Upload your PDF resume to submit your application.</p>
                <form className="od-upload-form" onSubmit={handleApply}>
                  <label className="od-file-label">
                    <input
                      accept="application/pdf"
                      disabled={busyJobId !== null}
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      type="file"
                    />
                    <span>{selectedFile ? selectedFile.name : "Choose PDF resume…"}</span>
                  </label>
                  <div className="od-row" style={{ gap: "8px", display: "flex" }}>
                    <button
                      className="od-btn-primary"
                      disabled={busyJobId !== null || !selectedFile}
                      type="submit"
                    >
                      {busyJobId === selectedJob.id ? "Submitting Application…" : "Submit Application"}
                    </button>
                    <button
                      className="od-btn-ghost"
                      type="button"
                      onClick={() => { setSelectedJob(null); setSelectedFile(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {jobs.length === 0 ? (
              <div className="od-empty">
                <div className="od-empty-icon">🏢</div>
                <h3>No jobs posted yet</h3>
                <p>Check back later for available listings.</p>
              </div>
            ) : (
              <div className="od-resume-grid" style={{ gridTemplateColumns: "1fr" }}>
                {jobs.map((job) => (
                  <div className="od-resume-card" key={job.id} style={{ padding: "24px" }}>
                    <div className="od-resume-card-header">
                      <div>
                        <span className="eyebrow" style={{ fontSize: "10px", padding: "4px 8px" }}>
                          {job.org_name}
                        </span>
                        <h3 style={{ marginTop: "8px", fontSize: "1.3rem" }}>{job.title}</h3>
                        <p style={{ fontSize: "12px", color: "var(--muted)" }}>
                          Posted {job.created_at.split("T")[0]}
                        </p>
                      </div>
                      {applications.some((app) => app.job_id === job.id) ? (
                        <button
                          className="od-btn-ghost"
                          style={{ borderColor: "#a7f3d0", background: "#f0fdf4", color: "#166534", cursor: "not-allowed" }}
                          disabled
                        >
                          ✓ Applied
                        </button>
                      ) : (
                        <button
                          className="od-btn-primary"
                          onClick={() => { setSelectedJob(job); setSelectedFile(null); }}
                        >
                          Apply Now
                        </button>
                      )}
                    </div>
                    <p style={{ marginTop: "16px", whiteSpace: "pre-wrap", color: "var(--ink)", lineHeight: "1.6" }}>
                      {job.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MY APPLICATIONS TAB */}
        {activeTab === "applications" && (
          <div className="od-resumes">
            {applications.length === 0 ? (
              <div className="od-empty">
                <div className="od-empty-icon">📭</div>
                <h3>No applications yet</h3>
                <p>Go to the **Browse Jobs** tab and apply for job listings.</p>
              </div>
            ) : (
              <div className="od-resume-grid" style={{ gridTemplateColumns: "1fr" }}>
                {applications.map((app) => (
                  <div className="od-resume-card" key={app.resume_id} style={{ borderLeft: "3px solid #10b981" }}>
                    <div className="od-resume-card-header">
                      <div>
                        <span className="eyebrow" style={{ fontSize: "10px", padding: "4px 8px", background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" }}>
                          {app.org_name}
                        </span>
                        <h4 style={{ marginTop: "8px", fontSize: "1.1rem" }}>{app.job_title}</h4>
                        <p style={{ fontSize: "12px" }}>Applied with file: <span style={{ fontFamily: "monospace" }}>{app.original_filename}</span></p>
                      </div>
                      {app.score !== null && (
                        <div style={{ textAlign: "right" }}>
                          <span className="od-score-badge od-score-large">{Math.round(app.score)}%</span>
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>Match Score</div>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: "12px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                      <strong style={{ fontSize: "12px", color: "var(--ink)" }}>AI Screening Feedback:</strong>
                      <p style={{ fontSize: "12px", marginTop: "4px", color: "var(--muted)", lineHeight: "1.5" }}>
                        {app.rationale || "Your application has been received and is being processed."}
                      </p>
                    </div>

                    <div className="od-resume-actions" style={{ marginTop: "12px" }}>
                      <a
                        className="od-btn-secondary-sm"
                        href={`/api/resumes/${app.resume_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View My Resume PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
