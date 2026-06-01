const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  tls: { rejectUnauthorized: false },
});

async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"Truc Valencià" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };
