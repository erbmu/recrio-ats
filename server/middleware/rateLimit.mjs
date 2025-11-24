import rateLimit from "express-rate-limit";

// Public endpoints (e.g., /applications/public/*)
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// (Optional) Authenticated endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Default export for files that do `import rateLimiter from ...`
export default { publicLimiter, authLimiter };
