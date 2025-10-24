// server/routes/sim.routes.mjs
import { Router } from "express";
import { z } from "zod";
import { Resend } from "resend";

const r = Router();

const resend = new Resend(process.env.RESEND_API_KEY);
const SIM_BASE_URL = process.env.SIM_BASE_URL || "https://<your-sim>.onrender.com";

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

  try {
    await resend.emails.send({
      from: "Recrio <onboarding@resend.dev>", // switch to your verified domain later
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
