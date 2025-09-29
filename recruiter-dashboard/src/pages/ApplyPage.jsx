// src/pages/ApplyPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";
const SIMULATION_URL =
  "https://docs.google.com/forms/d/1OQ0z4srhgMpD3QH2Xe8p8d3lMcLT7Bd77lFzJZxyVnM/edit?ts=68d9f60c&pli=1";

const ALLOWED = new Set([
  "application/pdf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 8 * 1024 * 1024;

export default function ApplyPage() {
  // Supports BOTH routes:
  //  - /apply/t/:token
  //  - /apply/:companySlug/:jobSlug
  const { token, companySlug, jobSlug } = useParams();

  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);

  // banner error (top)
  const [banner, setBanner] = useState("");

  // field errors
  const [errors, setErrors] = useState({});

  const honeypotRef = useRef(null);
  const consentRef = useRef(null);

  // file inputs
  const ccInputRef = useRef(null);
  const cvInputRef = useRef(null);

  const [ccPreview, setCcPreview] = useState("");
  const [cvPreview, setCvPreview] = useState("");

  // 16+ safeguard
  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  // Load job
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBanner("");
        let url;
        if (token) {
          url = `${API}/api/jobs/public/by-token/${encodeURIComponent(token)}`;
        } else {
          url = `${API}/api/jobs/public/${encodeURIComponent(companySlug)}/${encodeURIComponent(jobSlug)}`;
        }
        const r = await fetch(url);
        if (!r.ok) {
          let message = `Job not found (${r.status})`;
          try {
            const j = await r.json();
            if (j?.error === "not_found_org") message = "Company not found or inactive";
            if (j?.error === "not_found") message = "Job not found";
          } catch {}
          throw new Error(message);
        }
        const data = await r.json();
        if (alive) setJob(data.job); // <-- unwrap { job }
      } catch (e) {
        if (alive) setBanner(e?.message || "Unable to load job");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, companySlug, jobSlug]);

  // UI helpers
  const baseInputClass =
    "mt-1 block w-full rounded-xl border bg-white placeholder:text-zinc-400 " +
    "h-11 px-3 text-[15px] leading-tight focus:outline-none focus:ring-4 focus:ring-zinc-900/5";
  const baseTextareaClass =
    "mt-1 block w-full rounded-xl border bg-white placeholder:text-zinc-400 " +
    "px-3 py-2 text-[15px] leading-relaxed focus:outline-none focus:ring-4 focus:ring-zinc-900/5";
  const baseSelectClass =
    "mt-1 block w-full rounded-xl border bg-white h-11 px-3 text-[15px] " +
    "focus:outline-none focus:ring-4 focus:ring-zinc-900/5";

  const inputClass = (name) =>
    `${baseInputClass} ${errors[name] ? "border-red-400 focus:ring-red-100" : "border-zinc-300 focus:border-zinc-400"}`;
  const textareaClass = (name) =>
    `${baseTextareaClass} ${errors[name] ? "border-red-400 focus:ring-red-100" : "border-zinc-300 focus:border-zinc-400"}`;
  const selectClass = (name) =>
    `${baseSelectClass} ${errors[name] ? "border-red-400 focus:ring-red-100" : "border-zinc-300 focus:border-zinc-400"}`;

  const pill = (text) => (
    <span className="inline-flex items-center rounded-full bg-zinc-100 text-zinc-700 px-3 py-1 text-xs font-medium">
      {text}
    </span>
  );

  const fmtBytes = (n) =>
    n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(2)} MB`;

  const validateFile = (f) => {
    if (!f) return "";
    if (!ALLOWED.has(f.type)) return "Unsupported file type";
    if (f.size > MAX_BYTES) return "File too large (max 8MB)";
    return "";
  };

  const handleBrowseClick = (ref) => ref.current?.click();

  const handleFileChange = (input, setter) => {
    const f = input?.files?.[0];
    if (!f) {
      setter("");
      return;
    }
    const msg = validateFile(f);
    if (msg) {
      setter("");
      setBanner(msg);
      input.value = "";
      return;
    }
    setBanner("");
    setter(`${f.name} • ${fmtBytes(f.size)}`);
  };

  const handleDrop = (e, inputRef, setter) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    if (inputRef.current) {
      inputRef.current.files = dt.files;
      handleFileChange(inputRef.current, setter);
    }
  };
  const preventDefault = (e) => e.preventDefault();

  const renderQualifications = (text) => {
    if (!text) return null;
    const items = text
      .split(/\r?\n|•/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return null;
    return (
      <ul className="mt-3 space-y-2">
        {items.map((line, i) => (
          <li key={i} className="flex gap-2 text-[15px] text-zinc-700">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="mt-1.5 shrink-0">
              <circle cx="10" cy="10" r="3" fill="currentColor" className="text-zinc-400" />
            </svg>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    );
  };

  const clearFieldError = (name) =>
    setErrors((e) => (e[name] ? { ...e, [name]: "" } : e));

  const onSubmit = async (e) => {
    e.preventDefault();
    setBanner("");
    setErrors({});

    // Honeypot
    if (honeypotRef.current?.value) {
      setBanner("Submission rejected.");
      return;
    }
    if (!job) {
      setBanner("Job not loaded.");
      return;
    }

    const fd = new FormData(e.currentTarget);

    // Required client-side
    const name = String(fd.get("candidate_name") || "").trim();
    const email = String(fd.get("candidate_email") || "").trim();
    const workAuth = String(fd.get("work_auth") || "").trim();
    const consent = !!consentRef.current?.checked;

    const fieldErrs = {};
    if (!name) fieldErrs.candidate_name = "Full name is required.";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrs.candidate_email = "A valid email is required.";
    if (!workAuth) fieldErrs.work_auth = "Work authorization is required.";
    if (!consent) fieldErrs.consent = "You must accept the privacy notice to continue.";

    // Files
    const ccFile = fd.get("careerCard");
    const cvFile = fd.get("resume");
    const ccErr = ccFile && ccFile.name ? validateFile(ccFile) : "";
    const cvErr = cvFile && cvFile.name ? validateFile(cvFile) : "";
    if (ccErr) fieldErrs.careerCard = ccErr;
    if (cvErr) fieldErrs.resume = cvErr;

    if (Object.keys(fieldErrs).length) {
      setErrors(fieldErrs);
      setBanner("Please fix the highlighted fields below.");
      // focus the first error field
      const firstKey = Object.keys(fieldErrs)[0];
      const el = document.querySelector(`[name="${firstKey}"]`);
      el?.focus?.();
      return;
    }

    try {
      setSubmitting(true);
      const r = await fetch(`${API}/api/applications/public/${encodeURIComponent(job.id)}`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        // Try to decode a per-field error response {error, field?}
        let msg = `Submission failed (${r.status})`;
        try {
          const j = await r.json();
          if (j?.field && j?.error) {
            setErrors({ [j.field]: j.error });
            setBanner("Please fix the highlighted fields below.");
          } else if (j?.error) {
            msg = j.error;
            setBanner(msg);
          } else {
            setBanner(msg);
          }
        } catch {
          setBanner(msg);
        }
        return;
      }
      setOk(true);
      e.currentTarget.reset();
      setCcPreview("");
      setCvPreview("");
      setBanner("");
    } catch (e2) {
      setBanner(e2?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const startSimulation = () => {
    window.open(SIMULATION_URL, "_blank", "noopener");
  };

  // Error & loading states
  if (banner && !job) {
    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="max-w-lg w-full bg-white border border-red-200 text-red-700 rounded-2xl p-6">
          <div className="font-semibold">Error</div>
          <p className="mt-2 text-sm">{banner}</p>
        </div>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-zinc-500">
        Loading…
      </div>
    );
  }

  // Build “submit another” link to the **same shape** the user visited
  const backPath = token
    ? `/apply/t/${encodeURIComponent(token)}`
    : `/apply/${encodeURIComponent(companySlug)}/${encodeURIComponent(jobSlug)}`;

  if (ok) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white border border-zinc-200 rounded-2xl p-10 shadow-sm">
          <h1 className="text-2xl font-semibold">Application received</h1>
          <p className="text-zinc-600 mt-2">
            Thanks for applying to {job.title}. We’ll be in touch soon.
          </p>
          <a
            href={backPath}
            className="inline-flex mt-6 rounded-xl bg-black text-white h-11 px-6"
          >
            Submit another
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* ======= Header ======= */}
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {job.location && pill(job.location)}
              {job.employment_type && pill(job.employment_type)}
              {job.work_type && pill(job.work_type)}
              {job.salary && pill(job.salary)}
            </div>
          </div>
          <a
            href="/"
            className="hidden sm:inline-flex items-center h-10 px-4 rounded-xl border border-zinc-300 text-sm hover:bg-zinc-50"
          >
            Back to site
          </a>
        </div>

        {(job.description || job.qualifications) && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">About the role</h2>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                {job.description || "—"}
              </p>

              {job.qualifications && (
                <>
                  <div className="mt-6 h-px w-full bg-zinc-100" />
                  <h3 className="mt-6 text-sm font-semibold text-zinc-900">Qualifications</h3>
                  {renderQualifications(job.qualifications)}
                </>
              )}
            </section>

            <aside className="lg:col-span-1 bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">Position details</h3>
              <dl className="mt-3 space-y-3 text-[15px] text-zinc-700">
                {job.location && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-zinc-500">Location</dt>
                    <dd className="text-right">{job.location}</dd>
                  </div>
                )}
                {job.employment_type && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-zinc-500">Employment</dt>
                    <dd className="text-right">{job.employment_type}</dd>
                  </div>
                )}
                {job.work_type && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-zinc-500">Work type</dt>
                    <dd className="text-right">{job.work_type}</dd>
                  </div>
                )}
                {job.salary && (
                  <div className="flex justify-between gap-6">
                    <dt className="text-zinc-500">Compensation</dt>
                    <dd className="text-right">{job.salary}</dd>
                  </div>
                )}
              </dl>
            </aside>
          </div>
        )}
      </header>

      {/* ======= Form ======= */}
      <form
        onSubmit={onSubmit}
        className="bg-white border border-zinc-200 rounded-2xl shadow-sm"
        noValidate
        onChange={(e) => clearFieldError(e.target.name)}
      >
        <input ref={honeypotRef} name="website" tabIndex={-1} autoComplete="off" className="hidden" />

        {/* Section: Contact */}
        <section className="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-zinc-900">Contact</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-600">
                Full name <span className="text-red-500">*</span>
              </label>
              <input name="candidate_name" required autoComplete="name" className={inputClass("candidate_name")} />
              {errors.candidate_name && <p className="text-xs text-red-600 mt-1">{errors.candidate_name}</p>}
            </div>
            <div>
              <label className="block text-sm text-zinc-600">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" name="candidate_email" required autoComplete="email" className={inputClass("candidate_email")} />
              {errors.candidate_email && <p className="text-xs text-red-600 mt-1">{errors.candidate_email}</p>}
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Phone (optional)</label>
              <input
                name="phone"
                inputMode="tel"
                placeholder="+1 555 123 4567"
                pattern="^[0-9+()\\-\\s]{7,24}$"
                className={inputClass("phone")}
              />
              {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-600">City (optional)</label>
                <input name="city" autoComplete="address-level2" className={inputClass("city")} />
              </div>
              <div>
                <label className="block text-sm text-zinc-600">Country (optional)</label>
                <input name="country" autoComplete="country-name" className={inputClass("country")} />
              </div>
            </div>
          </div>
        </section>

        <div className="h-px bg-zinc-100" />

        {/* Section: Professional */}
        <section className="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-zinc-900">Professional</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-600">LinkedIn (optional)</label>
              <input name="linkedin_url" inputMode="url" placeholder="https://linkedin.com/in/…" className={inputClass("linkedin_url")} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Portfolio (optional)</label>
              <input name="portfolio_url" inputMode="url" placeholder="https://…" className={inputClass("portfolio_url")} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Years of experience (optional)</label>
              <input name="years_experience" type="number" min="0" max="60" step="0.5" placeholder="e.g., 3" className={inputClass("years_experience")} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Current title (optional)</label>
              <input name="current_title" placeholder="e.g., Frontend Engineer" className={inputClass("current_title")} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Expected salary (optional)</label>
              <input name="salary_expectation" type="text" placeholder="$X or range" className={inputClass("salary_expectation")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-600">
                  Work authorization <span className="text-red-500">*</span>
                </label>
                <select name="work_auth" defaultValue="" className={selectClass("work_auth")}>
                  <option value="">Select…</option>
                  <option>Authorized (no sponsorship)</option>
                  <option>Requires sponsorship</option>
                </select>
                {errors.work_auth && <p className="text-xs text-red-600 mt-1">{errors.work_auth}</p>}
              </div>
              <div>
                <label className="block text-sm text-zinc-600">Work preference (optional)</label>
                <select name="work_pref" defaultValue="" className={selectClass("work_pref")}>
                  <option value="">Select…</option>
                  <option>Remote</option>
                  <option>Hybrid</option>
                  <option>Onsite</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <div className="h-px bg-zinc-100" />

        {/* Section: Personal */}
        <section className="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-zinc-900">Personal</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-600">Date of birth (optional)</label>
              <input type="date" name="dob" max={maxDob} className={inputClass("dob")} />
              <p className="text-xs text-zinc-500 mt-2">
                Used only for identity verification/background checks after an offer, where legally permitted.
              </p>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="relocate" className="rounded" /> Open to relocation
              </label>
            </div>
          </div>
        </section>

        <div className="h-px bg-zinc-100" />

        {/* Section: Documents */}
        <section className="p-6 md:p-8">
          <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>

          <div className="mt-4 grid grid-cols-1 gap-4">
            {/* Career Card */}
            <div
              className="rounded-2xl border border-dashed border-zinc-300 p-5 hover:border-zinc-400 transition"
              onDragOver={preventDefault}
              onDragEnter={preventDefault}
              onDrop={(e) => handleDrop(e, ccInputRef, setCcPreview)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 hidden sm:block">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="text-zinc-400" aria-hidden="true">
                      <path fill="currentColor" d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM13 3v5h5" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Career Card (optional)</div>
                    <div className="text-xs text-zinc-500">
                      PDF or JSON. Max 8MB. Drag & drop or use the button.
                    </div>
                    {ccPreview && <div className="text-xs text-zinc-600 mt-1">{ccPreview}</div>}
                  </div>
                </div>
                <div className="sm:shrink-0">
                  <input
                    ref={ccInputRef}
                    type="file"
                    name="careerCard"
                    onChange={(e) => handleFileChange(e.currentTarget, setCcPreview)}
                    accept=".pdf,.json,application/pdf,application/json"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleBrowseClick(ccInputRef)}
                    className="inline-flex h-10 items-center rounded-xl border border-zinc-300 px-4 text-sm hover:bg-zinc-50"
                  >
                    Upload
                  </button>
                </div>
              </div>
              {errors.careerCard && <p className="text-xs text-red-600 mt-1">{errors.careerCard}</p>}
            </div>

            {/* Resume */}
            <div
              className="rounded-2xl border border-dashed border-zinc-300 p-5 hover:border-zinc-400 transition"
              onDragOver={preventDefault}
              onDragEnter={preventDefault}
              onDrop={(e) => handleDrop(e, cvInputRef, setCvPreview)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 hidden sm:block">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="text-zinc-400" aria-hidden="true">
                      <path fill="currentColor" d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM13 3v5h5" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Resume (optional)</div>
                    <div className="text-xs text-zinc-500">
                      PDF, DOC, or DOCX. Max 8MB. Drag & drop or use the button.
                    </div>
                    {cvPreview && <div className="text-xs text-zinc-600 mt-1">{cvPreview}</div>}
                  </div>
                </div>
                <div className="sm:shrink-0">
                  <input
                    ref={cvInputRef}
                    type="file"
                    name="resume"
                    onChange={(e) => handleFileChange(e.currentTarget, setCvPreview)}
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleBrowseClick(cvInputRef)}
                    className="inline-flex h-10 items-center rounded-xl border border-zinc-300 px-4 text-sm hover:bg-zinc-50"
                  >
                    Upload
                  </button>
                </div>
              </div>
              {errors.resume && <p className="text-xs text-red-600 mt-1">{errors.resume}</p>}
            </div>
          </div>
        </section>

        <div className="h-px bg-zinc-100" />

        {/* Section: Consent & Submit */}
        <section className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <input id="consent" name="consent" type="checkbox" className="mt-1 h-4 w-4" required ref={consentRef} />
            <label htmlFor="consent" className="text-sm text-zinc-700">
              I agree to Recrio processing my application data for hiring purposes. See our{" "}
              <a href="/privacy" className="underline">Privacy Notice</a>.
            </label>
          </div>
          {errors.consent && <p className="text-xs text-red-600 mt-2">{errors.consent}</p>}

          {banner && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{banner}</div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={startSimulation}
              className="inline-flex h-10 items-center rounded-xl border border-zinc-300 px-4 text-sm hover:bg-zinc-50"
            >
              Optional simulation
            </button>
            <p className="mt-2 text-xs text-zinc-500">
              This opens in a new tab. When you’re done, return here and click “Submit application.”
            </p>
          </div>

          <div className="mt-5">
            <button
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl bg-black text-white h-11 px-6 shadow-sm disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </section>
      </form>

      <p className="mt-6 text-xs text-zinc-500">
        Tip: Do not upload passwords, government IDs, or other highly sensitive personal data. Only share
        what’s relevant to your application.
      </p>
    </div>
  );
}
