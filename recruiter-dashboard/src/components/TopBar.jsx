// src/components/TopBar.jsx
import React from "react";

const TopBar = () => {
  const tabs = ["Dashboard", "Analytics", "Metrics", "Data"];

  return (
    <div className="w-full px-10 py-4 bg-white text-gray-800 border-b border-gray-100 shadow-sm flex justify-between items-center">
      <h1 className="text-lg font-semibold tracking-tight">
        Recrio <span className="font-light text-gray-500">Dashboard</span>
      </h1>

      <nav className="flex gap-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            className="text-sm font-medium text-gray-600 hover:text-black transition"
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default TopBar;
