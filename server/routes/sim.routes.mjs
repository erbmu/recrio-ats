// server/routes/sim.routes.mjs
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.mjs";

const r = Router();

let resend = null;
try {
  const mod = await import("resend");
  const ResendCtor = mod?.Resend || mod?.default || null;
  if (ResendCtor) {
    resend = new ResendCtor(process.env.RESEND_API_KEY);
  } else {
    console.warn("[sim.routes] Resend module missing export – email disabled.");
  }
} catch (e) {
  console.warn("[sim.routes] Resend not installed – email disabled.", e?.message || e);
}

const SIM_BASE_URL = process.env.SIM_BASE_URL || "https://sim.recrio-ai.com";

const SendSimLinkSchema = z.object({
  applicationId: z.string(),
  candidateEmail: z.string().email(),
  jobTitle: z.string(),
  companyName: z.string(),
});

r.post("/api/simulation/send-link", async (req, res) => {
  const parsed = SendSimLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "bad_request" });

  const { applicationId, candidateEmail, jobTitle, companyName } = parsed.data;

  const subject = `Complete your Recrio simulation – ${companyName} (${jobTitle})`;
  const text = `Hi,

Thanks for applying to ${companyName} for ${jobTitle}.
Please complete your simulation here:

${SIM_BASE_URL}

This link is unique to your application.

— Recrio`;

  if (!resend) {
    console.warn("[sim.routes] Resend client unavailable – skipping email send.");
    return res.json({ ok: false, skipped: true, reason: "email_disabled" });
  }

  try {
    await resend.emails.send({
      from: "Recrio <onboarding@resend.dev>",
      to: candidateEmail,
      subject,
      text,
    });
    res.json({ ok: true, applicationId, urlSent: SIM_BASE_URL });
  } catch (e) {
    console.error("[sim.routes] mail_failed:", e);
    res.status(500).json({ error: "mail_failed" });
  }
});

export default r;
