import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
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

      const baseUserData = {
        org_id: orgId,
        email: emailNorm,
        name: fullName,
        password_hash: passwordHash,
        role: invite.role || "recruiter",
        is_active: true,
      };

      let createdUserId = null;
      let recruiterTypePersisted = false;
      const unknownRecruiterField = (err) =>
        err?.message?.includes?.("Unknown argument `recruiter_type`") ||
        err?.message?.includes?.("Unknown field `recruiter_type`");

      try {
        const created = await tx.users.create({
          data: { ...baseUserData, recruiter_type: recruiterTypeNorm },
          select: { id: true },
        });
        createdUserId = created?.id;
        recruiterTypePersisted = true;
      } catch (err) {
        if (!unknownRecruiterField(err)) throw err;
        const created = await tx.users.create({
          data: baseUserData,
          select: { id: true },
        });
        createdUserId = created?.id;
        recruiterTypePersisted = false;
      }

      if (createdUserId && !recruiterTypePersisted) {
        try {
          await tx.$executeRawUnsafe(
            "UPDATE users SET recruiter_type = $1 WHERE id = $2",
            recruiterTypeNorm,
            createdUserId
          );
        } catch (err) {
          console.warn("[signup] recruiter_type backfill failed", err?.message || err);
        }
      }

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

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

router.put("/me", auth, async (req, res) => {
  const parsed = UpdateProfileSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues?.[0];
    return res.status(400).json({ error: issue?.message || "invalid_payload" });
  }
  const { name, email } = parsed.data;
  const id = BigInt(req.user.id);

  const existing = await prisma.users.findFirst({
    where: {
      email,
      NOT: { id },
    },
    select: { id: true },
  });
  if (existing) {
    return res.status(400).json({ error: "Email is already in use by another user." });
  }

  const updated = await prisma.users.update({
    where: { id },
    data: { name, email },
    select: { id: true, name: true, email: true, role: true, org_id: true },
  });

  res.json({ user: updated });
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

router.post("/me/password", auth, async (req, res) => {
  const parsed = ChangePasswordSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues?.[0];
    return res.status(400).json({ error: issue?.message || "invalid_payload" });
  }
  const { currentPassword, newPassword } = parsed.data;
  const id = BigInt(req.user.id);

  const user = await prisma.users.findUnique({
    where: { id },
    select: { password_hash: true },
  });
  if (!user?.password_hash) {
    return res.status(400).json({ error: "Password cannot be updated for this user." });
  }

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  await prisma.users.update({
    where: { id },
    data: { password_hash },
  });
  res.json({ updated: true });
});

export default router;
