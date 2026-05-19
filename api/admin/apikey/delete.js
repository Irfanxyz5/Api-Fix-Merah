import connectDB from '../../../utils/connectDB.js';
import { ApiKey } from '../../../models/ApiKey.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Missing key field' });
    }

    await connectDB();
    const result = await ApiKey.deleteOne({ key });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'API Key not found' });
    }

    res.status(200).json({ success: true, message: 'API Key deleted' });
  } catch (error) {
    console.error('Delete API Key error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}