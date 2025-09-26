// src/pages/AdminInvitesPage.jsx
import React, { useEffect, useState } from "react";
import { api } from "../api/client";

const ROLES = ["recruiter", "admin", "viewer"];

export default function AdminInvitesPage() {
  const [form, setForm] = useState({
    orgId: "",
    role: "recruiter",
    maxUses: 1,
    expiresAt: "",
  });
  const [loading, setLoading] = useState(false);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const load = async () => {
    setError("");
    try {
      const res = await api("/api/admin/invite-codes");
      setInvites(res.invites || []);
    } catch (e) {
      setError(e.message || "Failed to load invites");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setLoading(true);
    try {
      const payload = {
        orgId: form.orgId ? form.orgId : null,
        role: form.role,
        maxUses: Number(form.maxUses) || 1,
        expiresAt: form.expiresAt || null,
      };
      const res = await api("/api/admin/invite-code", {
        method: "POST",
        body: payload,
      });
      setOkMsg(`Invite created: ${res.invite.code}`);
      setForm({ orgId: "", role: "recruiter", maxUses: 1, expiresAt: "" });
      await load();
    } catch (e) {
      setError(e.message || "Failed to create invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Admin · Invite Codes
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {okMsg}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="bg-white border border-gray-200 rounded-lg p-6 mb-8 shadow-sm space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tie to Organization (optional)
            </label>
            <input
              name="orgId"
              type="text"
              value={form.orgId}
              onChange={onChange}
              placeholder="Org ID (leave blank for new org signups)"
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <p className="text-xs text-gray-500 mt-1">
              If set, users will join this org.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              name="role"
              value={form.role}
              onChange={onChange}
              className="w-full border border-gray-300 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max uses
            </label>
            <input
              name="maxUses"
              type="number"
              min="1"
              value={form.maxUses}
              onChange={onChange}
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expires at (optional)
            </label>
            <input
              name="expiresAt"
              type="datetime-local"
              value={form.expiresAt}
              onChange={onChange}
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create Invite"}
          </button>
        </div>
      </form>

      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Recent Invites
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Org</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Uses</th>
                <th className="py-2 pr-4">Max</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-mono">{i.code}</td>
                  <td className="py-2 pr-4">{i.org_id || "—"}</td>
                  <td className="py-2 pr-4">{i.role}</td>
                  <td className="py-2 pr-4">{i.uses}</td>
                  <td className="py-2 pr-4">{i.max_uses}</td>
                  <td className="py-2 pr-4">
                    {i.expires_at
                      ? new Date(i.expires_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {new Date(i.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-gray-500">
                    No invites yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
