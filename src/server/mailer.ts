import "server-only";
import nodemailer from "nodemailer";

/**
 * Outbound email, used only for password reset.
 *
 * The application sends no other kind of message. There is deliberately no
 * notification or marketing path here, because every added sender is another
 * place a member's email address or name could escape to.
 */

export type MailResult = { delivered: true } | { delivered: false; reason: string };

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

function readConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? "587") || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from,
  };
}

/**
 * Escapes a value for interpolation into an HTML attribute.
 *
 * The only dynamic value that ever reaches the HTML body is a reset URL this
 * process generated itself, from a validated APP_URL and a base64url token, so
 * there is no realistic injection path today. It is escaped anyway: the point
 * of an escape function is that it is correct on the day someone later widens
 * what gets interpolated, not only on the day it was written.
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildResetEmail(resetUrl: string): { subject: string; text: string; html: string } {
  const subject = "Reset your password";
  const text = [
    "A password reset was requested for your Confession Attendance account.",
    "",
    "Open this link to choose a new password:",
    resetUrl,
    "",
    "The link can be used once and expires in one hour.",
    "If you did not request this, you can ignore this message; nothing has changed.",
  ].join("\n");

  // The body carries no member data at all: no name, no parish, no attendance
  // information. Even a misdirected send discloses nothing beyond the fact that
  // an account exists.
  const link = escapeHtmlAttribute(resetUrl);
  const html = [
    "<p>A password reset was requested for your Confession Attendance account.</p>",
    `<p><a href="${link}">Choose a new password</a></p>`,
    "<p>The link can be used once and expires in one hour.</p>",
    "<p>If you did not request this, you can ignore this message; nothing has changed.</p>",
  ].join("");

  return { subject, text, html };
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<MailResult> {
  const config = readConfig();
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");

  if (!appUrl) {
    return { delivered: false, reason: "APP_URL is not configured." };
  }

  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const message = buildResetEmail(resetUrl);

  if (!config) {
    // Outside production a missing SMTP server is a local convenience, so the
    // link is written to the console where a developer can complete the flow.
    // In production this is a hard failure: reporting a reset as sent when
    // nothing was transmitted would strand the user with no way in and no
    // error to act on.
    if (process.env.NODE_ENV === "production") {
      return { delivered: false, reason: "SMTP is not configured." };
    }
    process.stdout.write(
      `[mailer] SMTP unconfigured; password reset link for ${email}: ${resetUrl}\n`,
    );
    return { delivered: true };
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true };
  } catch {
    // The underlying error can contain the recipient address and the SMTP
    // response, so it is not propagated or logged. The caller learns only that
    // delivery failed.
    return { delivered: false, reason: "The message could not be sent." };
  }
}
