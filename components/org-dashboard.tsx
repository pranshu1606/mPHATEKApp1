"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { Organisation, OrgMember, OrgInvite } from "@/lib/organisations";
import type { ResumeDashboardItem, JobDescriptionRow } from "@/lib/resumes";

type Props = {
  org: Organisation;
  sessionUserId: string;
  sessionUserEmail: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  members: OrgMember[];
  invites: OrgInvite[];
  initialResumes: ResumeDashboardItem[];
  initialJobDescriptions: JobDescriptionRow[];
  dashboardSlugs: string[];
};

type ScoringRanking = {
  resumeId: string;
  score: number;
  rationale: string;
  ranking: number;
  parsedName?: string;
  userEmail?: string;
  skills?: string[];
};

export function OrgDashboard({
  org,
  sessionUserId,
  sessionUserEmail,
  isSuperAdmin,
  isAdmin,
  members: initialMembers,
  invites: initialInvites,
  initialResumes,
  initialJobDescriptions,
  dashboardSlugs
}: Props) {
  const [resumes, setResumes] = useState(initialResumes);
  const [jobDescriptions, setJobDescriptions] = useState(initialJobDescriptions);
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [activeTab, setActiveTab] = useState<"resumes" | "jobs" | "score" | "team">("resumes");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Job creation state
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDescription, setNewJobDescription] = useState("");

  // Upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Scoring state
  const [selectedScoreJobId, setSelectedScoreJobId] = useState(initialJobDescriptions[0]?.id ?? "custom");
  const [jobTitle, setJobTitle] = useState(initialJobDescriptions[0]?.title ?? "");
  const [jobDescription, setJobDescription] = useState(initialJobDescriptions[0]?.description ?? "");
  const [scoringResults, setScoringResults] = useState<ScoringRanking[]>([]);

  function handleSelectScoreJob(jobId: string) {
    setSelectedScoreJobId(jobId);
    if (jobId === "custom") {
      setJobTitle("");
      setJobDescription("");
    } else {
      const job = jobDescriptions.find((j) => j.id === jobId);
      if (job) {
        setJobTitle(job.title);
        setJobDescription(job.description);
      }
    }
  }

  // Team invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  function showMsg(text: string, ok = true) {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  }

  async function postJob(e: FormEvent) {
    e.preventDefault();
    if (!newJobTitle.trim() || !newJobDescription.trim()) {
      showMsg("Please enter both a job title and description.", false);
      return;
    }

    setBusy("postjob");
    try {
      const res = await fetch(`/api/organisations/${org.id}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title: newJobTitle, description: newJobDescription })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to post job");

      showMsg(`Job role "${newJobTitle}" posted successfully!`);
      setJobDescriptions(data.jobDescriptions ?? []);
      setNewJobTitle("");
      setNewJobDescription("");
      setActiveTab("jobs");
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed to post job", false);
    } finally {
      setBusy(null);
    }
  }

  async function refreshResumes() {
    const res = await fetch(`/api/resumes?org=${org.slug}`, { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setResumes(data.resumes ?? []);
      setJobDescriptions(data.jobDescriptions ?? []);
    }
  }

  async function refreshTeam() {
    const res = await fetch(`/api/organisations/${org.id}/members`, { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
      setInvites(data.invites ?? []);
    }
  }

  async function uploadResume(e: FormEvent) {
    e.preventDefault();
    if (!resumeFile) { showMsg("Please select a PDF file.", false); return; }

    setBusy("upload");
    try {
      const formData = new FormData();
      formData.append("resume", resumeFile);
      formData.append("org", org.slug);

      const res = await fetch("/api/resumes", { method: "POST", body: formData, credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to upload");

      setResumeFile(null);
      showMsg("Resume uploaded and parsed successfully!");
      await refreshResumes();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Upload failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function scoreResumes(e: FormEvent) {
    e.preventDefault();
    setBusy("score");
    try {
      const payload: any = { org: org.slug };
      if (selectedScoreJobId && selectedScoreJobId !== "custom") {
        payload.jobId = selectedScoreJobId;
      } else {
        if (!jobTitle.trim() || !jobDescription.trim()) {
          showMsg("Enter both a job title and description.", false);
          setBusy(null);
          return;
        }
        payload.title = jobTitle;
        payload.description = jobDescription;
      }

      const res = await fetch("/api/resumes/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Scoring failed");

      setScoringResults(data.rankings ?? []);
      showMsg("Candidates scored and ranked!");
      await refreshResumes();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Scoring failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function deleteResume(resumeId: string) {
    if (!confirm("Delete this resume? This cannot be undone.")) return;
    setBusy(`del-${resumeId}`);
    try {
      const res = await fetch(`/api/resumes/${resumeId}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to delete");
      showMsg("Resume deleted.");
      await refreshResumes();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Delete failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function inviteMember(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy("invite");
    try {
      const res = await fetch(`/api/organisations/${org.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: inviteEmail, orgRole: inviteRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Invite failed");
      showMsg(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      await refreshTeam();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Invite failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function changeMemberRole(userId: string, newRole: "admin" | "member") {
    setBusy(`role-${userId}`);
    try {
      const res = await fetch(`/api/organisations/${org.id}/members?userId=${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orgRole: newRole })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      showMsg(`Role updated to ${newRole}`);
      await refreshTeam();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member from the organisation?")) return;
    setBusy(`rm-${userId}`);
    try {
      const res = await fetch(`/api/organisations/${org.id}/members?userId=${userId}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      showMsg("Member removed.");
      await refreshTeam();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleJobStatus(jobId: string, currentStatus: string) {
    const nextStatus = currentStatus === "paused" ? "active" : "paused";
    setBusy(`togglejob-${jobId}`);
    try {
      const res = await fetch(`/api/organisations/${org.id}/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to toggle status");
      showMsg(`Job role is now ${nextStatus}.`);
      setJobDescriptions(data.jobDescriptions ?? []);
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed to toggle status", false);
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!confirm("Are you sure you want to remove this job listing? This will also remove any score associations.")) return;
    setBusy(`deljob-${jobId}`);
    try {
      const res = await fetch(`/api/organisations/${org.id}/jobs/${jobId}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to delete job listing");
      showMsg("Job role listing has been removed.");
      setJobDescriptions(data.jobDescriptions ?? []);
      // If we deleted the job currently selected for scoring, reset it
      if (selectedScoreJobId === jobId) {
        setSelectedScoreJobId(data.jobDescriptions?.[0]?.id ?? "custom");
      }
    } catch (err) {
      showMsg(err instanceof Error ? err.message : "Failed to delete job role", false);
    } finally {
      setBusy(null);
    }
  }

  const topCandidate = resumes.find((r) => r.latestScore?.ranking === 1) ?? null;

  return (
    <div className="od-root">
      {/* Header */}
      <header className="od-header">
        <div className="od-header-left">
          <div className="od-org-badge">{org.name[0]?.toUpperCase()}</div>
          <div>
            <h1 className="od-title">{org.name}</h1>
            <p className="od-subtitle">{sessionUserEmail} · {isAdmin ? "Admin" : "Member"}</p>
          </div>
        </div>
        <div className="od-header-right">
          {isSuperAdmin && (
            <a className="od-btn-ghost" href="/dashboard/super-admin">⚡ Super Admin</a>
          )}
          {dashboardSlugs.filter((s) => s !== org.slug && s !== "super-admin").map((slug) => (
            <a className="od-btn-ghost" href={`/dashboard/${slug}`} key={slug}>{slug}</a>
          ))}
          <a className="od-btn-ghost" href="/">Home</a>
          <form action="/api/auth/signout" method="POST">
            <button className="od-btn-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      {/* Tabs */}
      <div className="od-tabs">
        <button
          className={`od-tab ${activeTab === "resumes" ? "od-tab-active" : ""}`}
          onClick={() => setActiveTab("resumes")}
        >
          📄 Resumes ({resumes.length})
        </button>
        <button
          className={`od-tab ${activeTab === "jobs" ? "od-tab-active" : ""}`}
          onClick={() => setActiveTab("jobs")}
        >
          💼 Job Listings ({jobDescriptions.length})
        </button>
        {isAdmin && (
          <button
            className={`od-tab ${activeTab === "score" ? "od-tab-active" : ""}`}
            onClick={() => setActiveTab("score")}
          >
            🎯 Score Candidates
          </button>
        )}
        {isAdmin && (
          <button
            className={`od-tab ${activeTab === "team" ? "od-tab-active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            👥 Team ({members.length})
          </button>
        )}
      </div>

      {message && (
        <div className={`od-toast ${message.ok ? "od-toast-ok" : "od-toast-err"}`}>
          {message.text}
        </div>
      )}

      <div className="od-content">
        {/* RESUMES TAB */}
        {activeTab === "resumes" && (
          <div className="od-resumes">
            {/* Upload card */}
            <div className="od-card od-upload-card">
              <h2 className="od-card-title">Upload Resume</h2>
              <p className="od-card-desc">PDF resumes are parsed by AI and indexed for semantic search.</p>
              <form className="od-upload-form" onSubmit={uploadResume}>
                <label className="od-file-label">
                  <input
                    accept="application/pdf"
                    disabled={busy === "upload"}
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                    type="file"
                  />
                  <span>{resumeFile ? resumeFile.name : "Choose a PDF resume…"}</span>
                </label>
                <button className="od-btn-primary" disabled={busy === "upload" || !resumeFile} type="submit">
                  {busy === "upload" ? "Processing…" : "Upload"}
                </button>
              </form>
            </div>

            {/* Top match */}
            {topCandidate && (
              <div className="od-card od-top-match">
                <div className="od-card-eyebrow">🏆 Top Match</div>
                <h3>{topCandidate.parsed.name || topCandidate.userName || "Unnamed"}</h3>
                <p>{topCandidate.latestScore?.rationale}</p>
                <div className="od-chip-row">
                  {topCandidate.parsed.skills.slice(0, 6).map((s) => (
                    <span className="od-chip" key={s}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Resume grid */}
            {resumes.length === 0 ? (
              <div className="od-empty">
                <div className="od-empty-icon">📭</div>
                <h3>No resumes yet</h3>
                <p>Upload the first resume to get started.</p>
              </div>
            ) : (
              <div className="od-resume-grid">
                {resumes.map((resume) => (
                  <div className="od-resume-card" key={resume.id}>
                    <div className="od-resume-card-header">
                      <div>
                        <h4>{resume.parsed.name || resume.userName || "Unnamed"}</h4>
                        <p>{resume.userEmail ?? resume.parsed.email ?? "—"}</p>
                      </div>
                      {resume.latestScore && (
                        <span className="od-score-badge">{Math.round(resume.latestScore.score)}%</span>
                      )}
                    </div>

                    <div className="od-chip-row">
                      {resume.parsed.skills.slice(0, 6).map((skill) => (
                        <span className="od-chip" key={skill}>{skill}</span>
                      ))}
                    </div>

                    <p className="od-resume-meta">
                      Uploaded {resume.createdAt.split("T")[0]}
                    </p>

                    {resume.latestScore && (
                      <div className="od-score-panel">
                        <strong>Score: {Math.round(resume.latestScore.score)}/100 — {resume.latestScore.title}</strong>
                        <p>{resume.latestScore.rationale}</p>
                      </div>
                    )}

                    <div className="od-resume-actions">
                      <a
                        className="od-btn-secondary-sm"
                        href={`/api/resumes/${resume.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View PDF
                      </a>
                      {isAdmin && (
                        <button
                          className="od-btn-danger-sm"
                          disabled={busy === `del-${resume.id}`}
                          onClick={() => deleteResume(resume.id)}
                        >
                          {busy === `del-${resume.id}` ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* JOBS TAB */}
        {activeTab === "jobs" && (
          <div className="od-resumes">
            {isAdmin && (
              <div className="od-card">
                <h2 className="od-card-title">💼 Post New Job Role</h2>
                <p className="od-card-desc">Publish a new job role. Candidates will see this on their dashboard and can apply with their resume.</p>
                <form className="od-score-form" onSubmit={postJob}>
                  <label className="od-label">
                    <span>Job Title</span>
                    <input
                      className="od-input"
                      placeholder="Senior Frontend Developer"
                      value={newJobTitle}
                      onChange={(e) => setNewJobTitle(e.target.value)}
                      disabled={busy === "postjob"}
                    />
                  </label>
                  <label className="od-label">
                    <span>Job Description</span>
                    <textarea
                      className="od-textarea"
                      rows={6}
                      placeholder="Enter the role description, qualifications, and expectations..."
                      value={newJobDescription}
                      onChange={(e) => setNewJobDescription(e.target.value)}
                      disabled={busy === "postjob"}
                    />
                  </label>
                  <button className="od-btn-primary" disabled={busy === "postjob"} type="submit">
                    {busy === "postjob" ? "Posting..." : "Post Job Role"}
                  </button>
                </form>
              </div>
            )}

            <div className="od-card">
              <h3>Current Job Listings ({jobDescriptions.length})</h3>
              {jobDescriptions.length === 0 ? (
                <p className="od-muted" style={{ marginTop: "8px" }}>No job roles posted yet.</p>
              ) : (
                <div className="od-jd-history" style={{ marginTop: "12px" }}>
                  {jobDescriptions.map((jd) => (
                    <div className="od-jd-row" key={jd.id} style={{ display: "block", padding: "16px 0", borderBottom: "1px solid var(--od-border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong style={{ fontSize: "15px", color: "var(--od-text)" }}>{jd.title}</strong>
                          <span
                            className="od-role-badge"
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              background: jd.status === "paused" ? "#fee2e2" : "#ecfdf5",
                              color: jd.status === "paused" ? "#991b1b" : "#047857"
                            }}
                          >
                            {jd.status === "paused" ? "Paused" : "Active"}
                          </span>
                        </div>
                        <span className="od-muted" style={{ fontSize: "12px" }}>
                          Posted {jd.created_at.split("T")[0]}
                        </span>
                      </div>
                      <p style={{ marginTop: "8px", fontSize: "13px", color: "var(--od-muted)", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                        {jd.description}
                      </p>
                      {isAdmin && (
                        <div className="od-row" style={{ marginTop: "12px", gap: "8px" }}>
                          <button
                            className="od-btn-secondary-sm"
                            disabled={busy !== null}
                            onClick={() => handleToggleJobStatus(jd.id, jd.status)}
                          >
                            {jd.status === "paused" ? "▶ Resume Applications" : "⏸ Pause Applications"}
                          </button>
                          <button
                            className="od-btn-danger-sm"
                            disabled={busy !== null}
                            onClick={() => handleDeleteJob(jd.id)}
                          >
                            🗑 Remove Listing
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCORE TAB */}
        {activeTab === "score" && isAdmin && (
          <div className="od-score-tab">
            <div className="od-card">
              <h2 className="od-card-title">🎯 Score Candidates</h2>
              <p className="od-card-desc">Select a job listing to score all uploaded resumes against it. To create a new ad-hoc listing, choose 'Enter custom job description'.</p>
              <form className="od-score-form" onSubmit={scoreResumes}>
                <label className="od-label">
                  <span>Select Job Listing</span>
                  <select
                    className="od-select"
                    value={selectedScoreJobId}
                    onChange={(e) => handleSelectScoreJob(e.target.value)}
                    disabled={busy === "score"}
                  >
                    {jobDescriptions.map((jd) => (
                      <option key={jd.id} value={jd.id}>
                        {jd.title} ({jd.status})
                      </option>
                    ))}
                    <option value="custom">-- Enter custom job description --</option>
                  </select>
                </label>
                <label className="od-label">
                  <span>Job Title</span>
                  <input
                    className="od-input"
                    placeholder="Senior Frontend Engineer"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    disabled={busy === "score" || selectedScoreJobId !== "custom"}
                  />
                </label>
                <label className="od-label">
                  <span>Job Description</span>
                  <textarea
                    className="od-textarea"
                    rows={7}
                    placeholder="Describe the role, required skills, and responsibilities…"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    disabled={busy === "score" || selectedScoreJobId !== "custom"}
                  />
                </label>
                <button className="od-btn-primary" disabled={busy === "score"} type="submit">
                  {busy === "score" ? "Searching & Scoring…" : "Calculate Match Scores"}
                </button>
              </form>
            </div>

            {scoringResults.length > 0 && (
              <div className="od-rankings">
                <h3 className="od-section-title">Rankings</h3>
                {scoringResults.map((result) => {
                  const resume = resumes.find((r) => r.id === result.resumeId);
                  return (
                    <div className="od-rank-card" key={result.resumeId}>
                      <div className="od-rank-num">#{result.ranking}</div>
                      <div className="od-rank-info">
                        <strong>{result.parsedName || resume?.parsed.name || resume?.userName || "Unnamed"}</strong>
                        <span>{result.userEmail || resume?.userEmail || resume?.parsed.email || "—"}</span>
                        <p className="od-muted">{result.rationale}</p>
                        <div className="od-chip-row">
                          {(result.skills ?? resume?.parsed.skills ?? []).slice(0, 5).map((s) => (
                            <span className="od-chip" key={s}>{s}</span>
                          ))}
                        </div>
                      </div>
                      <span className="od-score-badge od-score-large">{Math.round(result.score)}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Previous JDs */}
            {jobDescriptions.length > 0 && (
              <div className="od-card od-jd-history">
                <h3>Previous Job Descriptions</h3>
                {jobDescriptions.map((jd) => (
                  <div className="od-jd-row" key={jd.id}>
                    <div>
                      <strong>{jd.title}</strong>
                      <span className="od-muted"> · {jd.created_at.split("T")[0]}</span>
                    </div>
                    <button
                      className="od-btn-ghost-sm"
                      onClick={() => { setJobTitle(jd.title); setJobDescription(jd.description); setActiveTab("score"); }}
                    >
                      Re-use
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === "team" && isAdmin && (
          <div className="od-team-tab">
            {/* Invite form */}
            <div className="od-card">
              <h2 className="od-card-title">Invite Member</h2>
              <p className="od-card-desc">Add a colleague by email. If they have an account, they are added immediately. Otherwise they will be auto-added when they sign in.</p>
              <form className="od-invite-form" onSubmit={inviteMember}>
                <input
                  className="od-input"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={busy === "invite"}
                />
                <select
                  className="od-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                >
                  <option value="member">Member — can upload resumes</option>
                  <option value="admin">Admin — can score &amp; manage</option>
                </select>
                <button className="od-btn-primary" type="submit" disabled={busy === "invite" || !inviteEmail.trim()}>
                  {busy === "invite" ? "Sending…" : "Send Invite"}
                </button>
              </form>
            </div>

            {/* Members table */}
            <div className="od-card">
              <h3>Members ({members.length})</h3>
              {members.length === 0 ? (
                <p className="od-muted">No members yet. Invite your team above.</p>
              ) : (
                <table className="od-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.user_id}>
                        <td>{m.user_name ?? "—"}</td>
                        <td>{m.user_email}</td>
                        <td>
                          <select
                            className="od-select-sm"
                            value={m.org_role}
                            disabled={m.user_id === sessionUserId}
                            onChange={(e) => changeMemberRole(m.user_id, e.target.value as "admin" | "member")}
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          {m.user_id !== sessionUserId && (
                            <button
                              className="od-btn-danger-sm"
                              disabled={busy === `rm-${m.user_id}`}
                              onClick={() => removeMember(m.user_id)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pending invites */}
            {invites.length > 0 && (
              <div className="od-card">
                <h3>Pending Invites ({invites.length})</h3>
                <table className="od-table">
                  <thead>
                    <tr><th>Email</th><th>Role</th><th>Invited</th></tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.invited_email}</td>
                        <td><span className="od-role-badge od-role-{inv.org_role}">{inv.org_role}</span></td>
                        <td className="od-muted">{inv.created_at.split("T")[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
