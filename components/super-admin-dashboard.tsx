"use client";

import { useState } from "react";
import type { OrgStats } from "@/lib/organisations";

type Props = {
  email: string;
  orgStats: OrgStats[];
};

export function SuperAdminDashboard({ email, orgStats }: Props) {
  const [stats, setStats] = useState(orgStats);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgAdmin, setNewOrgAdmin] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");

  async function refreshStats() {
    const res = await fetch("/api/organisations", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      setStats(data.organisations ?? []);
    }
  }

  async function createOrg() {
    if (!newOrgName.trim() || !newOrgAdmin.trim()) {
      setMessage({ text: "Both organisation name and admin email are required.", ok: false });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: newOrgName, adminEmail: newOrgAdmin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create organisation");
      setMessage({ text: `Organisation "${newOrgName}" created successfully!`, ok: true });
      setNewOrgName("");
      setNewOrgAdmin("");
      setShowCreateForm(false);
      await refreshStats();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function loadOrgDetail(orgId: string) {
    setSelectedOrg(orgId);
    setBusy(true);
    try {
      const res = await fetch(`/api/organisations/${orgId}`, { credentials: "same-origin" });
      if (res.ok) setOrgDetail(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember(orgId: string) {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/organisations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: inviteEmail, orgRole: inviteRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to invite");
      setMessage({ text: `Invitation sent to ${inviteEmail}`, ok: true });
      setInviteEmail("");
      await loadOrgDetail(orgId);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function removeResume(resumeId: string, orgId: string) {
    if (!confirm("Delete this resume? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/resumes/${resumeId}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Failed to delete");
      }
      setMessage({ text: "Resume deleted.", ok: true });
      await loadOrgDetail(orgId);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function changeMemberRole(orgId: string, userId: string, newRole: "admin" | "member") {
    setBusy(true);
    try {
      const res = await fetch(`/api/organisations/${orgId}/members?userId=${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orgRole: newRole })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Failed");
      }
      setMessage({ text: `Role updated to ${newRole}`, ok: true });
      await loadOrgDetail(orgId);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(orgId: string, userId: string) {
    if (!confirm("Remove this member from the organisation?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/organisations/${orgId}/members?userId=${userId}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Failed");
      }
      setMessage({ text: "Member removed.", ok: true });
      await loadOrgDetail(orgId);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const selectedStat = stats.find((s) => s.org.id === selectedOrg);

  return (
    <div className="sa-root">
      {/* Header */}
      <header className="sa-header">
        <div className="sa-header-left">
          <div className="sa-badge">⚡ SUPER ADMIN</div>
          <h1 className="sa-title">Control Center</h1>
          <p className="sa-subtitle">{email}</p>
        </div>
        <div className="sa-header-right">
          <button className="sa-btn-primary" onClick={() => { setShowCreateForm(true); setSelectedOrg(null); setOrgDetail(null); }}>
            + New Organisation
          </button>
          <a className="sa-btn-ghost" href="/">Home</a>
          <form action="/api/auth/signout" method="POST">
            <button className="sa-btn-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      {/* Stats bar */}
      <div className="sa-stats-bar">
        <div className="sa-stat-card">
          <span className="sa-stat-num">{stats.length}</span>
          <span className="sa-stat-label">Organisations</span>
        </div>
        <div className="sa-stat-card">
          <span className="sa-stat-num">{stats.reduce((acc, s) => acc + s.memberCount, 0)}</span>
          <span className="sa-stat-label">Total Members</span>
        </div>
        <div className="sa-stat-card">
          <span className="sa-stat-num">{stats.reduce((acc, s) => acc + s.resumeCount, 0)}</span>
          <span className="sa-stat-label">Total Resumes</span>
        </div>
      </div>

      {message && (
        <div className={`sa-toast ${message.ok ? "sa-toast-ok" : "sa-toast-err"}`}>
          {message.text}
          <button onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      <div className="sa-body">
        {/* Left: org list */}
        <div className="sa-sidebar">
          <h2 className="sa-section-title">Organisations</h2>
          {stats.length === 0 ? (
            <div className="sa-empty">
              <div className="sa-empty-icon">🏢</div>
              <p>No organisations yet.</p>
              <button className="sa-btn-primary" onClick={() => setShowCreateForm(true)}>
                Create First Org
              </button>
            </div>
          ) : (
            <div className="sa-org-list">
              {stats.map(({ org, memberCount, resumeCount, adminEmail }) => (
                <button
                  className={`sa-org-card ${selectedOrg === org.id ? "sa-org-card-active" : ""}`}
                  key={org.id}
                  onClick={() => loadOrgDetail(org.id)}
                >
                  <div className="sa-org-avatar">{org.name[0]?.toUpperCase()}</div>
                  <div className="sa-org-info">
                    <div className="sa-org-name">{org.name}</div>
                    <div className="sa-org-slug">/{org.slug}</div>
                    <div className="sa-org-meta">
                      <span>👥 {memberCount}</span>
                      <span>📄 {resumeCount}</span>
                    </div>
                    {adminEmail && <div className="sa-org-admin">{adminEmail}</div>}
                  </div>
                  <span className="sa-org-arrow">›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        <div className="sa-detail">
          {showCreateForm && (
            <div className="sa-panel">
              <h2 className="sa-section-title">Create Organisation</h2>
              <div className="sa-form">
                <label className="sa-label">
                  <span>Organisation Name</span>
                  <input
                    className="sa-input"
                    placeholder="Acme Corp"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                  />
                </label>
                <label className="sa-label">
                  <span>Admin Email</span>
                  <input
                    className="sa-input"
                    type="email"
                    placeholder="admin@acme.com"
                    value={newOrgAdmin}
                    onChange={(e) => setNewOrgAdmin(e.target.value)}
                  />
                  <small>This person will be the organisation admin. They will be added when they first sign in.</small>
                </label>
                <div className="sa-row">
                  <button className="sa-btn-primary" disabled={busy} onClick={createOrg}>
                    {busy ? "Creating…" : "Create Organisation"}
                  </button>
                  <button className="sa-btn-ghost" onClick={() => setShowCreateForm(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {!showCreateForm && !orgDetail && (
            <div className="sa-welcome">
              <div className="sa-welcome-icon">⚡</div>
              <h2>Super Admin Console</h2>
              <p>Select an organisation from the left to view its data, manage members, and delete resumes. Click <strong>+ New Organisation</strong> to onboard a new company.</p>
            </div>
          )}

          {!showCreateForm && orgDetail && (
            <div className="sa-org-detail">
              <div className="sa-org-detail-header">
                <div>
                  <h2 className="sa-section-title">{orgDetail.org?.name}</h2>
                  <span className="sa-slug-badge">/{orgDetail.org?.slug}</span>
                </div>
                <div className="sa-row">
                  <a
                    className="sa-btn-secondary"
                    href={`/dashboard/${orgDetail.org?.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Org Dashboard ↗
                  </a>
                </div>
              </div>

              {/* Invite member */}
              <div className="sa-panel sa-invite-panel">
                <h3>Invite Member</h3>
                <div className="sa-row">
                  <input
                    className="sa-input sa-input-grow"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <select
                    className="sa-select"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    className="sa-btn-primary"
                    disabled={busy || !inviteEmail.trim()}
                    onClick={() => inviteMember(orgDetail.org.id)}
                  >
                    Invite
                  </button>
                </div>
              </div>

              {/* Members */}
              <div className="sa-panel">
                <h3>Members ({orgDetail.members?.length ?? 0})</h3>
                {orgDetail.members?.length === 0 ? (
                  <p className="sa-muted">No members yet.</p>
                ) : (
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgDetail.members?.map((m: any) => (
                        <tr key={m.user_id}>
                          <td>{m.user_name ?? "—"}</td>
                          <td>{m.user_email}</td>
                          <td>
                            <select
                              className="sa-select-sm"
                              value={m.org_role}
                              onChange={(e) =>
                                changeMemberRole(orgDetail.org.id, m.user_id, e.target.value as "admin" | "member")
                              }
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td>
                            <button
                              className="sa-btn-danger-sm"
                              onClick={() => removeMember(orgDetail.org.id, m.user_id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {orgDetail.invites?.length > 0 && (
                  <>
                    <h4 style={{ marginTop: "1rem" }}>Pending Invites</h4>
                    <table className="sa-table">
                      <thead>
                        <tr><th>Email</th><th>Role</th></tr>
                      </thead>
                      <tbody>
                        {orgDetail.invites.map((inv: any) => (
                          <tr key={inv.id}>
                            <td>{inv.invited_email} <span className="sa-pending-badge">pending</span></td>
                            <td>{inv.org_role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Resumes */}
              <div className="sa-panel">
                <h3>Resumes ({orgDetail.resumes?.length ?? 0})</h3>
                {orgDetail.resumes?.length === 0 ? (
                  <p className="sa-muted">No resumes uploaded yet.</p>
                ) : (
                  <div className="sa-resume-list">
                    {orgDetail.resumes?.map((r: any) => (
                      <div className="sa-resume-row" key={r.id}>
                        <div className="sa-resume-info">
                          <strong>{r.parsed?.name || r.userName || "Unnamed"}</strong>
                          <span>{r.userEmail ?? r.parsed?.email ?? "—"}</span>
                          <span className="sa-muted sa-filename">{r.originalFilename}</span>
                        </div>
                        <div className="sa-resume-chips">
                          {r.parsed?.skills?.slice(0, 4).map((s: string) => (
                            <span className="sa-chip" key={s}>{s}</span>
                          ))}
                        </div>
                        <div className="sa-resume-actions">
                          {r.latestScore && (
                            <span className="sa-score-badge">{Math.round(r.latestScore.score)}%</span>
                          )}
                          <a className="sa-btn-ghost-sm" href={`/api/resumes/${r.id}`} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                          <button
                            className="sa-btn-danger-sm"
                            onClick={() => removeResume(r.id, orgDetail.org.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Job Descriptions */}
              {orgDetail.jobDescriptions?.length > 0 && (
                <div className="sa-panel">
                  <h3>Job Descriptions ({orgDetail.jobDescriptions.length})</h3>
                  <div className="sa-jd-list">
                    {orgDetail.jobDescriptions.map((jd: any) => (
                      <div className="sa-jd-card" key={jd.id}>
                        <strong>{jd.title}</strong>
                        <p className="sa-muted">{jd.created_at.split("T")[0]}</p>
                        <p className="sa-jd-desc">{jd.description.slice(0, 200)}{jd.description.length > 200 ? "…" : ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
