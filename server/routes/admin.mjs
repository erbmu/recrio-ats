// server/routes/admin.mjs
import express from "express";
import { PrismaClient } from "@prisma/client";
import { auth, requireAdmin } from "../middleware/auth.mjs";

const prisma = new PrismaClient();
const router = express.Router();

function generateInviteCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous chars
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// POST /api/admin/invite-code
router.post("/admin/invite-code", auth, requireAdmin, async (req, res) => {
  try {
    const { orgId = null, role = "recruiter", maxUses = 1, expiresAt = null } = req.body || {};

    // ensure uniqueness
    let code;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      code = generateInviteCode(6);
      const exists = await prisma.invite_codes.findUnique({ where: { code } });
      if (!exists) break;
    }

    const invite = await prisma.invite_codes.create({
      data: {
        code,
        org_id: orgId ? BigInt(orgId) : null,
        role,
        max_uses: Number(maxUses) || 1,
        expires_at: expiresAt ? new Date(expiresAt) : null,
        created_by_user_id: req.user?.id ? BigInt(req.user.id) : null,
      },
    });

    return res.json({
      ok: true,
      invite: {
        ...invite,
        id: invite.id.toString(),
        org_id: invite.org_id ? invite.org_id.toString() : null,
        created_by_user_id: invite.created_by_user_id
          ? invite.created_by_user_id.toString()
          : null,
      },
    });
  } catch (e) {
    console.error("create invite error:", e);
    return res.status(500).json({ error: "Failed to create invite code" });
  }
});

// GET /api/admin/invite-codes
router.get("/admin/invite-codes", auth, requireAdmin, async (_req, res) => {
  try {
    const rows = await prisma.invite_codes.findMany({
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return res.json({
      ok: true,
      invites: rows.map((r) => ({
        ...r,
        id: r.id.toString(),
        org_id: r.org_id ? r.org_id.toString() : null,
        created_by_user_id: r.created_by_user_id
          ? r.created_by_user_id.toString()
          : null,
      })),
    });
  } catch (e) {
    console.error("list invites error:", e);
    return res.status(500).json({ error: "Failed to load invites" });
  }
});

export default router;
