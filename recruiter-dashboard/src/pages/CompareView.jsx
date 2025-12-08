import React from "react";
import { api } from "../api/client";

const stringOrJson = (value) => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const withBoldMarkers = (value) =>
  stringOrJson(value).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

export default function CompareView() {
  const [allJobs, setAllJobs] = React.useState([]);
  const [selectedJob, setSelectedJob] = React.useState("");
  const [candidates, setCandidates] = React.useState([]);
  const [candidateA, setCandidateA] = React.useState("");
  const [candidateB, setCandidateB] = React.useState("");
  const [copy, setCopy] = React.useState("");
  const [status, setStatus] = React.useState({ loading: false, error: "", result: null });
  const [loadingJobs, setLoadingJobs] = React.useState(true);
  const [loadingCandidates, setLoadingCandidates] = React.useState(false);
  const [me, setMe] = React.useState(null);
  const isAgency = React.useMemo(
    () => (me?.recruiter_type || me?.recruiterType) === "agency",
    [me]
  );
  const [companies, setCompanies] = React.useState([]);
  const [companiesLoading, setCompaniesLoading] = React.useState(false);
  const [companiesError, setCompaniesError] = React.useState("");
  const [selectedCompanyId, setSelectedCompanyId] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await api("/api/me");
        if (!mounted) return;
        setMe(user?.user || user);
      } catch (err) {
        if (mounted) {
          setStatus((prev) => ({ ...prev, error: err.message || "Failed to load account info." }));
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingJobs(true);
        const data = await api("/api/compare/jobs");
        if (!mounted) return;
        setAllJobs(Array.isArray(data) ? data : []);
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

  React.useEffect(() => {
    if (!isAgency) return;
    let mounted = true;
    setCompaniesLoading(true);
    setCompaniesError("");
    (async () => {
      try {
        const res = await api("/api/company-profiles");
        if (!mounted) return;
        const list = Array.isArray(res?.profiles) ? res.profiles : [];
        setCompanies(list);
        const defaultProfile = list.find((p) => p.is_default) || list[0] || null;
        setSelectedCompanyId(defaultProfile?.id ? String(defaultProfile.id) : "");
      } catch (err) {
        if (mounted) setCompaniesError(err.message || "Failed to load companies.");
      } finally {
        if (mounted) setCompaniesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAgency]);

  React.useEffect(() => {
    if (!isAgency) return;
    setSelectedJob("");
    setCandidates([]);
    setCandidateA("");
    setCandidateB("");
  }, [isAgency, selectedCompanyId]);

  const jobs = React.useMemo(() => {
    if (!isAgency || !selectedCompanyId) return allJobs;
    return allJobs.filter(
      (job) => String(job.company_profile_id || "") === String(selectedCompanyId)
    );
  }, [allJobs, isAgency, selectedCompanyId]);

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
      const friendlyError = stringOrJson(
        err?.__debug?.body || err?.message || "Comparison failed."
      );
      setStatus({
        loading: false,
        error: friendlyError,
        result: null,
      });
    }
  };

  const compareDescription =
    "Compare candidates side-by-side and let AI highlight who best aligns with the role and company context";

  const disableOption = (id, other) => other && other === id;

  const emptyState = !loadingJobs && jobs.length === 0;
  const selectClass =
    "w-full appearance-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition focus:border-gray-900/40 focus:outline-none focus:ring-4 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400";
  const parsedReport = React.useMemo(() => {
    const report = stringOrJson(status.result?.report);
    if (!report) return null;
    const candidateALabel = status.result?.candidates?.a?.name || "Candidate A";
    const candidateBLabel = status.result?.candidates?.b?.name || "Candidate B";
    const replaceLabels = (text = "") =>
      stringOrJson(text)
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
      .map((title) => {
        const section = sectionMap.get(title);
        return section && Array.isArray(section.content)
          ? section
          : { title, content: [] };
      });

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
              text: replaceLabels(
                paragraph.replace(candidateMatch[1], label).replace(/^[-*]\s*/, "")
              ),
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

    return {
      sections,
      recommendation: normalizedRecommendation,
    };
  }, [status.result]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Compare Candidates</h1>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            {compareDescription}
          </p>
        </div>

        {isAgency && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Filter by company</p>
                <p className="text-xs text-gray-500">Choose which client’s jobs you want to compare.</p>
              </div>
              {companiesLoading ? (
                <p className="text-sm text-gray-500">Loading companies…</p>
              ) : companiesError ? (
                <p className="text-sm text-red-600">{companiesError}</p>
              ) : companies.length === 0 ? (
                <p className="text-sm text-gray-500">No companies available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => setSelectedCompanyId(String(company.id))}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                        String(company.id) === String(selectedCompanyId)
                          ? "bg-gray-900 text-white shadow-sm"
                          : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {company.name}
                      {company.is_default ? " (default)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {emptyState ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-600">
            {isAgency
              ? "No jobs available for the selected company. Create or select another profile to continue."
              : "You don’t have any jobs yet. Create a posting to start comparing candidates."}
          </div>
        ) : (
          <>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Job</label>
            <div className="relative">
              <select
                className={selectClass}
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
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
                ▾
              </span>
            </div>
          </div>

          {[{ label: "Candidate A", setter: setCandidateA, value: candidateA, other: candidateB },
            { label: "Candidate B", setter: setCandidateB, value: candidateB, other: candidateA }].map(
            ({ label, setter, value, other }, idx) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                <div className="relative">
                  <select
                    disabled={!selectedJob || loadingCandidates}
                    className={selectClass}
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
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
                    ▾
                  </span>
                </div>
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
            <p className="mt-3 text-sm text-red-600">{stringOrJson(status.error)}</p>
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
              {(parsedReport.sections || [])
                .filter((section) =>
                  (section?.content || []).some((block) =>
                    block?.type === "list"
                      ? (block.items || []).length > 0
                      : Boolean(block?.text && stringOrJson(block.text).trim())
                  )
                )
                .map((section) => (
                <section
                  key={section.title}
                  className={`rounded-2xl border px-4 py-4 space-y-3 ${
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
                  <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    {(section?.content || []).map((rawBlock, idx) => {
                      const block =
                        rawBlock && typeof rawBlock === "object"
                          ? rawBlock
                          : { type: "text", text: stringOrJson(rawBlock) };

                      if (block.type === "candidate") {
                        const primary = status.result?.candidates?.a?.name || "Candidate A";
                        const badgeColor =
                          block.label === primary
                            ? "bg-gray-900 text-white"
                            : "bg-gray-200 text-gray-900";
                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-white/60 bg-white px-4 py-3 shadow-sm"
                          >
                            <div
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}
                            >
                              {block.label}
                            </div>
                            <p
                              className="mt-2 text-gray-800"
                              dangerouslySetInnerHTML={{
                                __html: withBoldMarkers(block.text),
                              }}
                            />
                          </div>
                        );
                      }
                      if (block.type === "list") {
                        return (
                          <ul key={idx} className="ml-4 list-disc space-y-1">
                            {(block.items || []).map((item, i) => (
                              <li
                                key={i}
                                className="text-gray-700"
                                dangerouslySetInnerHTML={{ __html: withBoldMarkers(item) }}
                              />
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p
                          key={idx}
                          className="whitespace-pre-line"
                          dangerouslySetInnerHTML={{
                            __html: withBoldMarkers(block.text),
                          }}
                        />
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
