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
  const candidateId = req.params.candidateId;
  const autoEnsure = req.query.ensure !== "false";
  const forceRefresh =
    req.query.force === "true" ||
    req.query.forceRefresh === "true";
  try {
    let report = null;

    if (autoEnsure) {
      try {
        const ensured = await ensureCareerCardReport({
          candidateId,
          forceRefresh,
        });
        report = ensured?.report || null;
        console.info(
          "[careerCardReports] ensure result",
          JSON.stringify(
            {
              candidateId,
              status: ensured?.status || "unknown",
              hasReport: !!report,
            },
            null,
            2
          )
        );
      } catch (err) {
        const status = err?.status || err?.statusCode || 500;
        console.warn(
          "[careerCardReports] ensure failed",
          JSON.stringify(
            {
              candidateId,
              status,
              message: err?.message,
              details: err?.details,
            },
            null,
            2
          )
        );
        if (status !== 404 && status !== 409) {
          return next(err);
        }
        if (status === 409) {
          return res.status(409).json({ error: err?.message || "career_card_missing" });
        }
      }
    }

    if (!report) {
      report = await fetchCareerCardReport(candidateId);
    }

    if (!report) {
      return res.status(404).json({ error: "report_not_found" });
    }
    return res.json(report);
  } catch (err) {
    return next(err);
  }
});

export default router;
