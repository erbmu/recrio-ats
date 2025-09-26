// src/pages/HomePage.jsx
import React, { useEffect, useState } from "react";
import { api } from "../api/client";

export default function HomePage() {
  const [me, setMe] = useState(null);
  const [jobCount, setJobCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api("/api/me")
      .then((resp) => {
        const u = resp?.user || resp; // handle both shapes
        if (!cancelled) setMe(u || null);
      })
      .catch(() => {});

    api("/api/jobs")
      .then((res) => {
        if (!cancelled) setJobCount(Array.isArray(res) ? res.length : (res.jobs?.length || 0));
      })
      .catch(() => { if (!cancelled) setJobCount(0); });

    return () => { cancelled = true; };
  }, []);

  const first = me?.name ? me.name.split(" ")[0] : "Recruiter";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          Welcome, {first} 👋
        </h1>
        <p className="text-gray-600 max-w-2xl">
          Recrio helps recruiters evaluate candidates through AI-driven resume
          analysis and realistic simulations. Here's an overview of your current
          activity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Total Job Postings</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{jobCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Total Applicants</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">385</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Avg AI Score</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">78.2%</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Simulations Completed</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">143</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-72">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Applications Over Time
          </p>
          <div className="h-full flex items-center justify-center text-gray-400 italic">
            (Chart Placeholder)
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-72">
          <p className="text-lg font-semibold text-gray-800 mb-4">
            Top Scoring Jobs
          </p>
          <div className="h-full flex items-center justify-center text-gray-400 italic">
            (Chart Placeholder)
          </div>
        </div>
      </div>
    </div>
  );
}
