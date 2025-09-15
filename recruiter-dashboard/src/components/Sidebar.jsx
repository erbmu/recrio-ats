// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { name: "Home", to: "/dashboard", icon: "🏠" },
  { name: "Jobs", to: "/dashboard/jobs", icon: "📂" },
  { name: "Compare", to: "/dashboard/compare", icon: "📊" },
];

const Sidebar = () => {
  return (
    <div className="w-60 h-screen bg-gray-900 text-white flex flex-col py-6 px-4 fixed left-0 top-0">
      <h1 className="text-xl font-bold mb-8">Recrio</h1>

      <nav className="flex flex-col gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium transition-all ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              }`
            }
          >
            <span>{item.icon}</span>
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
