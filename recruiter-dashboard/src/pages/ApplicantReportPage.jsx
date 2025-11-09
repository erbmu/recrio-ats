// src/pages/ApplicantReportPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, API_ORIGIN, tokenStore } from "../api/client";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";

const toDisplayScore = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};

const labelFromKey = (key = "") =>
  key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const CATEGORY_ORDER = ["technicalSkills", "experience", "culturalFit", "projectAlignment"];

const clampScore = (value) => {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return 0;
  if (num >= 100) return 100;
  return num;
};

const adjustedScore = (value, gamma) => {
  const clamped = clampScore(value);
  if (clamped == null) return null;
  return 100 * Math.pow(clamped / 100, gamma);
};

const combineScores = (simulationScore, careerCardScore) => {
  const ws = 0.7;
  const wc = 0.3;
  const hasSim = simulationScore != null && Number.isFinite(Number(simulationScore));
  const hasCareer = careerCardScore != null && Number.isFinite(Number(careerCardScore));
  const denom = (hasSim ? ws : 0) + (hasCareer ? wc : 0);
  if (!denom) return { score: null, confidence: 0 };
  const numer =
    (hasSim ? ws * adjustedScore(simulationScore, 1.1) : 0) +
    (hasCareer ? wc * adjustedScore(careerCardScore, 1.0) : 0);
  const score = Math.max(0, Math.min(100, numer / denom));
  const confidence = Number((denom / (ws + wc)).toFixed(4));
  return { score, confidence };
};

