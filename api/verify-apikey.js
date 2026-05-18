import connectDB from '../utils/connectDB';
import { ApiKey } from '../models/ApiKey';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key required' });

  // Admin key
  if (apiKey === process.env.ADMIN_API_KEY) {
    return res.status(200).json({ valid: true, role: 'admin', message: 'Admin key valid' });
  }

  await connectDB();
  const keyData = await ApiKey.findOne({ key: apiKey, isActive: true });
  if (!keyData) return res.status(401).json({ valid: false, error: 'Invalid API Key' });
  if (keyData.expiresAt && new Date() > keyData.expiresAt) {
    keyData.isActive = false;
    await keyData.save();
    return res.status(401).json({ valid: false, error: 'API Key expired' });
  }
  res.status(200).json({ valid: true, role: 'user', email: keyData.email, duration: keyData.duration });
}