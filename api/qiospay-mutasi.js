import connectDB from '../utils/connectDB.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const merchantCode = process.env.QIOSPAY_MERCHANT_CODE;
    const apiKey = process.env.QIOSPAY_API_KEY;
    const url = `https://qiospay.id/api/mutasi/qris/${merchantCode}/${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'success') {
      return res.status(502).json({ error: 'Failed to fetch mutasi', detail: data });
    }
    res.status(200).json(data);
  } catch (error) {
    console.error('Mutasi error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}