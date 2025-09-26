import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import ApplicantReportPage from "./pages/ApplicantReportPage";
import CompareView from "./pages/CompareView";
import SignUpPage from "./pages/SignUpPage";
import AdminInvitesPage from "./pages/AdminInvitesPage"; // <-- add
import ApplyPage from "./pages/ApplyPage.jsx";
import Privacy from "./pages/Privacy.jsx";

import Layout from "./components/Layout";           // must render <Outlet />
import RequireAuth from "./components/RequireAuth"; // guard that checks JWT


function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/apply/t/:token" element={<ApplyPage />} />
        <Route path="/apply/:companySlug/:jobSlug" element={<ApplyPage />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Protected dashboard shell */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          {/* child routes render inside <Layout /> via <Outlet /> */}
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="compare" element={<CompareView />} />
          <Route path="job/:id" element={<JobDetailPage />} />
          <Route path="admin/invites" element={<AdminInvitesPage />} />
          <Route
            path="job/:jobId/applicant/:applicantId"
            element={<ApplicantReportPage />}
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
