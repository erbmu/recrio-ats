// server/lib/renderMail.mjs
const RENDER_API_KEY = process.env.RENDER_API_KEY || "";
const RENDER_MAIL_ENDPOINT = process.env.RENDER_MAIL_ENDPOINT || "https://api.render.com/v1/mail/send";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_MAIL_ENDPOINT = process.env.RESEND_MAIL_ENDPOINT || "https://api.resend.com/emails";
const DEFAULT_FROM =
  process.env.SIM_INVITE_FROM ||
  process.env.RENDER_MAIL_FROM ||
  "Recrio Hiring <notifications@recrio-mail.com>";
const SUPPORT_EMAIL = process.env.SIM_SUPPORT_EMAIL || "support@recrio-ai.com";

const hasRenderMail = Boolean(RENDER_API_KEY);
const hasResendMail = Boolean(RESEND_API_KEY);
const hasMailProvider = hasRenderMail || hasResendMail;

const buildBody = ({ candidateName, candidateEmail, jobTitle, companyName, simulationUrl }) => {
  const name = candidateName?.trim() || "there";
  const company = companyName?.trim() || "our team";

  const subject = `Your Recrio Simulation Is Ready for ${company}`;

  const text = `Hi ${name},

Thank you for your interest in ${company} and for taking the next step with Recrio Simulations.
We’re excited to learn more about you through our short, role-specific simulation.

Simulation Link:
${simulationUrl}

Please complete the simulation at your earliest convenience so we can move your application forward. Once submitted, our team will review your responses and get back to you shortly.

If you have any questions or encounter any issues, simply reply to this email or contact us at ${SUPPORT_EMAIL} — we’re happy to help.

Best of luck,
Team Recrio`;

  const html = `
  <p>Hi ${name},</p>
  <p>Thank you for your interest in ${company} and for taking the next step with Recrio Simulations. We’re excited to learn more about you through our short, role-specific simulation.</p>
  <p><strong>Simulation Link:</strong></p>
  <p>
    <a href="${simulationUrl}" style="display:inline-flex;padding:12px 20px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:600;">
      Start Your Simulation
    </a>
  </p>
  <p>Please complete the simulation at your earliest convenience so we can move your application forward. Once submitted, our team will review your responses and get back to you shortly.</p>
  <p>If you have any questions or encounter any issues, simply reply to this email or contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> — we’re happy to help.</p>
  <p>Best of luck,<br/>Team Recrio</p>`;

  return { subject, text, html, to: candidateEmail };
};

export async function sendSimulationInviteEmail(payload) {
  if (!hasMailProvider) {
    console.warn("[renderMail] Missing mail API key (set RENDER_API_KEY or RESEND_API_KEY) – skipping email send.");
    return { skipped: true, reason: "missing_api_key" };
  }

  const { subject, text, html, to } = buildBody(payload);
  const provider = hasRenderMail ? "render" : "resend";
  console.info(`[renderMail] Attempting simulation invite send via ${provider}`, {
    to,
    jobTitle: payload.jobTitle,
    companyName: payload.companyName,
  });

  const body = {
    from: DEFAULT_FROM,
    to,
    subject,
    text,
    html,
  };

  if (hasRenderMail) {
    return sendViaProvider({
      provider: "Render",
      endpoint: RENDER_MAIL_ENDPOINT,
      apiKey: RENDER_API_KEY,
      body,
      to,
    });
  }

  return sendViaProvider({
    provider: "Resend",
    endpoint: RESEND_MAIL_ENDPOINT,
    apiKey: RESEND_API_KEY,
    body,
    to,
  });
}

async function sendViaProvider({ provider, endpoint, apiKey, body, to }) {
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[renderMail] network error sending invite via ${provider}`, { to, error: err?.message || err });
    throw err;
  }

  if (!resp.ok) {
    const message = await resp.text();
    console.error(`[renderMail] invite rejected by ${provider}`, {
      to,
      status: resp.status,
      message,
    });
    throw new Error(`${provider} mail failed (${resp.status}): ${message}`);
  }

  let json = null;
  try {
    json = await resp.json();
  } catch {
    json = { ok: true };
  }

  console.info(`[renderMail] invite accepted by ${provider}`, {
    to,
    status: resp.status,
    id: json?.id || null,
  });
  return json;
}

export const canSendSimulationEmail = hasMailProvider;
