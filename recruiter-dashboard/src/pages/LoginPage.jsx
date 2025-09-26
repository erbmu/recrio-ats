import React, { useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { tokenStore } from "../api/client";

const LoginPage = () => {
  const navigate = useNavigate();
  const { search } = useLocation();
  const qs = new URLSearchParams(search);
  const adminDefault = qs.get("admin") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminMode, setAdminMode] = useState(adminDefault);
  const [error, setError] = useState("");

  const formRef = useRef(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const base = process.env.REACT_APP_API_URL || "http://localhost:4000";
      const res = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}

      if (!res.ok) {
        const msg = (data && data.error) || text || "Login failed";
        throw new Error(msg);
      }

      const token = data?.token;
      if (!token) throw new Error("No token returned");

      tokenStore.set(token);
      navigate(adminMode ? "/dashboard/admin/invites" : "/dashboard");
    } catch (err) {
      setError(err.message || "Login failed");
    }
  }

  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-semibold text-gray-900 mb-8 tracking-tight">
        Recrio <span className="font-light text-gray-600">– Dashboard</span>
      </h1>

      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md border border-gray-200">
        <h2 className="text-2xl font-medium text-gray-800 mb-6 text-center">
          Sign in as Recruiter
        </h2>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} ref={formRef}>
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              placeholder="you@apple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white font-medium py-2 rounded-lg hover:bg-gray-800 transition"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don’t have an account?{" "}
            <Link to="/signup" className="font-medium text-gray-900 hover:underline">
              Sign up
            </Link>
          </p>

          <p className="text-xs text-gray-500 mt-3">
            <a
              href="/login?admin=1"
              className="font-medium text-gray-700 hover:underline"
              title="Admins will be routed to Admin page after login"
              onClick={(e) => {
                e.preventDefault();
                setAdminMode(true);
                formRef.current?.requestSubmit();
              }}
            >
              Admin sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
