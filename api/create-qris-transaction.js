import { v4 as uuidv4 } from 'uuid';
import connectDB from '../utils/connectDB.js';
import { Transaction } from '../models/Transaction.js';
import { ApiKey } from '../models/ApiKey.js';

const PRICE_LIST = { '1h': 5000, '7h': 15000, '1month': 50000, 'permanent': 150000 };

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

    const orderId = `QRIS-${uuidv4()}`;
    const amount = PRICE_LIST[duration];

    const transaction = new Transaction({
      orderId, chatId, amount, duration,
      customApiKey: duration === 'permanent' ? customApiKey : null,
      status: 'pending'
    });
    await transaction.save();

    // Panggil Qiospay API (ganti endpoint sesuai dokumentasi Qiospay)
    const qiosResponse = await fetch(`${process.env.QIOSPAY_API_BASE_URL}/qris/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Code': process.env.QIOSPAY_MERCHANT_CODE,
        'X-API-Key': process.env.QIOSPAY_API_KEY
      },
      body: JSON.stringify({ order_id: orderId, amount, description: `Pembelian API Key ${duration}` })
    });

    const qiosData = await qiosResponse.json();
    if (!qiosData.qr_image_url) {
      await Transaction.deleteOne({ orderId });
      return res.status(500).json({ error: 'Gagal membuat QRIS, coba lagi' });
    }

    transaction.qrImageUrl = qiosData.qr_image_url;
    await transaction.save();

    res.status(200).json({ success: true, qrImageUrl: qiosData.qr_image_url, orderId, amount });
  } catch (error) {
    console.error('create-qris error:', error);
    // Tangani error koneksi database dengan pesan ramah
    if (error.name === 'MongooseServerSelectionError' || error.message?.includes('MongoDB')) {
      return res.status(503).json({
        error: 'Database sedang sibuk. Silakan coba lagi nanti.',
        detail: 'Koneksi database terputus. Tim sedang memperbaiki.'
      });
    }
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}