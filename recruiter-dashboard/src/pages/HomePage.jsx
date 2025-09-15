// src/pages/HomePage.jsx
import React from "react";
import Layout from "../components/Layout";

const HomePage = () => {
  return (
    <Layout>
      <div className="space-y-10">
        {/* Header + Intro */}
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Welcome to Recrio 👋</h1>
          <p className="text-gray-600 max-w-2xl">
            Recrio helps recruiters evaluate candidates through AI-driven resume analysis and realistic simulations. Here's an overview of your current activity.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <p className="text-sm text-gray-500">Total Job Postings</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">12</p>
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

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Line Chart Placeholder */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-72">
            <p className="text-lg font-semibold text-gray-800 mb-4">Applications Over Time</p>
            <div className="h-full flex items-center justify-center text-gray-400 italic">
              (Chart Placeholder)
            </div>
          </div>

          {/* Bar Chart Placeholder */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-72">
            <p className="text-lg font-semibold text-gray-800 mb-4">Top Scoring Jobs</p>
            <div className="h-full flex items-center justify-center text-gray-400 italic">
              (Chart Placeholder)
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HomePage;
