// src/pages/JobDetailPage.jsx
import React from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";

const dummyApplicants = [
  { id: "1", name: "Jane Doe", rank: 1, aiScore: 92 },
  { id: "2", name: "John Smith", rank: 2, aiScore: 89 },
  { id: "3", name: "Priya Patel", rank: 3, aiScore: 84 },
];

const JobDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
            <div className="mb-6">
            <button
                onClick={() => navigate(-1)}
                className="text-sm text-gray-600 hover:text-gray-800 hover:underline transition mb-2"
            >
                ← Back
            </button>

            <h1 className="text-2xl font-semibold text-gray-900">
                Applicants for: {id}
            </h1>
            </div>
        </div>


      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-6 py-3">Rank</th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">AI Score</th>
              <th className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            {dummyApplicants.map((applicant) => (
              <tr key={applicant.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">{applicant.rank}</td>
                <td className="px-6 py-4">{applicant.name}</td>
                <td className="px-6 py-4">{applicant.aiScore}%</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => navigate(`/dashboard/job/${id}/applicant/${applicant.id}`)}
                    className="text-sm text-blue-600 hover:underline"
                    >
                    View Report
                    </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default JobDetailPage;
