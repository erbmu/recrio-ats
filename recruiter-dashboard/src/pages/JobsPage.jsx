// client/src/pages/JobsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
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

const normalizeProfile = (p) =>
  !p
    ? null
    : {
        id: String(p.id),
        name: p.name || "Company",
        description: p.description || "",
        slug: p.slug || "",
        is_default: !!p.is_default,
        is_active: p.is_active !== false,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };

const JobsPage = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [me, setMe] = useState(null);
  const isAgency = useMemo(() => (me?.recruiter_type || me?.recruiterType) === "agency", [me]);

  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", description: "" });
  const [profileStatus, setProfileStatus] = useState("idle");
  const [profileValidation, setProfileValidation] = useState({});
  const activeProfile = useMemo(() => {
    if (!profiles || profiles.length === 0) return null;
    return (
      profiles.find((p) => Number(p.id) === Number(selectedProfileId)) ||
      profiles.find((p) => p.is_default) ||
      profiles[0]
    );
  }, [profiles, selectedProfileId]);
  const [profileDescDraft, setProfileDescDraft] = useState("");
  const noProfiles = useMemo(
    () => isAgency && !profilesLoading && profiles.length === 0,
    [isAgency, profilesLoading, profiles.length]
  );
  const disableNewJob = isAgency && (!activeProfile || noProfiles);
  const descriptionDirty = useMemo(() => {
    if (!activeProfile) return false;
    return (profileDescDraft || "") !== (activeProfile.description || "");
  }, [activeProfile?.description, profileDescDraft]);

  const [showForm, setShowForm] = useState(false);
  const [newJob, setNewJob] = useState({
    title: "",
    description: "",
    qualifications: "",
    workType: "",
    employmentType: "",
    location: "",
    salary: "",
    companyDescription: "",
  });
  const [errors, setErrors] = useState({});
  const [errMsg, setErrMsg] = useState("");
  const [debugInfo, setDebugInfo] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState("idle");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!successNotice) return undefined;
    const timer = window.setTimeout(() => setSuccessNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    setProfileDescDraft(activeProfile?.description || "");
  }, [activeProfile?.id, activeProfile?.description]);

  useEffect(() => {
    let cancelled = false;
    setProfilesLoading(true);
    setProfilesError("");

    (async () => {
      try {
        const user = await api("/api/me");
        if (!cancelled) setMe(user?.user || user);
      } catch (e) {
        if (!cancelled) setProfilesError(e.message || "Failed to load account");
      }

      try {
        const res = await api("/api/company-profiles");
        if (cancelled) return;
        const list = Array.isArray(res?.profiles) ? res.profiles.map(normalizeProfile).filter(Boolean) : [];
        setProfiles(list);
        const preferred = list.find((p) => p.is_default) || list[0] || null;
        setSelectedProfileId((prev) => prev || preferred?.id || null);
      } catch (e) {
        if (!cancelled) setProfilesError((prev) => prev || e.message || "Failed to load companies");
      } finally {
        if (!cancelled) setProfilesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profilesLoading) return;
    if (!profiles.length) return;
    if (!selectedProfileId || !profiles.some((p) => p.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profilesLoading, profiles, selectedProfileId]);

  useEffect(() => {
    let cancelled = false;
    if (profilesLoading) return () => {};
    if (isAgency && profiles.length === 0) {
      setJobs([]);
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    setErrMsg("");
    setDebugInfo(null);

    (async () => {
      try {
        const suffix = selectedProfileId ? `?companyProfileId=${encodeURIComponent(selectedProfileId)}` : "";
        const res = await api(`jobs${suffix}`); // helper will prefix /api
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
          companyProfileId: j.company_profile_id || null,
          companyName: j.company_name || "",
          companySlug: j.company_slug || "",
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
  }, [profilesLoading, selectedProfileId, isAgency, profiles.length]);

  const handleProfileInput = (e) => {
    const { name, value } = e.target;
    setProfileForm((p) => ({ ...p, [name]: value }));
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!profileForm.name.trim()) errs.name = "Company name is required.";
    setProfileValidation(errs);
    if (Object.keys(errs).length) return;

    setProfileStatus("saving");
    setProfilesError("");
    try {
      const payload = {
        name: profileForm.name.trim(),
        description: profileForm.description.trim(),
        makeDefault: profiles.length === 0,
      };
      const res = await api("/api/company-profiles", { method: "POST", body: payload });
      const created = res?.profile;
      if (created) {
        const shaped = normalizeProfile(created);
        setProfiles((prev) => (shaped ? [shaped, ...prev] : prev));
        if (shaped) setSelectedProfileId(shaped.id);
      }
      setProfileForm({ name: "", description: "" });
      setShowProfileForm(false);
      setProfileValidation({});
    } catch (err) {
      setProfilesError(err.message || "Failed to create company profile");
    } finally {
      setProfileStatus("idle");
    }
  };

  const handleSaveProfileDescription = async () => {
    if (!activeProfile) return;
    setProfileStatus("saving");
    try {
      const res = await api(`/api/company-profiles/${activeProfile.id}`, {
        method: "PATCH",
        body: { description: profileDescDraft },
      });
      const updated = normalizeProfile(res?.profile);
      if (updated) {
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
    } catch (e) {
      setProfilesError(e.message || "Failed to save profile");
    } finally {
      setProfileStatus("idle");
    }
  };

  const handleMakeDefault = async (id) => {
    if (!id) return;
    try {
      setProfileStatus("saving");
      const res = await api(`/api/company-profiles/${id}`, {
        method: "PATCH",
        body: { is_default: true },
      });
      const updated = normalizeProfile(res?.profile);
      if (updated) {
        setProfiles((prev) =>
          prev.map((p) => {
            if (p.id === updated.id) return updated;
            return { ...p, is_default: false };
          })
        );
        setSelectedProfileId(updated.id);
      }
    } catch (e) {
      setProfilesError(e.message || "Unable to set default company");
    } finally {
      setProfileStatus("idle");
    }
  };

  const handleSelectProfile = (value) => {
    setSelectedProfileId(value || null);
  };

  const setDeleteTargetSafe = (job) => {
    if (!job) return;
    setDeleteError("");
    setDeleteStatus("idle");
    setDeleteTarget(job);
  };

  const handleCopyLink = async (job) => {
    if (!job?.atsLink) return;
    try {
      await navigator.clipboard.writeText(job.atsLink);
      setSuccessNotice({
        type: "copied",
        title: job.title,
        link: job.atsLink,
      });
    } catch {
      setSuccessNotice({
        type: "copied",
        title: job.title,
        link: job.atsLink,
        copyFailed: true,
      });
    }
  };

  const closeDeleteModal = () => {
    if (deleteStatus === "loading") return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteStatus === "loading") return;
    const job = deleteTarget;
    setDeleteStatus("loading");
    setDeleteError("");
    try {
      await api(`jobs/${job.id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setDeleteTarget(null);
      setDeleteStatus("idle");
      setSuccessNotice({ type: "deleted", title: job.title });
    } catch (err) {
      setDeleteStatus("idle");
      setDeleteError(err.message || "Failed to delete job");
    }
  };

  const update = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (name === "salary") v = normalizeSalaryRange(v);
    else if (name === "companyDescription") v = clampLength(v, 20000);
    else v = clampLength(v, name === "title" ? 120 : 4000);
    setNewJob((p) => ({ ...p, [name]: v }));
  };

  const handleUseProfileDescription = () => {
    setNewJob((prev) => ({
      ...prev,
      companyDescription: clampLength(activeProfile?.description || "", 20000),
    }));
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
    if (!activeProfile) {
      setErrMsg("Create a company profile first.");
      return;
    }

    try {
      const payload = {
        title: newJob.title.trim(),
        description: newJob.description.trim(),
        qualifications: newJob.qualifications.trim(),
        workType: safeEnum(newJob.workType, WORK_TYPES),
        employmentType: newJob.employmentType.trim(),
        location: newJob.location.trim(),
        salary: newJob.salary.trim(),
        companyProfileId: activeProfile?.id || undefined,
        companyDescription: newJob.companyDescription.trim(),
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
        companyProfileId: j.company_profile_id || activeProfile?.id || null,
        companyName: j.company_name || activeProfile?.name || "",
        companySlug: j.company_slug || activeProfile?.slug || "",
      };

      setJobs((prev) => [created, ...prev]);
      setShowForm(false);
      setErrors({});
      setSuccessNotice({
        type: "created",
        title: created.title,
        link: created.atsLink || "",
      });
      setNewJob({
        title: "",
        description: "",
        qualifications: "",
        workType: "",
        employmentType: "",
        location: "",
        salary: "",
        companyDescription: "",
      });
    } catch (e2) {
      setErrMsg(e2.message || "Failed to create job");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">
          Your Job Postings
          {isAgency && activeProfile?.name ? (
            <span className="text-sm font-normal text-gray-500 ml-2">
              · {activeProfile.name}
            </span>
          ) : null}
        </h1>
        <div className="text-right">
          <button
            onClick={() => setShowForm((s) => !s)}
            className={`px-4 py-2 rounded-lg text-white transition ${
              disableNewJob ? "bg-gray-400 cursor-not-allowed" : "bg-black hover:bg-gray-800"
            }`}
            type="button"
            disabled={disableNewJob}
          >
            {showForm ? "Close" : "New Job Posting"}
          </button>
          {disableNewJob && (
            <p className="text-xs text-gray-500 mt-1">Add a company profile first.</p>
          )}
        </div>
      </div>

      {isAgency && (
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-lg font-semibold text-gray-900">Company profiles</p>
              <p className="text-sm text-gray-600">
                Switch between clients to see their jobs and customize each description.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setProfileForm({ name: "", description: "" });
                setProfileValidation({});
                setShowProfileForm(true);
              }}
              className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              + New company
            </button>
          </div>

          {profilesError && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {profilesError}
            </div>
          )}

          {profilesLoading ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-600 text-center">
              Loading companies…
            </div>
          ) : profiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
              <p className="mb-4">Create your first company profile to unlock job postings.</p>
              <button
                type="button"
                onClick={() => {
                  setProfileForm({ name: "", description: "" });
                  setProfileValidation({});
                  setShowProfileForm(true);
                }}
                className="px-4 py-2 rounded-md bg-black text-white text-sm hover:bg-gray-900"
              >
                Create company profile
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Active company
                  </label>
                  <div className="relative mt-1">
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white"
                      value={selectedProfileId || ""}
                      onChange={(e) => handleSelectProfile(e.target.value)}
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.is_default ? " (default)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <p className="text-gray-600">Default profile</p>
                  <p className="text-gray-900 font-medium">
                    {profiles.find((p) => p.is_default)?.name || "—"}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleMakeDefault(activeProfile?.id)}
                    disabled={!activeProfile || activeProfile.is_default || profileStatus === "saving"}
                    className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                  >
                    {activeProfile?.is_default ? "Already default" : "Make default"}
                  </button>
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {activeProfile?.name || "Company"} description
                </label>
                <textarea
                  value={profileDescDraft}
                  onChange={(e) => setProfileDescDraft(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="Describe benefits, mission, links, etc."
                />
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button
                    type="button"
                    onClick={handleSaveProfileDescription}
                    disabled={!descriptionDirty || profileStatus === "saving"}
                    className="inline-flex items-center px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
                  >
                    {profileStatus === "saving" ? "Saving…" : "Save description"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileDescDraft(activeProfile?.description || "")}
                    disabled={!descriptionDirty || profileStatus === "saving"}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Reset changes
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Quick switch</p>
                {profiles.length <= 1 ? (
                  <p className="text-xs text-gray-500">Add more profiles to switch between companies.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profiles.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => handleSelectProfile(p.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                          p.id === selectedProfileId
                            ? "bg-gray-900 text-white border-gray-900"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

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
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="companyDescription" className="block text-sm font-medium text-gray-700">
                Company Description (Optional override)
              </label>
              <button
                type="button"
                onClick={handleUseProfileDescription}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
                disabled={!activeProfile?.description}
              >
                Use {activeProfile?.name || "org"} description
              </button>
            </div>
            <textarea
              id="companyDescription"
              name="companyDescription"
              value={newJob.companyDescription}
              onChange={update}
              rows={4}
              maxLength={20000}
              className="mt-1 w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="Override the default company description for this posting…"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to inherit from the selected company profile or org settings.
            </p>
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

      {noProfiles ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600 bg-white">
          Add a company profile to start creating roles.
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setProfileForm({ name: "", description: "" });
                setProfileValidation({});
                setShowProfileForm(true);
              }}
              className="px-4 py-2 rounded-md bg-black text-white text-sm hover:bg-gray-900"
            >
              Create company profile
            </button>
          </div>
        </div>
      ) : loading ? (
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
            <JobCard key={job.id} job={job} onDelete={setDeleteTargetSafe} onCopy={handleCopyLink} />
          ))}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/30 backdrop-blur-[2px]"
          onClick={closeDeleteModal}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-red-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeDeleteModal}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
              disabled={deleteStatus === "loading"}
            >
              ×
            </button>
            <div className="px-6 pt-6 pb-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl">
                  !
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Delete this job posting?</p>
                  <p className="text-xs text-gray-500">
                    Remove{" "}
                    <span className="font-semibold text-gray-900">
                      {deleteTarget.title || "this job"}
                    </span>{" "}
                    from your listings. This action cannot be undone.
                  </p>
                </div>
              </div>
              {deleteError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {deleteError}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  className="flex-1 inline-flex justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleteStatus === "loading"}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteStatus === "loading"}
                  className="flex-1 inline-flex justify-center items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteStatus === "loading" ? "Deleting..." : "Delete job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProfileForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/40 backdrop-blur-sm"
          onClick={() => {
            if (profileStatus === "saving") return;
            setShowProfileForm(false);
          }}
        >
          <form
            onSubmit={handleCreateProfile}
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold text-gray-900">New company profile</p>
                <p className="text-sm text-gray-600">Set up a client and its description.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileForm(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={profileStatus === "saving"}
              >
                ×
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
              <input
                name="name"
                type="text"
                value={profileForm.name}
                onChange={handleProfileInput}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              />
              {profileValidation.name && (
                <p className="text-xs text-red-600 mt-1">{profileValidation.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                value={profileForm.description}
                onChange={handleProfileInput}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="Optional overview, mission, benefits…"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowProfileForm(false)}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                disabled={profileStatus === "saving"}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileStatus === "saving"}
                className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60"
              >
                {profileStatus === "saving" ? "Saving…" : "Create profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {successNotice && (
        (() => {
          const type = successNotice.type || "created";
          const themes = {
            created: {
              border: "border-green-200",
              iconBg: "bg-green-100 text-green-700",
              icon: "✓",
              headline: "Job created successfully",
              subtext: `${successNotice.title || "New posting"} is live and ready for candidates.`,
              showLinkBlock: true,
              showCopyButton: true,
            },
            deleted: {
              border: "border-red-200",
              iconBg: "bg-red-100 text-red-600",
              icon: "!",
              headline: "Job deleted",
              subtext: `${successNotice.title || "The job"} has been removed from your listings.`,
              showLinkBlock: false,
              showCopyButton: false,
            },
            copied: {
              border: "border-blue-200",
              iconBg: "bg-blue-100 text-blue-600",
              icon: "⇢",
              headline: successNotice.copyFailed ? "Link ready to share" : "Link copied",
              subtext: successNotice.copyFailed
                ? "Clipboard access was blocked. Use the link below to copy manually."
                : `${successNotice.title || "This job"} link is ready to share.`,
              showLinkBlock: true,
              showCopyButton: false,
            },
          };
          const theme = themes[type] || themes.created;
          return (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setSuccessNotice(null)}
        >
          <div
            className={`relative w-full max-w-md rounded-2xl border ${theme.border} bg-white shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSuccessNotice(null)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              ×
            </button>
            <div className="px-6 pt-6 pb-5 space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-xl ${theme.iconBg}`}
                >
                  {theme.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{theme.headline}</p>
                  <p className="text-xs text-gray-500">{theme.subtext}</p>
                </div>
              </div>
              {theme.showLinkBlock && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 break-words">
                  {successNotice.link || "Public link will appear once publishing completes."}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSuccessNotice(null)}
                  className="flex-1 inline-flex justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Close
                </button>
                {theme.showCopyButton && (
                  <button
                    type="button"
                    disabled={!successNotice.link}
                    onClick={async () => {
                      if (!successNotice.link) return;
                      try {
                        await navigator.clipboard.writeText(successNotice.link);
                        setSuccessNotice((prev) =>
                          prev ? { ...prev, copied: true } : prev
                        );
                      } catch {
                        /* noop */
                      }
                    }}
                    className="flex-1 inline-flex justify-center items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {successNotice.copied ? "Link copied" : "Copy link"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
          );
        })()
      )}
    </div>
  );
};

export default JobsPage;
