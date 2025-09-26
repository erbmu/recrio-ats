// client/src/pages/JobsPage.jsx
import React, { useEffect, useState } from "react";
import JobCard from "../components/JobCard";
import { api, API_ORIGIN, tokenStore } from "../api/client";
import {
  clampLength,
  safeEnum,
  normalizeSalaryRange,
  nonEmpty,
  genId,
} from "../utils/validation";

const WORK_TYPES = ["Onsite", "Remote", "Hybrid", ""];
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Other"];

const JobsPage = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newJob, setNewJob] = useState({
    title: "",
    description: "",
    qualifications: "",
    workType: "",
    employmentType: "",
    location: "",
    salary: "",
  });
  const [errors, setErrors] = useState({});
  const [errMsg, setErrMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrMsg("");
    setDebugInfo(null);

    (async () => {
      try {
        // *** THE CALL ***
        const res = await api("jobs"); // let helper add /api
        if (cancelled) return;

        const list = (res.jobs || []).map((j) => ({
          id: j.id || genId(),
          title: j.title,
          description: j.description,
          qualifications: j.qualifications || "",
          workType: j.work_type || "",
          employmentType: j.employment_type || "",
          location: j.location || "",
          salary: j.salary || "",
          applicants: j.applicants ?? 0,
          createdAt: j.created_at || Date.now(),
          atsLink: j.apply_url || null,
        }));
        setJobs(list);

        try {
          const key = "recrio:lastJobId";
          const last = Number(localStorage.getItem(key));
          if (Number.isInteger(last) && last > 0) {
            const ids = new Set(list.map((x) => Number(x.id)));
            if (!ids.has(last)) localStorage.removeItem(key);
          }
        } catch {}
      } catch (e) {
        const token = tokenStore.get();
        const tokenHead = token ? token.slice(0, 16) + "…" : "none";
        const last = typeof window !== "undefined" ? window.__API_LAST__ : null;

        // also probe /health directly (absolute URL, bypassing helper)
        let health = null;
        try {
          const origin = API_ORIGIN;
          const r = await fetch(`${origin}/health`);
          health = { status: r.status, text: await r.text() };
        } catch (eh) {
          health = { error: String(eh) };
        }

        const dbg = {
          message: e.message,
          helperLast: last,
          tokenHead,
          apiOrigin: API_ORIGIN,
          health,
          serverTime: new Date().toISOString(),
          attached: e.__debug || null,
        };
        console.warn("[CLI][DEBUG] jobs load failed", dbg);

        if (!cancelled) {
          setErrMsg(e.message || "Failed to load jobs");
          setDebugInfo(dbg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (name === "salary") v = normalizeSalaryRange(v);
    else v = clampLength(v, name === "title" ? 120 : 4000);
    setNewJob((p) => ({ ...p, [name]: v }));
  };

  const validate = () => {
    const err = {};
    if (!nonEmpty(newJob.title)) err.title = "Title is required.";
    if (!nonEmpty(newJob.description)) err.description = "Description is required.";
    if (!nonEmpty(newJob.location)) err.location = "Location is required.";
    if (!nonEmpty(newJob.employmentType)) err.employmentType = "Employment type is required.";
    if (newJob.workType && !WORK_TYPES.includes(newJob.workType)) err.workType = "Invalid work type.";
    if (newJob.employmentType && !EMPLOYMENT_TYPES.includes(newJob.employmentType)) err.employmentType = "Invalid employment type.";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    if (!validate()) return;

    try {
      const payload = {
        title: newJob.title.trim(),
        description: newJob.description.trim(),
        qualifications: newJob.qualifications.trim(),
        workType: safeEnum(newJob.workType, WORK_TYPES),
        employmentType: newJob.employmentType.trim(),
        location: newJob.location.trim(),
        salary: newJob.salary.trim(),
      };
      const res = await api("jobs", { method: "POST", body: payload });
      const j = res.job;

      const created = {
        id: j.id || genId(),
        title: j.title,
        description: j.description,
        qualifications: j.qualifications || "",
        workType: j.work_type || "",
        employmentType: j.employment_type || "",
        location: j.location || "",
        salary: j.salary || "",
        applicants: j.applicants ?? 0,
        createdAt: j.created_at || Date.now(),
        atsLink: j.apply_url || "",
      };

      setJobs((prev) => [created, ...prev]);
      setShowForm(false);
      setErrors({});
      alert(`Job created!\nPublic apply link:\n${created.atsLink || "—"}`);
      setNewJob({
        title: "",
        description: "",
        qualifications: "",
        workType: "",
        employmentType: "",
        location: "",
        salary: "",
      });
    } catch (e2) {
      setErrMsg(e2.message || "Failed to create job");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Your Job Postings</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition"
          type="button"
        >
          {showForm ? "Close" : "New Job Posting"}
        </button>
      </div>

      {errMsg && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {/* DEBUG PANEL (only shows if load failed) */}
      {debugInfo && (
        <pre className="mb-6 whitespace-pre-wrap text-xs bg-yellow-50 border border-yellow-300 rounded-md p-3 text-yellow-900">
{JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}

      {showForm && (
        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-6 mb-8 shadow-sm space-y-4" noValidate>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Job Title <span className="text-red-600">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={newJob.title}
              onChange={update}
              required
              maxLength={120}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="e.g., Security Engineer (Red Team)"
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Job Description <span className="text-red-600">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={newJob.description}
              onChange={update}
              required
              rows={4}
              maxLength={4000}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="Role overview, responsibilities, and impact…"
            />
            {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description}</p>}
          </div>

          <div>
            <label htmlFor="qualifications" className="block text-sm font-medium text-gray-700">
              Qualifications (Optional)
            </label>
            <textarea
              id="qualifications"
              name="qualifications"
              value={newJob.qualifications}
              onChange={update}
              rows={3}
              maxLength={3000}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="Required/Preferred skills, experience, and certifications…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="workType" className="block text-sm font-medium text-gray-700">
                Work Type (Optional)
              </label>
              <select
                id="workType"
                name="workType"
                value={newJob.workType}
                onChange={update}
                className="mt-1 w-full border border-gray-300 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              >
                <option value="">Select…</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              {errors.workType && <p className="text-xs text-red-600 mt-1">{errors.workType}</p>}
            </div>

            <div>
              <label htmlFor="employmentType" className="block text-sm font-medium text-gray-700">
                Employment Type <span className="text-red-600">*</span>
              </label>
              <select
                id="employmentType"
                name="employmentType"
                value={newJob.employmentType}
                onChange={update}
                required
                className="mt-1 w-full border border-gray-300 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              >
                <option value="">Select…</option>
                {EMPLOYMENT_TYPES.map((et) => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
              {errors.employmentType && <p className="text-xs text-red-600 mt-1">{errors.employmentType}</p>}
            </div>

            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                Location <span className="text-red-600">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                value={newJob.location}
                onChange={update}
                required
                className="mt-1 w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="City, State or Remote"
              />
              {errors.location && <p className="text-xs text-red-600 mt-1">{errors.location}</p>}
            </div>

            <div>
              <label htmlFor="salary" className="block text sm font-medium text-gray-700">
                Salary Range (Optional)
              </label>
              <input
                id="salary"
                name="salary"
                type="text"
                value={newJob.salary}
                onChange={update}
                inputMode="numeric"
                placeholder="$120,000 – $160,000"
                className="mt-1 w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setErrors({}); }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              Save Job
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          Loading jobs…
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          No jobs yet. Create your first posting to get started.
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
};

export default JobsPage;
