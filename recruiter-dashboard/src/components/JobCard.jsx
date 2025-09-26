import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function JobCard({ job }) {
  const navigate = useNavigate();

  const meta = [
    job.workType && `Work: ${job.workType}`,
    job.employmentType && `Type: ${job.employmentType}`,
    (job.location || job.location === "") && `Location: ${job.location || "Unspecified"}`,
    job.salary && `Salary: ${job.salary}`,
  ].filter(Boolean);

  const goApplicants = () => {
    // keep a "last viewed" id if other components try to prefetch meta
    try { localStorage.setItem("recrio:lastJobId", String(job.id)); } catch {}
    navigate(`/dashboard/job/${job.id}`);
  };

  const copy = async () => {
    if (!job.atsLink) return;
    try {
      await navigator.clipboard.writeText(job.atsLink);
      alert("Copied!");
    } catch {
      alert(job.atsLink);
    }
  };

  const onDelete = async () => {
    const ok = window.confirm(
      `Delete "${job.title}"?\n\nThis is PERMANENT. You will lose all candidate data in the dashboard (an archive is stored server-side).`
    );
    if (!ok) return;
    try {
      await api(`jobs/${job.id}`, { method: "DELETE" });
      window.location.reload();
    } catch (e) {
      alert(e.message || "Failed to delete job");
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900">{job.title}</h3>
        {job.description && (
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{job.description}</p>
        )}

        {job.qualifications && (
          <p className="mt-3 text-xs text-gray-500">
            <span className="font-medium">Qualifications:</span>{" "}
            <span className="line-clamp-2">{job.qualifications}</span>
          </p>
        )}

        {meta.length > 0 && (
          <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        )}

        {/* Applicants summary */}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={goApplicants}
            className="text-sm text-gray-700 hover:text-gray-900 underline"
            title="View applicants"
          >
            Applicants: {job.applicants ?? 0}
          </button>

          <div className="flex items-center gap-2">
            {job.atsLink ? (
              <>
                <a
                  href={job.atsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-md bg-black px-3 text-sm text-white hover:bg-gray-800"
                >
                  Open ATS link
                </a>
                <button
                  onClick={copy}
                  type="button"
                  className="inline-flex h-9 items-center rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Copy
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-400">No public link</span>
            )}

            {/* Delete job */}
            <button
              onClick={onDelete}
              type="button"
              className="inline-flex h-9 items-center rounded-md border border-red-300 px-3 text-sm text-red-700 hover:bg-red-50"
              title="Delete job (archives server-side)"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Secondary button for applicants */}
        <div className="mt-3">
          <button
            type="button"
            onClick={goApplicants}
            className="inline-flex h-9 items-center rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            View applicants
          </button>
        </div>
      </div>
    </div>
  );
}
