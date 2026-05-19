import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import connectDB from '../utils/connectDB.js';
import { Transaction } from '../models/Transaction.js';
import { ApiKey } from '../models/ApiKey.js';

const PRICE_LIST = { '1h': 5000, '7h': 15000, '1month': 50000, 'permanent': 150000 };

// QRIS string statis dari Qiospay (hardcode)
const QIOSPAY_STATIC_QR_STRING = '00020101021126670016COM.NOBUBANK.WWW01189360050300000907180214047055912607190303UMI51440014ID.CO.QRIS.WWW0215ID20253745537460303UMI5204541153033605802ID5912PANZX MARKET6006BEKASI61051711162070703A0163048955';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    await connectDB();

    const { gateway, duration, chatId, customApiKey } = req.body;
    if (!gateway || !['qiospay', 'pakasir'].includes(gateway)) {
      return res.status(400).json({ error: 'Gateway harus qiospay atau pakasir' });
    }
    if (!duration || !PRICE_LIST[duration]) return res.status(400).json({ error: 'Durasi tidak valid' });

    if (duration === 'permanent') {
      if (!customApiKey) return res.status(400).json({ error: 'Custom API Key required' });
      const keyRegex = /^[a-zA-Z0-9_-]{8,64}$/;
      if (!keyRegex.test(customApiKey)) return res.status(400).json({ error: 'Format custom key tidak valid' });
      const existing = await ApiKey.findOne({ key: customApiKey });
      if (existing) return res.status(409).json({ error: 'Custom API Key sudah digunakan' });
    }

    const orderId = `${gateway.toUpperCase()}-${uuidv4()}`;
    const amount = PRICE_LIST[duration];

    const transaction = new Transaction({
      orderId, chatId, amount, duration,
      customApiKey: duration === 'permanent' ? customApiKey : null,
      status: 'pending',
      paymentGateway: gateway
    });
    await transaction.save();

    let qrImageUrl = null;
    let responseData = { success: true, orderId, amount };

    if (gateway === 'qiospay') {
      // Generate QR code dari string statis yang sudah ditentukan
      const qrBuffer = await QRCode.toBuffer(QIOSPAY_STATIC_QR_STRING);
      const qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
      transaction.qrImageUrl = qrBase64;
      await transaction.save();
      responseData.qrImageUrl = qrBase64;
    } 
    else if (gateway === 'pakasir') {
      const pakasirResponse = await fetch(`${process.env.PAKASIR_API_BASE_URL}/transactioncreate/qris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: process.env.PAKASIR_PROJECT_SLUG,
          order_id: orderId,
          amount,
          api_key: process.env.PAKASIR_API_KEY
        })
      });
      const pakasirData = await pakasirResponse.json();
      if (!pakasirResponse.ok || !pakasirData.payment?.payment_number) {
        await Transaction.deleteOne({ orderId });
        return res.status(502).json({ error: 'Gagal membuat QRIS Pakasir', detail: pakasirData.message });
      }
      const qrBuffer = await QRCode.toBuffer(pakasirData.payment.payment_number);
      const qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
      transaction.qrImageUrl = qrBase64;
      transaction.pakasirPaymentNumber = pakasirData.payment.payment_number;
      transaction.pakasirExpiredAt = new Date(pakasirData.payment.expired_at);
      transaction.pakasirTotalPayment = pakasirData.payment.total_payment || amount;
      await transaction.save();
      responseData.qrImageUrl = qrBase64;
      responseData.expiredAt = pakasirData.payment.expired_at;
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}