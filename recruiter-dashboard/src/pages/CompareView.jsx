import React from "react";
import { api } from "../api/client";

export default function CompareView() {
  const [jobs, setJobs] = React.useState([]);
  const [selectedJob, setSelectedJob] = React.useState("");
  const [candidates, setCandidates] = React.useState([]);
  const [candidateA, setCandidateA] = React.useState("");
  const [candidateB, setCandidateB] = React.useState("");
  const [copy, setCopy] = React.useState("");
  const [status, setStatus] = React.useState({ loading: false, error: "", result: null });
  const [loadingJobs, setLoadingJobs] = React.useState(true);
  const [loadingCandidates, setLoadingCandidates] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingJobs(true);
        const data = await api("/api/compare/jobs");
        if (!mounted) return;
        setJobs(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setStatus((prev) => ({ ...prev, error: err.message || "Failed to load jobs." }));
      } finally {
        if (mounted) setLoadingJobs(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleJobChange = async (jobId) => {
    setSelectedJob(jobId);
    setCandidateA("");
    setCandidateB("");
    setStatus({ loading: false, error: "", result: null });
    if (!jobId) {
      setCandidates([]);
      return;
    }
    try {
      setLoadingCandidates(true);
      const data = await api(`/api/compare/jobs/${jobId}/candidates`);
      setCandidates(Array.isArray(data) ? data : []);
    } catch (err) {
      setStatus((prev) => ({ ...prev, error: err.message || "Failed to load candidates." }));
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleCompare = async () => {
    if (!selectedJob || !candidateA || !candidateB || candidateA === candidateB) {
      setStatus((prev) => ({ ...prev, error: "Select two different candidates." }));
      return;
    }
    try {
      setStatus({ loading: true, error: "", result: null });
      const payload = {
        jobId: selectedJob,
        candidateAId: candidateA,
        candidateBId: candidateB,
        customInstructions: copy.trim(),
      };
      const data = await api("/api/compare/analyze", {
        method: "POST",
        body: payload,
      });
      setStatus({ loading: false, error: "", result: data });
    } catch (err) {
      setStatus({
        loading: false,
        error: err?.__debug?.body || err.message || "Comparison failed.",
        result: null,
      });
    }
  };

  const compareDescription =
    "Compare candidates side-by-side and let AI highlight who best aligns with the role and company context.";

  const disableOption = (id, other) => other && other === id;

  const emptyState = !loadingJobs && jobs.length === 0;
  const parsedReport = React.useMemo(() => {
    if (!status.result?.report) return null;
    const raw = status.result.report
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const sectionTitles = [
      "Overview",
      "Strengths & Risks",
      "Comparative Analysis",
      "Final Verdict",
    ];
    const sections = [];
    let current = null;
    const startSection = (title) => {
      const normalized = sectionTitles.find(
        (t) => t.toLowerCase() === title.toLowerCase()
      );
      const section = {
        title: normalized || title || "Overview",
        content: [],
      };
      sections.push(section);
      return section;
    };
    for (const line of raw) {
      const match = line.match(
        /^[-*]?\s*(Overview|Strengths & Risks|Comparative Analysis|Final Verdict)\s*:?/i
      );
      if (match) {
        current = startSection(match[1]);
        const remaining = line.slice(match[0].length).trim();
        if (remaining) current.content.push(remaining);
      } else if (line.match(/^[-*]?\s*Recommended:/i)) {
        continue;
      } else {
        if (!current) current = startSection("Overview");
        current.content.push(line);
      }
    }
    const recommendationLine = raw.find((line) =>
      /Recommended:/i.test(line)
    );
    const recommendation = recommendationLine
      ? recommendationLine.replace(/^[-*]?\s*Recommended:\s*/i, "").trim()
      : "";
    return { sections, recommendation };
  }, [status.result]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Compare Candidates</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            {compareDescription}
          </p>
        </div>

        {emptyState ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-600">
            You don’t have any jobs yet. Create a posting to start comparing candidates.
          </div>
        ) : (
          <>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Job</label>
            <select
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
              value={selectedJob}
              onChange={(e) => handleJobChange(e.target.value)}
            >
              <option value="">{loadingJobs ? "Loading jobs…" : "Choose a job"}</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>

          {[{ label: "Candidate A", setter: setCandidateA, value: candidateA, other: candidateB },
            { label: "Candidate B", setter: setCandidateB, value: candidateB, other: candidateA }].map(
            ({ label, setter, value, other }, idx) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                <select
                  disabled={!selectedJob || loadingCandidates}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                >
                  <option value="">
                    {!selectedJob ? "Choose a job first" : loadingCandidates ? "Loading…" : "Choose candidate"}
                  </option>
                  {candidates.map((candidate) => (
                    <option
                      key={candidate.id}
                      value={candidate.id}
                      disabled={disableOption(candidate.id, other)}
                    >
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Optional: Extra context or instructions
          </label>
          <textarea
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-gray-900/10"
            rows={3}
            placeholder="E.g., prioritize communication and leadership qualities."
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleCompare}
              disabled={
                status.loading ||
                !selectedJob ||
                !candidateA ||
                !candidateB ||
                candidateA === candidateB
              }
              className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              {status.loading ? "Comparing…" : "Compare with AI"}
            </button>
            <button
              onClick={() => {
                setCandidateA("");
                setCandidateB("");
                setCopy("");
                setStatus({ loading: false, error: "", result: null });
              }}
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
          {status.error && (
            <p className="mt-3 text-sm text-red-600">{status.error}</p>
          )}
        </div>

          </>
        )}

        {parsedReport && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-gray-900">AI Comparison Report</h2>
              <p className="text-sm text-gray-500">Job: {status.result.job?.title || "Selected role"}</p>
            </div>
            <div className="grid gap-4">
              {parsedReport.sections.map((section) => (
                <section
                  key={section.title}
                  className={`rounded-2xl border px-4 py-3 ${
                    section.title === "Final Verdict"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    {section.title}
                    {section.title === "Final Verdict" && (
                      <span className="inline-flex h-6 items-center rounded-full bg-emerald-100 px-2 text-xs font-medium text-emerald-800">
                        Verdict
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-2 text-sm text-gray-700 leading-relaxed">
                    {section.content.map((paragraph, idx) => {
                      const bullets = paragraph
                        .split(/-\s+/)
                        .map((line) => line.trim())
                        .filter((line) => line);
                      if (bullets.length > 1) {
                        return (
                          <ul key={idx} className="ml-4 list-disc space-y-1">
                            {bullets.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p key={idx} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            {parsedReport.recommendation && (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-white">
                <div className="text-sm uppercase tracking-wide text-gray-300">Recommended</div>
                <div className="text-lg font-semibold">{parsedReport.recommendation}</div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
