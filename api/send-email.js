// api/send-email.js
import nodemailer from 'nodemailer';
import cors from 'cors';
import { ApiKey } from '../models/ApiKey';
import connectDB from '../utils/connectDB';

const runMiddleware = (req, res, fn) => new Promise((resolve, reject) => {
  fn(req, res, (result) => result instanceof Error ? reject(result) : resolve(result));
});

export default async function handler(req, res) {
  await runMiddleware(req, res, cors());

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    apiKey,
    to,
    subject,
    text,
    html,
    gmailUser,
    gmailAppPassword
  } = req.body;

  // Validasi input
  if (!apiKey) {
    return res.status(401).json({ error: 'API Key required' });
  }
  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, and (text or html)' });
  }
  if (!gmailUser || !gmailAppPassword) {
    return res.status(400).json({ error: 'Gmail credentials required: gmailUser and gmailAppPassword' });
  }

  // Bersihkan App Password dari spasi
  const cleanedPassword = gmailAppPassword.replace(/\s/g, '');

  // Verifikasi API Key (termasuk admin)
  const isAdmin = (apiKey === process.env.ADMIN_API_KEY);
  let isValid = false;
  let keyData = null;

  if (!isAdmin) {
    await connectDB();
    keyData = await ApiKey.findOne({ key: apiKey, isActive: true });
    if (keyData) {
      isValid = true;
      if (keyData.expiresAt && new Date() > keyData.expiresAt) {
        keyData.isActive = false;
        await keyData.save();
        isValid = false;
      }
    }
  } else {
    isValid = true;
  }

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid or expired API Key' });
  }

  // Kirim email menggunakan akun Gmail user
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: gmailUser,
      pass: cleanedPassword  // <--- spasi sudah dihapus
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"${gmailUser}" <${gmailUser}>`,
      to,
      subject,
      text,
      html: html || text
    });
    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully using your own Gmail account'
    });
  } catch (err) {
    console.error('Gagal kirim email:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to send email',
      detail: err.message
    });
  }
}