import nodemailer from 'nodemailer';
import cors from 'cors';

const runMiddleware = (req, res, fn) => new Promise((resolve, reject) => {
  fn(req, res, (result) => result instanceof Error ? reject(result) : resolve(result));
});

export default async function handler(req, res) {
  try {
    await runMiddleware(req, res, cors());
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Dynamic imports with fallback
    let ApiKey, connectDB;
    try {
      const apiKeyModule = await import('../models/ApiKey');
      ApiKey = apiKeyModule.ApiKey;
      const connectModule = await import('../utils/connectDB');
      connectDB = connectModule.default;
    } catch (err) {
      console.error('Import error:', err);
      return res.status(500).json({ error: 'Server configuration error', detail: 'Missing models/ApiKey or utils/connectDB' });
    }

    const { apiKey, to, subject, text, html, gmailUser, gmailAppPassword } = req.body;
    if (!apiKey) return res.status(401).json({ error: 'API Key required' });
    if (!to || !subject || (!text && !html)) return res.status(400).json({ error: 'Missing required fields' });
    if (!gmailUser || !gmailAppPassword) return res.status(400).json({ error: 'Gmail credentials required' });

    const cleanedPassword = gmailAppPassword.replace(/\s/g, '');
    const isAdmin = (apiKey === process.env.ADMIN_API_KEY);
    let isValid = false;

    if (!isAdmin) {
      await connectDB();
      const keyData = await ApiKey.findOne({ key: apiKey, isActive: true });
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

    if (!isValid) return res.status(401).json({ error: 'Invalid or expired API Key' });

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: cleanedPassword }
    });

    const info = await transporter.sendMail({
      from: `"${gmailUser}" <${gmailUser}>`,
      to, subject, text, html: html || text
    });

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('send-email error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}