// src/pages/ApplyPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";

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
  const [companyOrg, setCompanyOrg] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);

  const [banner, setBanner] = useState("");
  const [errors, setErrors] = useState({});

  const honeypotRef = useRef(null);
  const consentRef = useRef(null);
  const ccInputRef = useRef(null);
  const cvInputRef = useRef(null);

  const [ccPreview, setCcPreview] = useState("");
  const [cvPreview, setCvPreview] = useState("");

  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const companyDescription = useMemo(() => {
    const desc = companyOrg?.company_description?.trim();
    if (!desc) return "";
    if (/^test$/i.test(desc)) return "";
    return desc;
  }, [companyOrg]);

  const companyName = useMemo(() => {
    if (!job && !companyOrg) return "";
    return (
      job?.company_name ||
      companyOrg?.name ||
      companyOrg?.company_name ||
      job?.company ||
      (companySlug ? companySlug.replace(/[-_]/g, " ") : "") ||
      ""
    );
  }, [job, companyOrg, companySlug]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setBanner("");

        const url = token
          ? `${API}/api/jobs/public/by-token/${encodeURIComponent(token)}`
          : `${API}/api/jobs/public/${encodeURIComponent(companySlug)}/${encodeURIComponent(jobSlug)}`;

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
        if (!alive) return;
        setJob(data.job);

        try {
          if (data?.job?.org_id) {
            const rr = await fetch(`${API}/api/orgs/public/${encodeURIComponent(data.job.org_id)}`);
            if (rr.ok) {
              const jj = await rr.json();
              setCompanyOrg(jj?.org || null);
              return;
            }
          }
          if (companySlug) {
            const rr2 = await fetch(`${API}/api/orgs/public/by-slug/${encodeURIComponent(companySlug)}`);
            if (rr2.ok) {
              const jj2 = await rr2.json();
              setCompanyOrg(jj2?.org || null);
              return;
            }
          }
          setCompanyOrg(null);
        } catch {
          setCompanyOrg(null);
        }
      } catch (e) {
        if (alive) setBanner(e?.message || "Unable to load job");
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, companySlug, jobSlug]);

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

    if (honeypotRef.current?.value) {
      setBanner("Submission rejected.");
      return;
    }
    if (!job) {
      setBanner("Job not loaded.");
      return;
    }

    const fd = new FormData(e.currentTarget);

    const name = String(fd.get("candidate_name") || "").trim();
    const email = String(fd.get("candidate_email") || "").trim();
    const workAuth = String(fd.get("work_auth") || "").trim();
    const consent = !!consentRef.current?.checked;

    const fieldErrs = {};
    if (!name) fieldErrs.candidate_name = "Full name is required.";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrs.candidate_email = "A valid email is required.";
    if (!workAuth) fieldErrs.work_auth = "Work authorization is required.";
    if (!consent) fieldErrs.consent = "You must accept the privacy notice to continue.";

    const ccFile = fd.get("careerCard");
    const cvFile = fd.get("resume");
    const ccErr = ccFile && ccFile.name ? validateFile(ccFile) : "";
    const cvErr = cvFile && cvFile.name ? validateFile(cvFile) : "";
    if (ccErr) fieldErrs.careerCard = ccErr;
    if (cvErr) fieldErrs.resume = cvErr;

    if (Object.keys(fieldErrs).length) {
      setErrors(fieldErrs);
      setBanner("Please fix the highlighted fields below.");
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

  if (banner && !job) {
    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-red-700 shadow-sm">
          <div className="text-lg font-semibold">Unable to load job</div>
          <p className="mt-2 text-sm leading-relaxed">{banner}</p>
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

  const backPath = token
    ? `/apply/t/${encodeURIComponent(token)}`
    : `/apply/${encodeURIComponent(companySlug)}/${encodeURIComponent(jobSlug)}`;

  if (ok) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100">
        <div
          className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-gradient-to-b from-zinc-300/50 via-transparent to-transparent blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-6 py-16 sm:px-8">
          <div className="rounded-3xl border border-emerald-100 bg-white/90 p-10 shadow-xl backdrop-blur">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-2xl">
                ✓
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-zinc-900">Application received</h1>
                <p className="mt-2 text-sm text-zinc-500">
                  Thank you for applying for{" "}
                  <span className="font-medium text-zinc-900">{job.title}</span>
                  {companyName ? ` at ${companyName}` : ""}. We’ll be in touch soon.
                </p>
              </div>
            </div>
            <a
              href={backPath}
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
            >
              Submit another application
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zinc-50 via-white to-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 -top-72 h-[28rem] bg-gradient-to-b from-zinc-300/60 via-transparent to-transparent blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.42em] text-zinc-400">
                Recrio Careers
              </span>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                {job.title}
              </h1>
              {companyName && (
                <p className="text-base text-zinc-500">
                  at {companyName}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {job.location && pill(job.location)}
              {job.employment_type && pill(job.employment_type)}
              {job.work_type && pill(job.work_type)}
              {job.salary && pill(job.salary)}
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-white/80 px-6 py-5 text-sm text-zinc-500 shadow-sm backdrop-blur">
            <p className="font-medium text-zinc-700">A thoughtful hiring experience</p>
            <p className="mt-1 leading-relaxed">
              Share your details and work samples — we review every application carefully.
            </p>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <form
            onSubmit={onSubmit}
            className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white/95 shadow-xl backdrop-blur"
            noValidate
            onChange={(e) => clearFieldError(e.target.name)}
          >
            <input ref={honeypotRef} name="website" tabIndex={-1} autoComplete="off" className="hidden" />
            <div className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-transparent px-6 py-6 md:px-8">
              <h2 className="text-lg font-semibold text-zinc-900">Submit your application</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Provide your contact details, experience, and supporting documents.
              </p>
            </div>

            <div className="space-y-0">
              <section className="p-6 md:p-8">
                {banner && (
                  <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {banner}
                  </div>
                )}
                <h3 className="text-sm font-semibold text-zinc-900">Contact</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-zinc-600">
                      Full name <span className="text-red-500">*</span>
                    </label>
                    <input name="candidate_name" required autoComplete="name" className={inputClass("candidate_name")} />
                    {errors.candidate_name && <p className="mt-1 text-xs text-red-600">{errors.candidate_name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-600">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input type="email" name="candidate_email" required autoComplete="email" className={inputClass("candidate_email")} />
                    {errors.candidate_email && <p className="mt-1 text-xs text-red-600">{errors.candidate_email}</p>}
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
                    {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
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

              <section className="p-6 md:p-8">
                <h3 className="text-sm font-semibold text-zinc-900">Professional</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      {errors.work_auth && <p className="mt-1 text-xs text-red-600">{errors.work_auth}</p>}
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

              <section className="p-6 md:p-8">
                <h3 className="text-sm font-semibold text-zinc-900">Personal</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-zinc-600">Date of birth (optional)</label>
                    <input type="date" name="dob" max={maxDob} className={inputClass("dob")} />
                    <p className="mt-2 text-xs text-zinc-500">
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

              <section className="p-6 md:p-8">
                <h3 className="text-sm font-semibold text-zinc-900">Documents</h3>

                <div className="mt-4 space-y-4">
                  <div
                    className="rounded-2xl border border-dashed border-zinc-300/80 bg-zinc-50/60 p-5 transition hover:border-zinc-400"
                    onDragOver={preventDefault}
                    onDragEnter={preventDefault}
                    onDrop={(e) => handleDrop(e, ccInputRef, setCcPreview)}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 hidden sm:block">
                          <svg width="24" height="24" viewBox="0 0 24 24" className="text-zinc-400" aria-hidden="true">
                            <path fill="currentColor" d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM13 3v5h5" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-900">Career Card (optional)</div>
                          <div className="text-xs text-zinc-500">
                            PDF or JSON. Max 8MB. Drag & drop or use the button.
                          </div>
                          {ccPreview && <div className="mt-1 text-xs text-zinc-600">{ccPreview}</div>}
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
                          className="inline-flex h-10 items-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                        >
                          Upload
                        </button>
                      </div>
                    </div>
                    {errors.careerCard && <p className="mt-2 text-xs text-red-600">{errors.careerCard}</p>}
                  </div>

                  <div
                    className="rounded-2xl border border-dashed border-zinc-300/80 bg-zinc-50/60 p-5 transition hover:border-zinc-400"
                    onDragOver={preventDefault}
                    onDragEnter={preventDefault}
                    onDrop={(e) => handleDrop(e, cvInputRef, setCvPreview)}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 hidden sm:block">
                          <svg width="24" height="24" viewBox="0 0 24 24" className="text-zinc-400" aria-hidden="true">
                            <path fill="currentColor" d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM13 3v5h5" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-900">Resume (optional)</div>
                          <div className="text-xs text-zinc-500">
                            PDF, DOC, or DOCX. Max 8MB. Drag & drop or use the button.
                          </div>
                          {cvPreview && <div className="mt-1 text-xs text-zinc-600">{cvPreview}</div>}
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
                          className="inline-flex h-10 items-center rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                        >
                          Upload
                        </button>
                      </div>
                    </div>
                    {errors.resume && <p className="mt-2 text-xs text-red-600">{errors.resume}</p>}
                  </div>
                </div>
              </section>

              <div className="h-px bg-zinc-100" />

              <section className="p-6 md:p-8">
                <div className="flex items-start gap-3">
                  <input id="consent" name="consent" type="checkbox" className="mt-1 h-4 w-4" required ref={consentRef} />
                  <label htmlFor="consent" className="text-sm text-zinc-700">
                    I agree to Recrio processing my application data for hiring purposes. See our{" "}
                    <a href="/privacy" className="underline">Privacy Notice</a>.
                  </label>
                </div>
                {errors.consent && <p className="mt-2 text-xs text-red-600">{errors.consent}</p>}

                <div className="mt-6">
                  <button
                    disabled={submitting}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </section>
            </div>
          </form>

          <div className="space-y-8">
            <section className="rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-sm backdrop-blur">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">About this role</h2>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                {job.description || "—"}
              </p>

              {job.qualifications && (
                <>
                  <div className="mt-8 h-px w-full bg-zinc-100" />
                  <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Qualifications
                  </h3>
                  {renderQualifications(job.qualifications)}
                </>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-sm backdrop-blur">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Company snapshot</h3>
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-zinc-700">
                {companyName && (
                  <p className="text-base font-medium text-zinc-900">{companyName}</p>
                )}
                <p className="whitespace-pre-wrap">
                  {companyDescription || "We’re hiring talented people to join our team."}
                </p>

                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {job.location && (
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Location</dt>
                      <dd className="mt-1 text-zinc-700">{job.location}</dd>
                    </div>
                  )}
                  {job.employment_type && (
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide	text-zinc-500">Employment</dt>
                      <dd className="mt-1 text-zinc-700">{job.employment_type}</dd>
                    </div>
                  )}
                  {job.work_type && (
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Work type</dt>
                      <dd className="mt-1 text-zinc-700">{job.work_type}</dd>
                    </div>
                  )}
                  {job.salary && (
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Compensation</dt>
                      <dd className="mt-1 text-zinc-700">{job.salary}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs text-amber-700 shadow-sm">
          Tip: Do not upload passwords, government IDs, or other highly sensitive personal data. Only share what’s relevant
          to your application.
        </div>
      </div>
    </div>
  );
}
