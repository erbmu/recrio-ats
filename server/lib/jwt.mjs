import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Validate a Bearer token and return payload (or null)
export function verifyTokenFromHeader(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  try {
    return jwt.verify(m[1], JWT_SECRET);
  } catch {
    return null;
  }
}
