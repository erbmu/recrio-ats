import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { auth } from "../middleware/auth.mjs";
import { db } from "../db.mjs";

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugifyOrg(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 60) || "org";
}

async function getUniqueOrgSlug(tx, name) {
  const base = slugifyOrg(name);
  let attempt = 1;
  let candidate = base;
  while (attempt <= 40) {
    const exists = await tx.organizations.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`.slice(0, 80);
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 80);
}

/**
 * POST /api/login
 * body: { email, password }
 * returns: { token }
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const user = await prisma.users.findFirst({ where: { email: emailNorm } });
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  // Coerce BigInts to strings so jsonwebtoken can serialize cleanly
  const payload = {
    id: user.id != null ? String(user.id) : null,
    orgId: user.org_id != null ? String(user.org_id) : null,
    role: user.role || "recruiter",
    recruiterType: user.recruiter_type || "single",
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
  return res.json({ token });
});

router.post("/signup", async (req, res) => {
  try {
    const {
      organizationName = "",
      name = "",
      email = "",
      password = "",
      accessCode = "",
      recruiterType = "single",
    } = req.body || {};
    const orgName = String(organizationName).trim();
    const fullName = String(name).trim();
    const emailNorm = String(email).trim().toLowerCase();
    const pwd = String(password);
    const code = String(accessCode).trim().toUpperCase();

    if (!fullName || !emailNorm || !pwd || !code) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (!EMAIL_RE.test(emailNorm)) {
      return res.status(400).json({ error: "Enter a valid work email." });
    }
    if (pwd.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: "Access code must be 6 letters/numbers." });
    }
    const recruiterTypeNorm = String(recruiterType || "").toLowerCase() === "agency" ? "agency" : "single";

    const existingUser = await prisma.users.findUnique({ where: { email: emailNorm } });
    if (existingUser) {
      return res.status(400).json({ error: "An account with that email already exists. Please sign in." });
    }

    const invite = await prisma.invite_codes.findUnique({ where: { code } });
    if (!invite) {
      return res.status(404).json({ error: "Invite code not found." });
    }

    const now = Date.now();
    if (invite.expires_at && invite.expires_at.getTime() < now) {
      return res.status(400).json({ error: "This invite code has expired." });
    }
    if (invite.uses >= invite.max_uses) {
      return res.status(400).json({ error: "This invite code has already been used." });
    }
    if (!invite.org_id && !orgName) {
      return res.status(400).json({ error: "Company name is required for new organizations." });
    }

    let existingOrg = null;
    if (invite.org_id) {
      existingOrg = await prisma.organizations.findUnique({
        where: { id: invite.org_id },
        select: { id: true, is_active: true },
      });
      if (!existingOrg || existingOrg.is_active === false) {
        return res.status(400).json({ error: "Organization linked to this invite is not available." });
      }
    }

    const passwordHash = await bcrypt.hash(pwd, 10);

    await prisma.$transaction(async (tx) => {
      let orgId = invite.org_id;

      if (!orgId) {
        const slug = await getUniqueOrgSlug(tx, orgName);
        const createdOrg = await tx.organizations.create({
          data: {
            name: orgName,
            slug,
            is_active: true,
          },
          select: { id: true },
        });
        orgId = createdOrg.id;
      }

      await tx.users.create({
        data: {
          org_id: orgId,
          email: emailNorm,
          name: fullName,
          password_hash: passwordHash,
          role: invite.role || "recruiter",
          recruiter_type: recruiterTypeNorm,
          is_active: true,
        },
      });

      const updateData = {
        uses: { increment: 1 },
        updated_at: new Date(),
      };
      if (!invite.org_id && orgId) {
        updateData.org_id = orgId;
      }

      const updated = await tx.invite_codes.updateMany({
        where: {
          id: invite.id,
          uses: { lt: invite.max_uses },
        },
        data: updateData,
      });
      if (!updated.count) {
        const err = new Error("Invite no longer available.");
        err.status = 400;
        err.publicMessage = "This invite code has already been used.";
        throw err;
      }
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("signup error:", err);
    if (err?.status) {
      return res.status(err.status).json({ error: err.publicMessage || err.message });
    }
    return res.status(500).json({ error: "Unable to create account right now." });
  }
});

/**
 * GET /api/me
 * returns: { id, name, email, role }
 */
router.get("/me", auth, async (req, res) => {
  // ids in JWT are strings — convert for DB
  const id = BigInt(req.user.id);
  const u = await prisma.users.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, org_id: true },
  });
  if (!u) return res.status(404).json({ error: "User not found" });

  let recruiterType = req.user?.recruiterType || "single";
  try {
    const row = await db("users").select("recruiter_type").where({ id: Number(id) }).first();
    if (row?.recruiter_type) recruiterType = row.recruiter_type;
  } catch (err) {
    console.warn("[auth:/me] recruiter_type lookup failed", err?.message || err);
  }

  res.json({ ...u, recruiter_type: recruiterType });
});

export default router;
