import nodemailer from 'nodemailer';
import cors from 'cors';
import { ApiKey } from '../models/ApiKey.js';
import connectDB from '../utils/connectDB.js';

const runMiddleware = (req, res, fn) => new Promise((resolve, reject) => {
  fn(req, res, (result) => result instanceof Error ? reject(result) : resolve(result));
});

export default async function handler(req, res) {
  try {
    await runMiddleware(req, res, cors());
    if (req.method !== 'POST') {
  return res.status(405).json({
    status: 'error',
    error: 'Method Not Allowed',
    message: 'Hanya method POST yang diizinkan untuk endpoint ini.',
    usage: {
      endpoint: '/api/send-email',
      method: 'POST',
      description: 'Mengirim email menggunakan API Key dan akun Gmail pribadi pengirim. Wajib memiliki API Key yang valid (dibeli via bot atau admin).',
      required_fields: ['apiKey', 'to', 'subject', 'gmailUser', 'gmailAppPassword'],
      optional_fields: ['text', 'html (minimal salah satu)'],
      example: {
        curl: `curl -X POST ${process.env.BASE_URL}/api/send-email \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "YOUR_API_KEY",
    "to": "tujuan@example.com",
    "subject": "Test Email",
    "text": "Halo dunia!",
    "gmailUser": "emailkamu@gmail.com",
    "gmailAppPassword": "abcd efgh ijkl mnop"
  }'`,
        response_success: { success: true, messageId: "<...>@gmail.com" },
        response_error: { error: "Invalid or expired API Key" }
      }
    },
    author: 'Ipanzxdev'
  });
}

    const { apiKey, to, subject, text, html, gmailUser, gmailAppPassword } = req.body;
    if (!apiKey) return res.status(401).json({ error: 'API Key required' });
    if (!to || !subject || (!text && !html)) return res.status(400).json({ error: 'Missing fields' });
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
    console.error(error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}