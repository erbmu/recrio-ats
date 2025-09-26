// src/pages/SignUpPage.jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
// If you want to wire backend later, uncomment this and call api(...) on submit
// import { api } from "../api/client";

const isAlnum6 = (s) => /^[A-Za-z0-9]{6}$/.test(s || "");
const clamp = (s, n) => (s || "").slice(0, n);

const SignUpPage = () => {
  const nav = useNavigate();
  const [form, setForm] = useState({
    orgName: "",
    fullName: "",
    workEmail: "",
    password: "",
    confirm: "",
    accessCode: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [errBanner, setErrBanner] = useState("");

  const onChange = (e) => {
    const { name, value } = e.target;
    let v = value;
    if (name === "accessCode") v = clamp(v.replace(/[^A-Za-z0-9]/g, ""), 6);
    setForm((p) => ({ ...p, [name]: v }));
  };

  const validate = () => {
    const e = {};
    if (!form.orgName.trim()) e.orgName = "Company name is required.";
    if (!form.fullName.trim()) e.fullName = "Your name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail)) e.workEmail = "Enter a valid work email.";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters.";
    if (form.password !== form.confirm) e.confirm = "Passwords do not match.";
    if (!isAlnum6(form.accessCode)) e.accessCode = "Enter a valid 6-character code.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

const submit = async (e) => {
  e.preventDefault();
  setErrBanner("");
  if (!validate()) return;

  setSubmitting(true);
  try {
    await api("/api/signup", {
      method: "POST",
      body: {
        organizationName: form.orgName.trim(),
        name: form.fullName.trim(),
        email: form.workEmail.trim(),
        password: form.password,
        accessCode: form.accessCode,
      },
    });
    // success → go to login
    nav("/login", { replace: true, state: { justSignedUp: true } });
  } catch (ex) {
    setErrBanner(ex.message || "Sign up failed");
  } finally {
    setSubmitting(false);
  }
};

  return (
    <div className="min-h-screen bg-[#f4f4f7] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Create your recruiter account</h1>
        <p className="text-sm text-gray-500 mb-6">
          Recrio <span className="text-gray-400">—</span> minimal, secure, and built for teams.
        </p>

        {errBanner ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errBanner}
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
              <input
                name="orgName"
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                value={form.orgName}
                onChange={onChange}
                required
              />
              {errors.orgName && <p className="text-xs text-red-600 mt-1">{errors.orgName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
              <input
                name="fullName"
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                value={form.fullName}
                onChange={onChange}
                required
              />
              {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work email</label>
            <input
              name="workEmail"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              value={form.workEmail}
              onChange={onChange}
              required
            />
            {errors.workEmail && <p className="text-xs text-red-600 mt-1">{errors.workEmail}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                value={form.password}
                onChange={onChange}
                required
              />
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                value={form.confirm}
                onChange={onChange}
                required
              />
              {errors.confirm && <p className="text-xs text-red-600 mt-1">{errors.confirm}</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 mb-1">Access code</label>
              <span className="text-xs text-gray-500">
                Invite-only. Need a code? Email <span className="font-medium">recrio@ggmail.com</span>
              </span>
            </div>
            <input
              name="accessCode"
              type="text"
              inputMode="text"
              placeholder="ABC123"
              className="w-full uppercase tracking-widest rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              value={form.accessCode}
              onChange={onChange}
              required
            />
            {errors.accessCode && <p className="text-xs text-red-600 mt-1">{errors.accessCode}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-gray-900 text-white py-2 text-sm font-medium hover:bg-black disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>

          <div className="text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link className="text-gray-900 hover:underline" to="/login">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUpPage;
