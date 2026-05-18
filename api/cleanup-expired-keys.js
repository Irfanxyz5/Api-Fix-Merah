import connectDB from '../utils/connectDB';
import { ApiKey } from '../models/ApiKey';

export default async function handler(req, res) {
  // Proteksi dengan secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await connectDB();
  const result = await ApiKey.deleteMany({
    expiresAt: { $lt: new Date() },
    isActive: false
  });
  res.status(200).json({ deleted: result.deletedCount });
}