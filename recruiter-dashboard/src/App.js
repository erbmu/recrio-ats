import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import ApplicantReportPage from "./pages/ApplicantReportPage";
import CompareView from "./pages/CompareView";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<HomePage />} />
        <Route path="/dashboard/jobs" element={<JobsPage />} />
        <Route path="/dashboard/compare" element={<CompareView />} />
        <Route path="/dashboard/job/:id" element={<JobDetailPage />} />
        <Route
          path="/dashboard/job/:jobId/applicant/:applicantId"
          element={<ApplicantReportPage />}
        />
        {/* Add compare page later */}
      </Routes>
    </Router>
  );
}

export default App;
