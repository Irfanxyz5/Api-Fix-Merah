import connectDB from '../../../utils/connectDB.js';
import { ApiKey } from '../../../models/ApiKey.js';
import { calculateExpiry } from '../../../utils/calculateExpiry.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Otentikasi dengan admin key dari header
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { key, email, duration } = req.body;
    if (!key || !email || !duration) {
      return res.status(400).json({ error: 'Missing required fields: key, email, duration' });
    }

    const validDurations = ['1h', '7h', '1month', 'permanent'];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({ error: 'Invalid duration. Must be 1h, 7h, 1month, or permanent' });
    }

    await connectDB();

    // Cek apakah key sudah ada
    const existing = await ApiKey.findOne({ key });
    if (existing) {
      return res.status(409).json({ error: 'API Key already exists' });
    }

    const expiresAt = calculateExpiry(duration);
    const newKey = new ApiKey({
      key,
      email,
      duration,
      expiresAt,
      isActive: true,
      createdAt: new Date()
    });
    await newKey.save();

    res.status(201).json({
      success: true,
      message: 'API Key created successfully',
      key: newKey
    });
  } catch (error) {
    console.error('Create API Key error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}