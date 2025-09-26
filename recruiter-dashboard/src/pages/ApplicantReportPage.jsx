import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";

const Card = ({ title, value }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <p className="text-sm text-gray-500">{title}</p>
    <p className="text-xl font-semibold text-gray-900 mt-1">{value}</p>
  </div>
);

const pctOrNA = (v) => {
  if (v == null) return "N/A";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "N/A";
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}/100`;
};

export default function ApplicantReportPage() {
  const { jobId, applicantId } = useParams();
  const navigate = useNavigate();

  const [app, setApp] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const data = await api(`/api/applications/${applicantId}`);
        if (!mounted) return;
        setApp(data || null);
      } catch (e) {
        if (mounted) setErr(e.message || "Failed to load applicant");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [applicantId]);

  const scores = app?.ai_scores || {};
  const summary = app?.ai_summary || "AI report will appear here after parsing (mock).";

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-600 hover:text-gray-800 hover:underline mb-2"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">
          Applicant Report: {app?.candidate_name || applicantId}
        </h1>
        {/* subtle subtitle with job title if available (no job id shown) */}
        {app?.job_title && (
          <p className="text-sm text-gray-500">For {app.job_title}</p>
        )}
      </div>

      {err && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading || !app ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          {loading ? "Loading…" : "Not found"}
        </div>
      ) : (
        <>
          {/* Summary scores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            <Card title="Business Impact" value={pctOrNA(scores.business_impact)} />
            <Card title="Technical Accuracy" value={pctOrNA(scores.technical_accuracy)} />
            <Card title="Communication" value={pctOrNA(scores.communication)} />
          </div>

          {/* Career Card Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-10 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Career Card Feedback</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {summary}
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
              <div><span className="text-gray-500">Name:</span> {app.candidate_name || "—"}</div>
              <div><span className="text-gray-500">Email:</span> {app.candidate_email || "—"}</div>
              {app.current_title && (
                <div><span className="text-gray-500">Current title:</span> {app.current_title}</div>
              )}
              {(app.city || app.country) && (
                <div>
                  <span className="text-gray-500">Location:</span>{" "}
                  {[app.city, app.country].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Simulation Summary placeholder */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Simulation Report</h2>
            <p className="text-gray-700 text-sm leading-relaxed">
              The applicant’s simulation breakdown and transcripts will appear here when your
              simulation pipeline posts results. Until then, the category-wise scores above and the
              career-card feedback serve as the summary.
            </p>

            {(app.files?.career_card || app.files?.resume) && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Submitted files</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  {app.files?.career_card && (
                    <li>
                      Career Card — {app.files.career_card.name} ({app.files.career_card.mime})
                    </li>
                  )}
                  {app.files?.resume && (
                    <li>
                      Resume — {app.files.resume.name} ({app.files.resume.mime})
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
