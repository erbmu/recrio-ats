// src/pages/ApplicantReportPage.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

const ApplicantReportPage = () => {
  const { jobId, applicantId } = useParams();
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-600 hover:text-gray-800 hover:underline mb-2"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">
          Applicant Report: {applicantId}
        </h1>
        <p className="text-sm text-gray-500">For job ID: {jobId}</p>
      </div>

      {/* Summary scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Business Impact</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">8/10</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Technical Accuracy</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">9/10</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Communication</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">7/10</p>
        </div>
      </div>

{/* Career Card Summary */}
<div className="bg-white border border-gray-200 rounded-lg p-6 mb-10 shadow-sm">
  <h2 className="text-lg font-semibold text-gray-800 mb-4">Career Card Feedback</h2>
  <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
    <li>
      <strong className="text-gray-900">Technical Expertise:</strong> Demonstrated strong experience in AI model deployment, MLOps, and API integrations. Portfolio includes 6 GitHub projects with clear documentation and consistent commit history.
    </li>
    <li>
      <strong className="text-gray-900">Communication Skills:</strong> Explains technical concepts with clarity for both technical and non-technical stakeholders. Resume language is concise and aligned with industry expectations.
    </li>
    <li>
      <strong className="text-gray-900">Business Impact:</strong> Past projects indicate potential to drive measurable business value, particularly in optimizing AI workflows and reducing deployment cycles.
    </li>
    <li>
      <strong className="text-gray-900">Growth Areas:</strong> Could expand exposure to security best practices in AI systems and large-scale distributed training.
    </li>
  </ul>
</div>

{/* Simulation Summary */}
<div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
  <h2 className="text-lg font-semibold text-gray-800 mb-4">Simulation Report</h2>
  <p className="text-gray-700 text-sm leading-relaxed mb-4">
    The applicant completed a 5-scenario simulation tailored to the AI Engineer role:
  </p>
  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
    <li>
      <strong>Scenario 1 – Model Optimization:</strong> Selected appropriate trade-offs between accuracy and inference time, explaining rationale clearly.
    </li>
    <li>
      <strong>Scenario 2 – Production Incident:</strong> Applied structured troubleshooting and rapid rollback strategies.
    </li>
    <li>
      <strong>Scenario 3 – Stakeholder Briefing:</strong> Delivered concise, impactful updates without overloading technical jargon.
    </li>
    <li>
      <strong>Scenario 4 – Budget Constraints:</strong> Proposed cost-effective deployment without compromising core functionality.
    </li>
    <li>
      <strong>Scenario 5 – Ethical AI Decision:</strong> Displayed awareness of bias mitigation strategies and compliance requirements.
    </li>
  </ol>
  <br /> {/* ← Empty line */}

    {/* New breakdown added below */}
  <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
    <li><span className="font-medium">Business Impact:</span> Showed strong understanding of how technical actions affect client outcomes.</li>
    <li><span className="font-medium">Technical Accuracy:</span> Applied correct methodologies but occasionally missed deeper technical nuances.</li>
    <li><span className="font-medium">Trade-off Analysis:</span> Weighed pros and cons of solutions, though reasoning was sometimes surface-level.</li>
    <li><span className="font-medium">Constraint Management:</span> Adapted approach effectively when faced with time and resource limitations.</li>
    <li><span className="font-medium">Communication Skills:</span> Presented ideas clearly, though could improve in summarizing complex issues concisely.</li>
  </ul>

  <p className="text-sm text-gray-500 italic mt-4">
    Transcript not available in this mock. Final product will include full AI-generated transcripts and category-wise scoring.
  </p>
</div>
    </Layout>
  );
};

export default ApplicantReportPage;
