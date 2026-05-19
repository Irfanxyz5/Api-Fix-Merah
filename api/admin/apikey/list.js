import connectDB from '../../../utils/connectDB.js';
import { ApiKey } from '../../../models/ApiKey.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { showInactive } = req.query; // optional, default hanya aktif

    await connectDB();
    const filter = {};
    if (showInactive !== 'true') {
      filter.isActive = true;
    }

    const keys = await ApiKey.find(filter).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: keys.length,
      keys
    });
  } catch (error) {
    console.error('List API Keys error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}