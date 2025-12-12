// src/pages/ApplicantReportPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, API_ORIGIN, tokenStore } from "../api/client";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";

const ANALYSIS_METRIC_DEFINITIONS = [
  { label: "Startup Readiness", paths: ["overallStartupReadinessIndex", "overallScore", "scores.overallScore"] },
  { label: "Founder Fit", paths: ["founderFitIndex", "scores.founderFitIndex"] },
  { label: "Business Impact", paths: ["businessImpactScore", "scores.businessImpactScore"] },
  { label: "Technical Accuracy", paths: ["technicalAccuracy", "scores.technicalAccuracy"] },
  { label: "Adaptability", paths: ["adaptability", "scores.adaptability"] },
  { label: "Learning Agility", paths: ["learningAgility", "scores.learningAgility"] },
  { label: "Trade-off Analysis", paths: ["tradeOffAnalysis", "scores.tradeOffAnalysis"] },
  { label: "Execution Bias", paths: ["biasTowardExecution", "scores.biasTowardExecution"] },
  { label: "Communication", paths: ["communicationClarity", "scores.communicationClarity"] },
  { label: "Creativity", paths: ["creativityInnovationIndex", "scores.creativityInnovationIndex"] },
];

const CAREER_CARD_CATEGORY_DEFS = [
  { key: "technicalSkills", label: "Technical Skills" },
  { key: "experience", label: "Experience" },
  { key: "culturalFit", label: "Cultural Fit" },
  { key: "projectAlignment", label: "Project Alignment" },
];

const normalizeScore = (value) => {
  if (value == null) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
};

const computeCompositeScore = (simulationScore, careerCardScore) => {
  const ws = 0.7;
  const wc = 0.3;
  const sim = normalizeScore(simulationScore);
  const card = normalizeScore(careerCardScore);
  const Is = sim != null ? 1 : 0;
  const Ic = card != null ? 1 : 0;
  const denom = Is * ws + Ic * wc;
  if (denom === 0) {
    return { score: null, confidence: 0 };
  }
  const transform = (value, gamma) => {
    const clamped = Math.max(0, Math.min(100, value ?? 0));
    return 100 * Math.pow(clamped / 100, gamma);
  };
  const numerator =
    (Is ? ws * transform(sim, 1.1) : 0) + (Ic ? wc * transform(card, 1.0) : 0);
  const score = numerator / denom;
  const confidence = denom / (ws + wc);
  return {
    score: Number(score.toFixed(2)),
    confidence: Number(confidence.toFixed(4)),
  };
};

