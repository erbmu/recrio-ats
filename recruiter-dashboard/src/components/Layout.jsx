import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { tokenStore } from "../api/client";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    const norm = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(norm);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export default function Layout() {
  const navigate = useNavigate();

  const onSignOut = () => {
    tokenStore.clear();
    navigate("/login", { replace: true });
  };

  const jwt = tokenStore.get();
  const me = jwt ? decodeJwtPayload(jwt) : null;

  return (
    <div className="min-h-screen bg-[#f4f4f7]">
      {/* Top bar */}
      <div className="w-full px-6 sm:px-10 py-3 bg-white text-gray-800 border-b border-gray-100 shadow-sm flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">
          Recrio <span className="font-light text-gray-500">Dashboard</span>
        </h1>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink
            to="/dashboard/home"
            className={({ isActive }) =>
              classNames(
                "hover:text-gray-900",
                isActive ? "text-gray-900" : "text-gray-600"
              )
            }
          >
            Dashboard
          </NavLink>
          <button type="button" className="text-gray-400 cursor-not-allowed" disabled aria-disabled="true" tabIndex={-1}>
            Analytics
          </button>
          <button type="button" className="text-gray-400 cursor-not-allowed" disabled aria-disabled="true" tabIndex={-1}>
            Metrics
          </button>
          <button type="button" className="text-gray-400 cursor-not-allowed" disabled aria-disabled="true" tabIndex={-1}>
            Data
          </button>

          <button
            onClick={onSignOut}
            className="ml-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </nav>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 min-h-[calc(100vh-56px)] bg-[#111827] text-white p-4">
          <div className="mb-4 font-semibold">Recrio</div>
          <nav className="space-y-1 text-sm">
            <NavLink
              to="/dashboard/home"
              className={({ isActive }) =>
                classNames(
                  "block rounded-md px-3 py-2",
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                )
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/dashboard/jobs"
              className={({ isActive }) =>
                classNames(
                  "block rounded-md px-3 py-2",
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                )
              }
            >
              Jobs
            </NavLink>
            <NavLink
              to="/dashboard/compare"
              className={({ isActive }) =>
                classNames(
                  "block rounded-md px-3 py-2",
                  isActive ? "bg-white/10" : "hover:bg-white/5"
                )
              }
            >
              Compare
            </NavLink>

            {me?.role === "admin" && (
              <NavLink
                to="/dashboard/admin/invites"
                className={({ isActive }) =>
                  classNames(
                    "block rounded-md px-3 py-2",
                    isActive ? "bg-white/10" : "hover:bg-white/5"
                  )
                }
              >
                Admin · Invites
              </NavLink>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 sm:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
