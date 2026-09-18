/**
 * Tiny mail helper. If SMTP settings are absent (the normal case in local dev
 * and in a college demo) it reports non-delivery without logging message bodies
 * that may contain password-reset tokens.
 */

let transporter = null;

const isConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

const getTransporter = () => {
  if (!isConfigured()) return null;
  if (!transporter) {
    // Required lazily so the app runs even if nodemailer is not installed.
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

const sendMail = async ({ to, subject, text, html }) => {
  const tx = getTransporter();

  if (!tx) {
    console.warn('[mail] NOT DELIVERED - SMTP is not configured.');
    return { delivered: false };
  }

  try {
    await tx.sendMail({
      from: process.env.MAIL_FROM || 'Hisab Ki Kitab <no-reply@hisabkikitab.app>',
      to,
      subject,
      text,
      html: html || `<p>${text.replace(/\n/g, '<br/>')}</p>`,
    });
  } catch {
    // SMTP responses can echo authentication details. The global error handler
    // logs thrown errors, so do not propagate the provider's raw error or cause.
    throw new Error('Email delivery failed');
  }

  return { delivered: true };
};

module.exports = { sendMail, isConfigured };
