// client/src/pages/JobDetailPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";

const TableCell = ({ children, className = "" }) => (
  <td className={`px-4 py-3 text-sm text-gray-800 ${className}`}>{children}</td>
);

const toPercentScore = (value) => {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};

const getScoreValue = (row) => {
  const sources = [
    row?.overall_score,
    row?.analysis_overall_score,
    row?.ai_score,
    row?.ai_scores?.overall ?? row?.ai_scores?.score,
  ];
  for (const val of sources) {
    const pct = toPercentScore(val);
    if (pct != null) return pct;
  }
  return null;
};

const scoreBadgeClasses = (score) => {
  if (score == null) return "bg-gray-100 text-gray-500 border border-gray-200";
  if (score >= 80) return "bg-green-50 text-green-700 border border-green-200";
  if (score >= 60) return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-rose-50 text-rose-700 border border-rose-200";
};

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [apps, setApps] = React.useState([]);
  const [jobTitle, setJobTitle] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // Load applicants (ranked server-side, now includes ai_score/final_score)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const data = await api(`/api/applications/job/${id}`);
        if (!mounted) return;
        setApps(Array.isArray(data) ? data : []);
      } catch (e) {
        if (mounted) setErr(e.message || "Failed to load applicants");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // Load job title with multiple safe fallbacks
  React.useEffect(() => {
    let cancelled = false;

    const loadTitle = async () => {
      try {
        const meta = await api(`/api/jobs/${id}/meta`);
        if (!cancelled && meta?.title) { setJobTitle(meta.title); return; }
      } catch {}

      try {
        const j = await api(`/api/jobs/${id}`);
        if (!cancelled && j?.title) { setJobTitle(j.title); return; }
      } catch {}

      try {
        if (apps.length > 0) {
          const first = await api(`/api/applications/${apps[0].id}`);
          if (!cancelled && first?.job_title) { setJobTitle(first.job_title); return; }
        }
      } catch {}

      if (!cancelled) setJobTitle(`job-${id}`);
    };

    loadTitle();
    return () => { cancelled = true; };
  }, [id, apps]);

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
        >
          ← Back
        </button>
      </div>

      <h1 className="text-2xl font-semibold text-gray-900 mb-4">
        Applicants for: {jobTitle || `job-${id}`}
      </h1>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          Loading applicants…
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          No applicants yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rank</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Overall AI Score</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {apps.map((a, idx) => {
                const scoreValue = getScoreValue(a);
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <TableCell className="w-24">{idx + 1}</TableCell>
                    <TableCell>{a.candidate_name || "Applicant"}</TableCell>
                    <TableCell className="w-40">
                      <span
                        className={`inline-flex min-w-[4.5rem] justify-center rounded-full px-3 py-1 text-sm font-medium ${scoreBadgeClasses(
                          scoreValue
                        )}`}
                      >
                        {scoreValue != null ? `${scoreValue}%` : "Pending"}
                      </span>
                    </TableCell>
                    <TableCell className="w-40">
                      <button
                        onClick={() => navigate(`/dashboard/job/${id}/applicant/${a.id}`)}
                        className="text-blue-600 hover:underline"
                      >
                        View Report
                      </button>
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
