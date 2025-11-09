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
    "Compare candidates side-by-side and let AI highlight who best aligns with the role and company context";

  const disableOption = (id, other) => other && other === id;

  const emptyState = !loadingJobs && jobs.length === 0;
  const parsedReport = React.useMemo(() => {
    const report = status.result?.report;
    if (!report) return null;
    const candidateALabel = status.result?.candidates?.a?.name || "Candidate A";
    const candidateBLabel = status.result?.candidates?.b?.name || "Candidate B";
    const replaceLabels = (text = "") =>
      text
        .replace(/Candidate A/gi, candidateALabel)
        .replace(/Candidate B/gi, candidateBLabel);

    const lines = report
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const sectionMap = new Map();
    const ensureSection = (title) => {
      const key = title.toLowerCase();
      if (!sectionMap.has(key)) {
        sectionMap.set(key, { title, content: [] });
      }
      return sectionMap.get(key);
    };

    const defaultOrder = [
      "Overview",
      "Strengths & Risks",
      "Comparative Analysis",
      "Final Verdict",
    ];
    let current = ensureSection("Overview");
    let recommendation = "";

    const sectionRegex =
      /^[-*]?\s*(Overview|Strengths & Risks|Comparative Analysis|Final Verdict)\s*:?/i;

    for (const line of lines) {
      if (/^[-*]?\s*Recommended:/i.test(line)) {
        recommendation = line.replace(/^[-*]?\s*Recommended:\s*/i, "").trim();
        continue;
      }
      const match = line.match(sectionRegex);
      if (match) {
        current = ensureSection(match[1]);
        const rest = line.slice(match[0].length).trim();
        if (rest) current.content.push(rest);
        continue;
      }
      current.content.push(line);
    }

    const structureSections = [...defaultOrder, ...sectionMap.keys()]
      .filter((title, idx, arr) => arr.indexOf(title) === idx)
      .map((title) => sectionMap.get(title) || { title, content: [] });

    const decorateContent = (content) => {
      return content.flatMap((paragraph) => {
        const candidateMatch = paragraph.match(
          /(Candidate [AB])\s*:\s*(.*)/i
        );
        if (candidateMatch) {
          const label =
            candidateMatch[1].toLowerCase() === "candidate a"
              ? candidateALabel
              : candidateBLabel;
          return [
            {
              type: "candidate",
              label,
              text: replaceLabels(paragraph.replace(candidateMatch[1], label).replace(/^[-*]\s*/, "")),
            },
          ];
        }
        const items = paragraph
          .split(/-\s+/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (items.length > 1) {
          return [{ type: "list", items: items.map((item) => replaceLabels(item)) }];
        }
        return [{ type: "text", text: replaceLabels(paragraph) }];
      });
    };

    const sections = structureSections.map((section) => ({
      title: section.title,
      content: decorateContent(section.content),
    }));

    const normalizedRecommendation = replaceLabels(recommendation);

    return { sections, recommendation: normalizedRecommendation };
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
                  className={`rounded-2xl border px-4 py-3 space-y-2 ${
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
                  <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {section.content.map((block, idx) => {
                      if (block.type === "candidate") {
                        const badgeColor =
                          block.label.toLowerCase().includes("a")
                            ? "bg-gray-900 text-white"
                            : "bg-gray-200 text-gray-900";
                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-gray-200 bg-white px-3 py-2"
                          >
                            <div
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColor}`}
                            >
                              {block.label}
                            </div>
                            <p className="mt-1 text-gray-700">{block.text}</p>
                          </div>
                        );
                      }
                      if (block.type === "list") {
                        return (
                          <ul key={idx} className="ml-4 list-disc space-y-1">
                            {block.items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p key={idx} className="whitespace-pre-line">
                          {block.text}
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
