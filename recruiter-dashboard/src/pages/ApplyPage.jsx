import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";

const API = "http://localhost:4000/api";

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
  const [err, setErr] = useState("");

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
        setErr("");
        let url;
        if (token) {
          url = `${API}/jobs/public/by-token/${encodeURIComponent(token)}`;
        } else {
          url = `${API}/jobs/public/${encodeURIComponent(companySlug)}/${encodeURIComponent(jobSlug)}`;
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
        if (alive) setErr(e?.message || "Unable to load job");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, companySlug, jobSlug]);

  // UI helpers
  const inputClass =
    "mt-1 block w-full rounded-xl border border-zinc-300 bg-white placeholder:text-zinc-400 " +
    "h-11 px-3 text-[15px] leading-tight focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-400";
  const textareaClass =
    "mt-1 block w-full rounded-xl border border-zinc-300 bg-white placeholder:text-zinc-400 " +
    "px-3 py-2 text-[15px] leading-relaxed focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-400";
  const selectClass =
    "mt-1 block w-full rounded-xl border border-zinc-300 bg-white h-11 px-3 text-[15px] " +
    "focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-400";

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
      setErr(msg);
      input.value = "";
      return;
    }
    setErr("");
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

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (honeypotRef.current?.value) return setErr("Submission rejected.");
    if (!job) return setErr("Job not loaded.");
    if (!consentRef.current?.checked) {
      return setErr("Please accept the privacy notice to continue.");
    }

    const fd = new FormData(e.currentTarget);
    const ccFile = fd.get("careerCard");
    const cvFile = fd.get("resume");

    const ccErr = ccFile && ccFile.name ? validateFile(ccFile) : "";
    if (ccErr) return setErr(ccErr);
    const cvErr = cvFile && cvFile.name ? validateFile(cvFile) : "";
    if (cvErr) return setErr(cvErr);

    try {
      setSubmitting(true);
      const r = await fetch(`${API}/applications/public/${encodeURIComponent(job.id)}`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        let message = `Submission failed (${r.status})`;
        try {
          const j = await r.json();
          if (j?.error) message = j.error;
        } catch {}
        throw new Error(message);
      }
      setOk(true);
      e.currentTarget.reset();
      setCcPreview("");
      setCvPreview("");
    } catch (e) {
      setErr(e?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Error & loading states
  if (err && !job) {
    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="max-w-lg w-full bg-white border border-red-200 text-red-700 rounded-2xl p-6">
          <div className="font-semibold">Error</div>
          <p className="mt-2 text-sm">{err}</p>
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
              <input name="candidate_name" required autoComplete="name" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" name="candidate_email" required autoComplete="email" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Phone (optional)</label>
              <input
                name="phone"
                inputMode="tel"
                placeholder="+1 555 123 4567"
                pattern="^[0-9+()\\-\\s]{7,24}$"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-600">City (optional)</label>
                <input name="city" autoComplete="address-level2" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-zinc-600">Country (optional)</label>
                <input name="country" autoComplete="country-name" className={inputClass} />
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
              <input name="linkedin_url" inputMode="url" placeholder="https://linkedin.com/in/…" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Portfolio (optional)</label>
              <input name="portfolio_url" inputMode="url" placeholder="https://…" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Years of experience (optional)</label>
              <input name="years_experience" type="number" min="0" max="60" step="0.5" placeholder="e.g., 3" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Current title (optional)</label>
              <input name="current_title" placeholder="e.g., Frontend Engineer" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-zinc-600">Expected salary (optional)</label>
              <input name="salary_expectation" type="text" placeholder="$X or range" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-600">Work authorization (optional)</label>
                <select name="work_auth" defaultValue="" className={selectClass}>
                  <option value="">Select…</option>
                  <option>Authorized (no sponsorship)</option>
                  <option>Requires sponsorship</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-600">Work preference (optional)</label>
                <select name="work_pref" defaultValue="" className={selectClass}>
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
              <input type="date" name="dob" max={maxDob} className={inputClass} />
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
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => e.preventDefault()}
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
            </div>

            {/* Resume */}
            <div
              className="rounded-2xl border border-dashed border-zinc-300 p-5 hover:border-zinc-400 transition"
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => e.preventDefault()}
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
            </div>
          </div>
        </section>

        <div className="h-px bg-zinc-100" />

        {/* Section: Optional Simulation */}
        <section className="p-6 md:p-8">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm text-zinc-700">
              <span className="font-medium">Optional simulation interview:</span> Experience a short, AI-guided
              simulation reflecting real scenarios from this role. This is voluntary and won’t negatively
              impact your application.
            </p>
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-xl border border-zinc-300 px-4 text-sm hover:bg-zinc-100"
                onClick={() => alert("Simulation placeholder — will be integrated later.")}
              >
                Try the optional simulation
              </button>
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

          {err && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{err}</div>
          )}

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