export default function ApplicantReportPage() {
  const { applicantId } = useParams();
  const navigate = useNavigate();

  const [app, setApp] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [careerReport, setCareerReport] = React.useState(null);
  const [careerReportStatus, setCareerReportStatus] = React.useState({ loading: false, error: "" });

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
    return () => {
      mounted = false;
    };
  }, [applicantId]);

  const candidateReportId = React.useMemo(() => {
    if (app?.career_card_candidate_id) return String(app.career_card_candidate_id);
    if (app?.id != null) return String(app.id);
    return "";
  }, [app?.career_card_candidate_id, app?.id]);

  React.useEffect(() => {
    if (!candidateReportId) {
      setCareerReport(null);
      setCareerReportStatus({ loading: false, error: "" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setCareerReportStatus({ loading: true, error: "" });
        const data = await api(`/career-card-reports/${encodeURIComponent(candidateReportId)}`);
        if (cancelled) return;
        setCareerReport(data || null);
        setCareerReportStatus({ loading: false, error: "" });
      } catch (fetchErr) {
        if (cancelled) return;
        const status = fetchErr?.__debug?.status;
        let message;
        if (status === 404) {
          message = "No Gemini scoring cached yet. Trigger the workflow from Apply or retry later.";
        } else if (fetchErr?.message && fetchErr.message !== "Server error") {
          message = fetchErr.message;
        } else {
          message = "Unable to load the career card scoring report.";
        }
        setCareerReport(null);
        setCareerReportStatus({ loading: false, error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateReportId]);

  const careerReportSummary = React.useMemo(() => {
    if (!careerReport) return null;
    const categories = CATEGORY_ORDER.map((key) => {
      const value = careerReport?.category_scores?.[key] || {};
      const score = typeof value?.score === "number" ? value.score : Number(value?.score);
      return {
        key,
        score: toDisplayScore(score),
        feedback: typeof value?.feedback === "string" ? value.feedback.trim() : "",
      };
    });
    const strengths = Array.isArray(careerReport?.strengths)
      ? careerReport.strengths.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    const improvements = Array.isArray(careerReport?.improvements)
      ? careerReport.improvements.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    const feedback =
      (typeof careerReport?.overall_feedback === "string" && careerReport.overall_feedback.trim()) ||
      (typeof careerReport?.raw_report?.scoring?.overallFeedback === "string"
        ? careerReport.raw_report.scoring.overallFeedback.trim()
        : "");
    return {
      overall: toDisplayScore(careerReport?.overall_score),
      categories,
      strengths,
      improvements,
      feedback,
      generated_at: careerReport?.generated_at || careerReport?.updated_at || null,
    };
  }, [careerReport]);

  const analysisReport = app?.analysis_report || null;
  const analysisGeneratedAt = app?.analysis_generated_at || null;

  const simulationScoreRaw = React.useMemo(() => {
    const candidates = [
      app?.analysis_overall_score,
      analysisReport?.overallStartupReadinessIndex,
      app?.ai_scores?.overall ?? app?.ai_scores?.score ?? null,
    ];
    for (const val of candidates) {
      const num = clampScore(val);
      if (num != null) return num;
    }
    return null;
  }, [app?.analysis_overall_score, analysisReport?.overallStartupReadinessIndex, app?.ai_scores]);

  const careerCardScoreRaw = React.useMemo(() => {
    const raw = careerReportSummary?.overall ?? null;
    return clampScore(raw);
  }, [careerReportSummary?.overall]);

  const overallComposite = React.useMemo(() => {
    if (typeof app?.overall_score === "number") {
      const clamped = clampScore(app.overall_score);
      if (clamped != null) return clamped;
    }
    const { score } = combineScores(simulationScoreRaw, careerCardScoreRaw);
    return score;
  }, [app?.overall_score, simulationScoreRaw, careerCardScoreRaw]);

  const hasOverallScore = overallComposite != null && overallComposite > 0;
  const overallScore = hasOverallScore ? toDisplayScore(overallComposite) : null;

  const recommendation = React.useMemo(() => {
    if (!hasOverallScore || overallScore == null) return null;
    if (overallScore >= 80) {
      return {
        title: "Move forward confidently",
        body: "This candidate shows a very strong match across simulations and their career card. Keep the momentum and advance them.",
        icon: "↑",
        border: "border-emerald-200",
        iconBg: "bg-emerald-600 text-white",
        badgeBg: "bg-emerald-50 text-emerald-700",
      };
    }
    if (overallScore >= 60) {
      return {
        title: "Worth continued consideration",
        body: "The blended signals are encouraging. Proceed while validating the areas flagged in the report.",
        icon: "↗",
        border: "border-amber-200",
        iconBg: "bg-amber-500 text-white",
        badgeBg: "bg-amber-50 text-amber-700",
      };
    }
    return {
      title: "Hold before advancing",
      body: "Key indicators fell below the recommended range. Revisit this profile before committing to next steps.",
      icon: "!",
      border: "border-rose-200",
      iconBg: "bg-rose-500 text-white",
      badgeBg: "bg-rose-50 text-rose-700",
    };
  }, [hasOverallScore, overallScore]);

  const analysisText = React.useMemo(() => {
    if (!analysisReport || typeof analysisReport !== "object") return "";
    const candidates = ["analysis", "summary", "text"];
    for (const field of candidates) {
      const val = analysisReport[field];
      if (typeof val === "string" && val.trim()) {
        return val.trim();
      }
    }
    return "";
  }, [analysisReport]);

  const analysisDimensions = React.useMemo(() => {
    if (!analysisReport || typeof analysisReport !== "object") return [];
    return Object.entries(analysisReport)
      .filter(([key]) => !["overallStartupReadinessIndex", "analysis", "summary", "text"].includes(key))
      .map(([key, value]) => {
        if (value == null) return null;
        if (typeof value === "number" || typeof value === "string") {
          const score = toDisplayScore(value);
          return { key, score, summary: "" };
        }
        if (typeof value === "object" && !Array.isArray(value)) {
          let score =
            value.score ??
            value.value ??
            value.index ??
            value.overall ??
            value.percentage ??
            value.scaled ??
            null;
          if (score != null) {
            const n = Number(score);
            score = Number.isFinite(n) ? n : null;
          }
          let summary =
            value.analysis ??
            value.summary ??
            value.text ??
            value.comment ??
            value.description ??
            value.detail ??
            value.reason ??
            "";
          if (typeof summary !== "string") summary = "";
          summary = summary.trim();
          return { key, score, summary };
        }
        return null;
      })
      .filter(Boolean);
  }, [analysisReport]);

  const careerReportSummary = React.useMemo(() => {
    if (!careerReport) return null;
    const categories = CATEGORY_ORDER.map((key) => {
      const value = careerReport?.category_scores?.[key] || {};
      const score = typeof value?.score === "number" ? value.score : Number(value?.score);
      return {
        key,
        score: toDisplayScore(score),
        feedback: typeof value?.feedback === "string" ? value.feedback.trim() : "",
      };
    });
    const strengths = Array.isArray(careerReport?.strengths)
      ? careerReport.strengths.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    const improvements = Array.isArray(careerReport?.improvements)
      ? careerReport.improvements.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    const feedback =
      (typeof careerReport?.overall_feedback === "string" && careerReport.overall_feedback.trim()) ||
      (typeof careerReport?.raw_report?.scoring?.overallFeedback === "string"
        ? careerReport.raw_report.scoring.overallFeedback.trim()
        : "");
    return {
      overall: toDisplayScore(careerReport?.overall_score),
      categories,
      strengths,
      improvements,
      feedback,
      generated_at: careerReport?.generated_at || careerReport?.updated_at || null,
    };
  }, [careerReport]);

  const violations = React.useMemo(() => {
    const rows = app?.simulation_violations;
    if (!Array.isArray(rows)) return [];
    return rows.map((v, idx) => ({
      id: v?.id ?? idx,
      type: (typeof v?.type === "string" && v.type) || "",
      created_at: v?.created_at ?? null,
    }));
  }, [app?.simulation_violations]);

  const identity = app?.simulation_identity || {};
  const hasIdentity = !!(identity.selfie_url || identity.id_url);

  const openFile = async (kind, filenameHint = "file") => {
    if (!app) return;
    const token = tokenStore.get();
    if (!token) {
      alert("You must be signed in to view files.");
      return;
    }
    const url = `${API_ORIGIN || API}/api/applications/${app.id}/file/${kind}`;

    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!r.ok) {
        const msg = `Failed to open file (${r.status})`;
        try {
          const j = await r.json();
          alert(j?.error ? `${msg}: ${j.error}` : msg);
        } catch {
          alert(msg);
        }
        return;
      }
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      if (!win) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filenameHint;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
    } catch (e) {
      alert(e?.message || "Failed to open file");
    }
  };

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
          {recommendation && (
            <div className={`mb-6 rounded-2xl border ${recommendation.border} bg-white shadow-sm`}>
              <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${recommendation.iconBg}`}>
                    {recommendation.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{recommendation.title}</p>
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed">{recommendation.body}</p>
                  </div>
                </div>
                <div className={`inline-flex items-baseline gap-2 rounded-xl px-4 py-2 text-sm font-medium ${recommendation.badgeBg}`}>
                  <span>Overall score</span>
                  <span className="text-2xl font-semibold">{overallScore ?? "—"}</span>
                  <span className="text-xs font-normal">/100</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-10">
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Candidate Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700">
              <div><span className="text-gray-500">Name:</span> {app.candidate_name || "—"}</div>
              <div><span className="text-gray-500">Email:</span> {app.candidate_email || "—"}</div>
              {app.phone && (<div><span className="text-gray-500">Phone:</span> {app.phone}</div>)}
              {(app.city || app.country) && (
                <div>
                  <span className="text-gray-500">Location:</span>{" "}
                  {[app.city, app.country].filter(Boolean).join(", ")}
                </div>
              )}
              {app.linkedin_url && (
                <div className="truncate">
                  <span className="text-gray-500">LinkedIn:</span>{" "}
                  <a href={app.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {app.linkedin_url}
                  </a>
                </div>
              )}
              {app.portfolio_url && (
                <div className="truncate">
                  <span className="text-gray-500">Portfolio:</span>{" "}
                  <a href={app.portfolio_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    {app.portfolio_url}
                  </a>
                </div>
              )}
              {app.current_title && (
                <div><span className="text-gray-500">Current title:</span> {app.current_title}</div>
              )}
              {app.years_experience != null && (
                <div><span className="text-gray-500">Years of experience:</span> {app.years_experience}</div>
              )}
              {app.salary_expectation && (
                <div><span className="text-gray-500">Expected salary:</span> {app.salary_expectation}</div>
              )}
              {app.work_auth && (
                <div><span className="text-gray-500">Work authorization:</span> {app.work_auth}</div>
              )}
              {app.work_pref && (
                <div><span className="text-gray-500">Work preference:</span> {app.work_pref}</div>
              )}
              {app.relocate != null && (
                <div><span className="text-gray-500">Open to relocation:</span> {app.relocate ? "Yes" : "No"}</div>
              )}
              {app.dob && (
                <div><span className="text-gray-500">DOB:</span> {new Date(app.dob).toLocaleDateString()}</div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-800">AI Simulation Evaluation</h2>
              {analysisGeneratedAt && (
                <time className="text-xs uppercase tracking-wide text-gray-500">
                  Generated on {new Date(analysisGeneratedAt).toLocaleString()}
                </time>
              )}
          </div>

          {analysisReport ? (
            <>
              {analysisText && (
                  <p className="mt-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {analysisText}
                  </p>
                )}

                <div className="mt-6">
                  <div className="text-sm text-gray-500">Overall readiness</div>
                  <div className="text-4xl font-semibold text-gray-900 mt-1">
                    {overallScore ?? "—"}
                    <span className="text-lg text-gray-400 ml-2">/100</span>
                  </div>
                </div>

                {analysisDimensions.length > 0 ? (
                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {analysisDimensions.map(({ key, score, summary }) => (
                      <div key={key} className="rounded-lg border border-gray-200 px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium text-gray-900">{labelFromKey(key)}</span>
                          <span className="text-sm text-gray-600">
                            {toDisplayScore(score) != null ? `${toDisplayScore(score)}/100` : "—"}
                          </span>
                        </div>
                        {summary && (
                          <p className="mt-2 text-sm text-gray-600 leading-relaxed">{summary}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-600">
                    The detailed dimension breakdown will appear here once available.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-600 mt-2">
                AI analysis not yet available. Check back once the simulation has finished processing.
              </p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Career Card Scoring</h2>
                <p className="text-sm text-gray-500">
                  Evaluates how well the candidate’s background aligns with the role requirements and company story.
                </p>
              </div>
              {careerReportSummary?.generated_at && (
                <time className="text-xs uppercase tracking-wide text-gray-500">
                  Cached {new Date(careerReportSummary.generated_at).toLocaleString()}
                </time>
              )}
            </div>

            {careerReportStatus.loading && (
              <p className="mt-4 text-sm text-gray-600">Fetching the latest scoring report…</p>
            )}

            {!careerReportStatus.loading && careerReportStatus.error && (
              <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {careerReportStatus.error}
              </div>
            )}

            {!careerReportStatus.loading &&
              !careerReportStatus.error &&
              !careerReportSummary && (
                <p className="mt-4 text-sm text-gray-600">
                  The candidate’s career card hasn’t been scored yet. Trigger the scoring workflow from the
                  application intake form or retry later.
                </p>
              )}

            {careerReportSummary && (
              <>
                <div className="mt-6 flex flex-wrap items-end gap-6">
                  <div>
                    <div className="text-sm text-gray-500">Overall alignment</div>
                    <div className="mt-1 text-4xl font-semibold text-gray-900">
                      {careerReportSummary.overall ?? "—"}
                      <span className="ml-2 text-lg text-gray-400">/100</span>
                    </div>
                  </div>
                  {careerReportSummary.strengths.length > 0 && (
                    <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-900">Standout:</span>{" "}
                      {careerReportSummary.strengths[0]}
                    </div>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {careerReportSummary.categories.map((cat) => (
                    <div key={cat.key} className="rounded-xl border border-gray-200 px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900">{labelFromKey(cat.key)}</span>
                        <span className="text-sm text-gray-600">
                          {cat.score != null ? `${cat.score}/100` : "—"}
                        </span>
                      </div>
                      {cat.feedback && (
                        <p className="mt-2 text-sm text-gray-600 leading-relaxed">{cat.feedback}</p>
                      )}
                    </div>
                  ))}
                </div>

                {(careerReportSummary.strengths.length > 0 ||
                  careerReportSummary.improvements.length > 0) && (
                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {careerReportSummary.strengths.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-emerald-700">Strengths</div>
                        <ul className="mt-2 space-y-1 text-sm text-gray-700">
                          {careerReportSummary.strengths.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-emerald-500">{"\u2022"}</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {careerReportSummary.improvements.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-amber-700">Improvements</div>
                        <ul className="mt-2 space-y-1 text-sm text-gray-700">
                          {careerReportSummary.improvements.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-amber-500">{"\u2022"}</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {careerReportSummary.feedback && (
                  <div className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 leading-relaxed">
                    {careerReportSummary.feedback}
                  </div>
                )}
              </>
            )}
          </div>

          {violations.length > 0 && (
            <div className="bg-white border border-red-100 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800">Simulation Violations</h3>
              <ul className="mt-3 space-y-3">
                {violations.map((v) => (
                  <li key={v.id} className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-red-600">
                        {labelFromKey(v.type || "Violation")}
                      </span>
                      {v.created_at && (
                        <time className="text-xs text-red-500">
                          {new Date(v.created_at).toLocaleString()}
                        </time>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasIdentity && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800">Identity Verification</h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {identity.selfie_url && (
                    <div>
                      <div className="text-sm text-gray-600 mb-2">Selfie Capture</div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                        <img
                          src={identity.selfie_url}
                          alt="Selfie capture"
                          className="max-h-72 w-full object-contain bg-gray-50"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}
                  {identity.id_url && (
                    <div>
                      <div className="text-sm text-gray-600 mb-2">Government ID</div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                        <img
                          src={identity.id_url}
                          alt="ID capture"
                          className="max-h-72 w-full object-contain bg-gray-50"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {(app.files?.career_card || app.files?.resume) && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mt-10">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Submitted files</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                {app.files?.career_card && (
                  <li>
                    Career Card —{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        openFile("career_card", app.files.career_card.name || "career_card.pdf");
                      }}
                      className="text-blue-600 hover:underline"
                      title="Open career card"
                    >
                      {app.files.career_card.name} ({app.files.career_card.mime})
                    </a>
                  </li>
                )}
                {app.files?.resume && (
                  <li>
                    Resume —{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        openFile("resume", app.files.resume.name || "resume.pdf");
                      }}
                      className="text-blue-600 hover:underline"
                      title="Open resume"
                    >
                      {app.files.resume.name} ({app.files.resume.mime})
                    </a>
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
