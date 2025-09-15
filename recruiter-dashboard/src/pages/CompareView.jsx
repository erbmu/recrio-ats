import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";

const dummyJobs = [
  { id: "job-a", title: "Frontend Engineer" },
  { id: "job-b", title: "AI Researcher" },
  { id: "job-c", title: "Security Analyst" },
];

const dummyApplicants = {
  "job-a": [
    { id: "1", name: "Alice Anderson" },
    { id: "2", name: "Bob Brown" },
    { id: "3", name: "Charlie Clark" },
  ],
  "job-b": [
    { id: "4", name: "David Dorsey" },
    { id: "5", name: "Eva Edwards" },
  ],
  "job-c": [
    { id: "6", name: "Frank Finch" },
    { id: "7", name: "Grace Green" },
  ],
};

const CompareView = () => {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [applicants, setApplicants] = useState([]);
  const [candidate1, setCandidate1] = useState(null);
  const [candidate2, setCandidate2] = useState(null);
  const [comparison, setComparison] = useState(null);

  useEffect(() => {
    // Replace API call with dummy data
    setJobs(dummyJobs);
  }, []);

  const handleJobSelect = (jobId) => {
    setSelectedJob(jobId);
    setCandidate1(null);
    setCandidate2(null);
    setComparison(null);
    setApplicants(dummyApplicants[jobId] || []);
  };

  const handleCompare = () => {
    if (!candidate1 || !candidate2 || candidate1.id === candidate2.id) return;

    // Fake AI comparison result
    const stronger = Math.random() > 0.5 ? candidate1.name : candidate2.name;
    const report = `
Candidate 1: ${candidate1.name}
Candidate 2: ${candidate2.name}

📊 Summary:
- ${candidate1.name} shows stronger frontend fundamentals.
- ${candidate2.name} demonstrates better problem-solving under pressure.

🧠 Final Assessment:
Both candidates are strong, but ${stronger} appears slightly better suited for this role.
    `.trim();

    setComparison({ report });
  };

  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Compare Candidates</h1>

      {!selectedJob ? (
        <div className="bg-white p-6 rounded shadow w-fit">
          <label className="block text-sm font-medium mb-2">Select a Job</label>
          <select
            className="p-2 border rounded"
            onChange={(e) => handleJobSelect(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>Select job...</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {[1, 2].map((num) => (
            <div key={num}>
              <h2 className="text-lg font-medium mb-2">Select Candidate {num}</h2>
              <select
                className="w-full p-2 border rounded"
                onChange={(e) => {
                  const selected = applicants.find((a) => a.id === e.target.value);
                  num === 1 ? setCandidate1(selected) : setCandidate2(selected);
                }}
                defaultValue=""
              >
                <option value="" disabled>Select candidate...</option>
                {applicants.map((applicant) => (
                  <option key={applicant.id} value={applicant.id}>
                    {applicant.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {candidate1 && candidate2 && (
        <div className="mt-6">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            onClick={handleCompare}
          >
            Compare
          </button>
        </div>
      )}

      {comparison && (
        <div className="mt-10 bg-white shadow rounded p-6">
          <h2 className="text-xl font-semibold mb-4">AI Comparison Report</h2>
          <p className="text-gray-800 whitespace-pre-line">{comparison.report}</p>
        </div>
      )}
    </Layout>
  );
};

export default CompareView;
