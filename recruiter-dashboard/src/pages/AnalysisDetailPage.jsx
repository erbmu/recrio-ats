// src/pages/AnalysisDetailPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";

const TinyCell = ({ children }) => (
  <td className="px-3 py-2 text-sm text-gray-800 align-top">{children}</td>
);

export default function AnalysisDetailPage() {
  const { jobId, applicantId, analysisId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    let ok = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const d = await api(`/api/applications/simulations/analysis/${analysisId}`);
        if (ok) setData(d || null);
      } catch (e) {
        if (ok) setErr(e.message || "Failed to load analysis");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => { ok = false; };
  }, [analysisId]);

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
          Analysis: {data?.label || analysisId}
        </h1>
        {Number.isFinite(data?.final_score) && (
          <p className="text-sm text-gray-500">Score: {Math.round(data.final_score)}/100</p>
        )}
      </div>

      {err && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading || !data ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          {loading ? "Loading…" : "Not found"}
        </div>
      ) : (
        <>
          {/* Criteria table (left) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Criteria</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 text-gray-600 text-sm">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-1/5">Criterion</th>
                    <th className="px-3 py-2 text-left font-medium w-1/12">Score</th>
                    <th className="px-3 py-2 text-left font-medium">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data.tables?.criteria || []).map((r, i) => (
                    <tr key={i} className="align-top">
                      <TinyCell className="font-medium">{r.criterion_name}</TinyCell>
                      <TinyCell>{Math.round(r.score)}/100</TinyCell>
                      <TinyCell className="text-gray-700 whitespace-pre-wrap">{r.rationale || "—"}</TinyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Startup qualities table (right) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Startup Qualities</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 text-gray-600 text-sm">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-1/5">Quality</th>
                    <th className="px-3 py-2 text-left font-medium w-1/12">Score</th>
                    <th className="px-3 py-2 text-left font-medium">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data.tables?.startup || []).map((r, i) => (
                    <tr key={i} className="align-top">
                      <TinyCell className="font-medium">{r.criterion_name}</TinyCell>
                      <TinyCell>{Math.round(r.score)}/100</TinyCell>
                      <TinyCell className="text-gray-700 whitespace-pre-wrap">{r.rationale || "—"}</TinyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