export default function ApplicantReportPage() {
  const { jobId, applicantId } = useParams();
  const navigate = useNavigate();

  const [app, setApp] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [artifacts, setArtifacts] = React.useState(null);
  const [artifactsErr, setArtifactsErr] = React.useState("");
  const [loadingArtifacts, setLoadingArtifacts] = React.useState(true);
  const [showRawAnalysis, setShowRawAnalysis] = React.useState(false);

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

  React.useEffect(() => {
    let cancelled = false;
    setLoadingArtifacts(true);
    setArtifacts(null);
    setArtifactsErr("");
    (async () => {
      try {
        const data = await api(`/api/applications/${applicantId}/simulation/artifacts`);
        if (!cancelled) {
          setArtifacts(data || null);
        }
      } catch (e) {
        if (!cancelled) {
          setArtifactsErr(e.message || "Failed to load simulation artifacts");
        }
      } finally {
        if (!cancelled) setLoadingArtifacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicantId]);

  const simSummary = app?.ai_summary || null;

  // Authenticated open of file (preview in new tab)
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
      // open in new tab
      const win = window.open(blobUrl, "_blank", "noopener");
      // best-effort revoke after tab opens
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      if (!win) {
        // popup blocked — fallback download
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

  const identity = artifacts?.identity || {};
  const violations = Array.isArray(artifacts?.violations) ? artifacts.violations : [];
  const analysisReport = artifacts?.analysis_report && typeof artifacts.analysis_report === "object"
    ? artifacts.analysis_report
    : null;

  const readAnalysisValue = (paths = []) => {
    if (!analysisReport) return null;
    for (const path of paths) {
      const segments = path.split(".");
      let cursor = analysisReport;
      let found = true;
      for (const segment of segments) {
        if (cursor == null || typeof cursor !== "object" || !(segment in cursor)) {
          found = false;
          break;
        }
        cursor = cursor[segment];
      }
      if (found && cursor != null) return cursor;
    }
    return null;
  };

  const analysisNarrative =
    (typeof artifacts?.analysis_report === "string" && artifacts.analysis_report) ||
    analysisReport?.analysis ||
    analysisReport?.summary ||
    analysisReport?.Overview ||
    null;
  const rawAnalysisString = artifacts?.analysis_report
    ? typeof artifacts.analysis_report === "string"
      ? artifacts.analysis_report
      : JSON.stringify(artifacts.analysis_report, null, 2)
    : "";

  const careerCardReport = artifacts?.career_card_report || null;
  const careerCardScore = normalizeScore(careerCardReport?.overall_score);
  const careerCardCategories = CAREER_CARD_CATEGORY_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    data: careerCardReport?.category_scores?.[def.key] || null,
  }));
  const careerCardStrengths = Array.isArray(careerCardReport?.strengths)
    ? careerCardReport.strengths.filter((item) => typeof item === "string" && item.trim())
    : [];
  const careerCardImprovements = Array.isArray(careerCardReport?.improvements)
    ? careerCardReport.improvements.filter((item) => typeof item === "string" && item.trim())
    : [];
  const careerCardFeedback = typeof careerCardReport?.overall_feedback === "string"
    ? careerCardReport.overall_feedback.trim()
    : "";
  const careerCardGeneratedAt = careerCardReport?.generated_at || careerCardReport?.created_at || null;

  const analysisMetrics = ANALYSIS_METRIC_DEFINITIONS.map((def) => ({
    label: def.label,
    value: readAnalysisValue(def.paths),
  }));
  const hasAnalysisMetrics = analysisMetrics.some((metric) => metric.value != null);

  const overallScoreValue = readAnalysisValue([
    "overallStartupReadinessIndex",
    "overallScore",
    "scores.overallScore",
    "score",
  ]);

  const formatScoreValue = (value) => {
    if (value == null) return "—";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    const rounded = n <= 1 ? Math.round(n * 100) : Math.round(n);
    return `${rounded}/100`;
  };

  const formatViolationType = (value) => {
    if (!value) return "Integrity alert";
    return String(value)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const formatDateTime = (value) => {
    if (!value) return "Time unavailable";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  const buildImageSrc = (rawData, fallbackUrl) => {
    if (rawData && typeof rawData === "string") {
      if (rawData.startsWith("data:")) return rawData;
      return `data:image/png;base64,${rawData}`;
    }
    return fallbackUrl || null;
  };
  const selfieSrc = buildImageSrc(identity.selfie_data, identity.selfie_url);
  const idSrc = buildImageSrc(identity.id_data, identity.id_url);

  const simulationScore = normalizeScore(overallScoreValue);
  const combinedScore = computeCompositeScore(simulationScore, careerCardScore);
  const primaryReportText = app?.simulation?.summary || analysisNarrative || simSummary;
  const showInsightNarrative = Boolean(analysisNarrative && primaryReportText !== analysisNarrative);

  const recommendation = (() => {
    if (simulationScore == null) {
      return {
        tone: "neutral",
        title: "Await simulation completion",
        message: "Hold off on a decision until the candidate submits their simulation responses.",
        badge: "Awaiting simulation",
      };
    }
    if (simulationScore >= 80) {
      return {
        tone: "positive",
        title: "Recommended to proceed",
        message: "This candidate’s simulation signals high alignment with the role expectations.",
        badge: "Proceed",
      };
    }
    if (simulationScore >= 60) {
      return {
        tone: "warning",
        title: "Worth consideration",
        message: "Performance is mixed. Review the report to confirm fit before advancing.",
        badge: "Review closely",
      };
    }
    return {
      tone: "negative",
      title: "Not recommended",
      message: "Signals suggest this candidate is unlikely to succeed in the role. Consider other applicants.",
      badge: "Decline",
    };
  })();
  const recommendationStyles = {
    positive: { card: "bg-emerald-50 border-emerald-200 text-emerald-900", badge: "bg-emerald-600 text-white" },
    warning: { card: "bg-amber-50 border-amber-200 text-amber-900", badge: "bg-amber-600 text-white" },
    negative: { card: "bg-rose-50 border-rose-200 text-rose-900", badge: "bg-rose-600 text-white" },
    neutral: { card: "bg-gray-50 border-gray-200 text-gray-800", badge: "bg-gray-600 text-white" },
  };
  const tone = recommendationStyles[recommendation.tone] || recommendationStyles.neutral;
  const hasMultipleViolations = violations.length > 1;

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
          {/* Recommendation + score */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
            <div className={`rounded-2xl border px-6 py-5 shadow-sm ${tone.card}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wide opacity-80">Recommendation</p>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${tone.badge}`}>
                  {recommendation.badge}
                </span>
              </div>
              <p className="text-lg font-semibold">{recommendation.title}</p>
              <p className="text-sm mt-1 leading-relaxed">{recommendation.message}</p>
              {hasMultipleViolations && (
                <p className="text-xs text-rose-700 mt-3 font-medium">
                  This candidate triggered multiple integrity violations—please review them carefully before moving forward.
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Overall candidate score</p>
              <p className="text-3xl font-semibold text-gray-900 mt-2">
                {formatScoreValue(combinedScore.score)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Based on simulation ({formatScoreValue(simulationScore)}) and career card ({formatScoreValue(careerCardScore)}).
              </p>
            </div>
          </div>

          {/* Candidate Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-10 shadow-sm">
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

          <div className="space-y-8">
            <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Simulation Report</h2>
                {overallScoreValue != null && (
                  <span className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 bg-gray-50">
                    Score: {formatScoreValue(overallScoreValue)}
                  </span>
                )}
              </div>
              {primaryReportText ? (
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{primaryReportText}</p>
              ) : (
                <p className="text-gray-700 text-sm leading-relaxed">
                  The applicant’s simulation breakdown and transcripts will appear here when your
                  simulation pipeline posts results. Until then, the category-wise scores above serve
                  as the summary.
                </p>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Simulation Insights</h3>
                {rawAnalysisString && (
                  <button
                    type="button"
                    onClick={() => setShowRawAnalysis((prev) => !prev)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    {showRawAnalysis ? "Hide JSON" : "View JSON"}
                  </button>
                )}
              </div>
              {loadingArtifacts ? (
                <p className="text-sm text-gray-500">Loading insights…</p>
              ) : artifactsErr ? (
                <p className="text-sm text-red-600">{artifactsErr}</p>
              ) : analysisReport || analysisNarrative ? (
                <div className="space-y-4">
                  {showInsightNarrative && (
                    <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4 text-sm leading-relaxed text-gray-800 shadow-inner">
                      {analysisNarrative}
                    </div>
                  )}
                  {hasAnalysisMetrics && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {analysisMetrics.map((metric) => (
                        <div
                          key={metric.label}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
                        >
                          <p className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</p>
                          <p className="text-lg font-semibold text-gray-900 mt-1">
                            {formatScoreValue(metric.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {showRawAnalysis && rawAnalysisString && (
                    <pre className="bg-gray-50 border border-gray-200 rounded-md p-4 text-xs overflow-x-auto text-gray-800">
                      {rawAnalysisString}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No structured analysis report has been generated yet.</p>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Career Card Assessment</h3>
                {careerCardScore != null && (
                  <span className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 bg-gray-50">
                    Score: {formatScoreValue(careerCardScore)}
                  </span>
                )}
              </div>
              {loadingArtifacts ? (
                <p className="text-sm text-gray-500">Loading career card report…</p>
              ) : artifactsErr ? (
                <p className="text-sm text-red-600">{artifactsErr}</p>
              ) : careerCardReport ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {careerCardCategories.map((category) => (
                      <div key={category.key} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-gray-500">{category.label}</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">
                          {formatScoreValue(category.data?.score)}
                        </p>
                        {category.data?.feedback && (
                          <p className="text-xs text-gray-600 mt-1">{category.data.feedback}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {careerCardFeedback && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-relaxed text-indigo-900 shadow-inner">
                      {careerCardFeedback}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-emerald-800 font-semibold mb-2">Strengths</p>
                      {careerCardStrengths.length ? (
                        <ul className="list-disc list-inside text-sm text-emerald-900 space-y-1">
                          {careerCardStrengths.map((item, idx) => (
                            <li key={`${item}-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-emerald-900">No standout strengths recorded.</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-rose-800 font-semibold mb-2">Improvements</p>
                      {careerCardImprovements.length ? (
                        <ul className="list-disc list-inside text-sm text-rose-900 space-y-1">
                          {careerCardImprovements.map((item, idx) => (
                            <li key={`${item}-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-rose-900">No gaps were flagged.</p>
                      )}
                    </div>
                  </div>
                  {careerCardGeneratedAt && (
                    <p className="text-xs text-gray-400">
                      Generated {new Date(careerCardGeneratedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Career card report is not available yet.</p>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-3">Identity Verification</p>
              {loadingArtifacts ? (
                <p className="text-sm text-gray-500">Loading identity images…</p>
              ) : selfieSrc || idSrc ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-4 py-2 border-b border-gray-200 text-sm font-semibold text-gray-700">
                      Selfie
                    </div>
                    {selfieSrc ? (
                      <img src={selfieSrc} alt="Selfie verification" className="w-full object-cover" />
                    ) : (
                      <p className="p-4 text-sm text-gray-500">Not provided</p>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    <div className="px-4 py-2 border-b border-gray-200 text-sm font-semibold text-gray-700">
                      Photo ID
                    </div>
                    {idSrc ? (
                      <img src={idSrc} alt="ID verification" className="w-full object-cover" />
                    ) : (
                      <p className="p-4 text-sm text-gray-500">Not provided</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Identity check images are not available yet.</p>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <p className="text-sm font-semibold text-gray-900 mb-3">Integrity Monitoring</p>
              {loadingArtifacts ? (
                <p className="text-sm text-gray-500">Loading proctoring events…</p>
              ) : violations.length ? (
                <ul className="space-y-3">
                  {violations.map((violation, idx) => (
                    <li
                      key={violation.id || `${violation.type}-${idx}`}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                    >
                      <p className="font-semibold">{formatViolationType(violation.type)}</p>
                      <p className="text-xs text-amber-800 mt-0.5">{formatDateTime(violation.created_at)}</p>
                      {violation.meta && (
                        <p className="mt-1 text-xs text-amber-900">
                          {typeof violation.meta === "string" ? violation.meta : JSON.stringify(violation.meta)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : simulationScore == null && !violations.length ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  Awaiting simulation. Integrity checks will display once the candidate completes their exercise.
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Candidate completed the simulation with no reported proctoring violations.
                </div>
              )}
            </section>
            {(app.files?.career_card || app.files?.resume) && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Submitted files</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  {app.files?.career_card && (
                    <li>
                      Career Card —{" "}
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); openFile("career_card", app.files.career_card.name || "career_card.pdf"); }}
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
                        onClick={(e) => { e.preventDefault(); openFile("resume", app.files.resume.name || "resume.pdf"); }}
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

            {/* Links to each response analysis */}
            {app.simulation?.analyses?.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Per-response analyses</h3>
                <ul className="text-sm text-gray-700 space-y-2">
                  {app.simulation.analyses.map((an, idx) => (
                    <li key={an.id}>
                      <a
                        className="text-blue-600 hover:underline"
                        href={`/dashboard/job/${app.job_id}/applicant/${app.id}/analysis/${an.id}`}
                      >
                        {idx + 1}. {an.label} {Number.isFinite(an.final_score) ? `— ${Math.round(an.final_score)}/100` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              )}
          </div>
        </>
      )}
    </div>
  );
}
