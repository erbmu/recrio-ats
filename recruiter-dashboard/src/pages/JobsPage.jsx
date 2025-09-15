import React from "react";
import Layout from "../components/Layout";
import JobCard from "../components/JobCard";

const dummyJobs = [
  { id: "job-a", title: "iOS Engineer", applicants: 87 },
  { id: "job-b", title: "AI Researcher", applicants: 102 },
  { id: "job-c", title: "Security Analyst", applicants: 59 },
];

const JobsPage = () => {
  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Your Job Postings 📋</h1>
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {dummyJobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </Layout>
  );
};

export default JobsPage;
