import React from "react";

const LoginPage = () => {
  return (
    <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-semibold text-gray-900 mb-8 tracking-tight">
        Recrio <span className="font-light text-gray-600">– Dashboard</span>
      </h1>

      <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md border border-gray-200">
        <h2 className="text-2xl font-medium text-gray-800 mb-6 text-center">Sign in as Recruiter</h2>

        <form>
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              placeholder="you@apple.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
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
      </div>
    </div>
  );
};

export default LoginPage;
