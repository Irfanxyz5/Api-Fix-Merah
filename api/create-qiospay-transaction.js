import { v4 as uuidv4 } from 'uuid';
import connectDB from '../utils/connectDB.js';
import { Transaction } from '../models/Transaction.js';
import { ApiKey } from '../models/ApiKey.js';

const PRICE_LIST = { '1h': 5000, '7h': 15000, '1month': 50000, 'permanent': 150000 };
const STATIC_QR_URL = process.env.QIOSPAY_STATIC_QR_URL;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    await connectDB();

    const { duration, chatId, customApiKey } = req.body;
    if (!duration || !PRICE_LIST[duration]) return res.status(400).json({ error: 'Durasi tidak valid' });

    if (duration === 'permanent') {
      if (!customApiKey) return res.status(400).json({ error: 'Custom API Key required' });
      const keyRegex = /^[a-zA-Z0-9_-]{8,64}$/;
      if (!keyRegex.test(customApiKey)) return res.status(400).json({ error: 'Format custom key tidak valid' });
      const existing = await ApiKey.findOne({ key: customApiKey });
      if (existing) return res.status(409).json({ error: 'Custom API Key sudah digunakan' });
    }

    const orderId = `QIOSPAY-${uuidv4()}`;
    const amount = PRICE_LIST[duration];

    const transaction = new Transaction({
      orderId,
      chatId,
      amount,
      duration,
      customApiKey: duration === 'permanent' ? customApiKey : null,
      status: 'pending',
      paymentGateway: 'qiospay',
      qrImageUrl: STATIC_QR_URL   // QR statis dari merchant
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      qrImageUrl: STATIC_QR_URL,
      orderId,
      amount,
      note: 'Scan QR statis dan bayar sesuai nominal. Kami akan memverifikasi pembayaran secara otomatis.'
    });
  } catch (error) {
    console.error('Qiospay create error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}