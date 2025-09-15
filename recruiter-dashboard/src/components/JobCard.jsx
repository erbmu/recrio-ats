import React from "react";
import { useNavigate } from "react-router-dom";

const JobCard = ({ job }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/dashboard/job/${job.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer bg-white border border-gray-100 rounded-lg p-5 shadow-sm hover:shadow-md transition"
    >
      <h2 className="text-xl font-medium text-gray-800 mb-2">{job.title}</h2>
      <p className="text-sm text-gray-600">{job.applicants} applicants</p>
    </div>
  );
};

export default JobCard;
