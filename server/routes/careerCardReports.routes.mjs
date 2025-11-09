import { Router } from "express";
import { ensureCareerCardReport, fetchCareerCardReport } from "../lib/careerCardReportService.mjs";
import { requireAuth } from "../middleware/requireAuth.mjs";

const router = Router();

let publicLimiter = (_req, _res, next) => next();
let warnedLimiter = false;
try {
  import("../middleware/rateLimit.mjs")
    .then((mod) => {
      const candidate =
        mod?.publicLimiter ||
        (mod?.default && mod.default.publicLimiter);
      if (typeof candidate === "function") {
        publicLimiter = candidate;
      } else if (!warnedLimiter) {
        warnedLimiter = true;
        console.warn("[careerCardReports] publicLimiter not found, continuing without rate limiting.");
      }
    })
    .catch((err) => {
      if (!warnedLimiter) {
        warnedLimiter = true;
        console.warn("[careerCardReports] failed to load rateLimit module.", err?.message || err);
      }
    });
} catch {
  if (!warnedLimiter) {
    warnedLimiter = true;
    console.warn("[careerCardReports] rateLimit module unavailable.");
  }
}

router.post("/", publicLimiter, async (req, res, next) => {
  try {
    const candidateId = req.body?.candidate_id ?? req.body?.candidateId ?? req.body?.id;
    if (!candidateId) return res.status(400).json({ error: "candidate_id_required" });
    const forceRefresh =
      req.body?.force === true ||
      req.body?.refresh === true ||
      req.body?.forceRefresh === true;

    const result = await ensureCareerCardReport({ candidateId, forceRefresh });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get("/:candidateId", requireAuth(), async (req, res, next) => {
  try {
    const report = await fetchCareerCardReport(req.params.candidateId);
    if (!report) return res.status(404).json({ error: "report_not_found" });
    return res.json(report);
  } catch (err) {
    return next(err);
  }
});

export default router;
