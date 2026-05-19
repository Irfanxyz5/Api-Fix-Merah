import { Telegraf } from 'telegraf';
import connectDB from '../utils/connectDB.js';
import { Transaction } from '../models/Transaction.js';
import { ApiKey } from '../models/ApiKey.js';
import { generateApiKey } from '../utils/generateApiKey.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const QIOSPAY_SECRET = process.env.QIOSPAY_WEBHOOK_SECRET;

async function processPaidTransaction(transaction) {
  let apiKey;
  if (transaction.duration === 'permanent' && transaction.customApiKey) {
    const existing = await ApiKey.findOne({ key: transaction.customApiKey });
    if (existing) {
      apiKey = generateApiKey();
      await bot.telegram.sendMessage(transaction.chatId,
        `⚠️ Custom key ${transaction.customApiKey} sudah terpakai, kami buat random:\n\`${apiKey}\``,
        { parse_mode: 'Markdown' });
    } else {
      apiKey = transaction.customApiKey;
    }
  } else {
    apiKey = generateApiKey();
  }
  const expiresAt = calculateExpiry(transaction.duration);
  const newKey = new ApiKey({
    key: apiKey,
    email: `telegram_${transaction.chatId}@user.telegram`,
    duration: transaction.duration,
    expiresAt
  });
  await newKey.save();
  await bot.telegram.sendMessage(transaction.chatId,
    `🎉 *Pembayaran Berhasil!*\n\n🔑 *API Key Anda:*\n\`${apiKey}\`\n\nTerima kasih.`,
    { parse_mode: 'Markdown' });
}

export default async function handler(req, res) {
  try {
if (req.method !== 'POST') {
  return res.status(405).json({
    status: 'error',
    error: 'Method Not Allowed',
    message: 'Webhook hanya menerima POST request.',
    usage: 'Endpoint ini digunakan oleh Qiospay atau Pakasir untuk mengirim notifikasi pembayaran. Tidak untuk akses langsung.',
    author: 'Ipanzxdev'
  });
}
    await connectDB();

    // Qiospay callback (menggunakan secret key di query)
    if (req.query.secret_key === QIOSPAY_SECRET && req.body.data) {
      const { data } = req.body;
      if (data.type !== 'CR') {
        return res.status(200).json({ status: 'accept', message: 'Not credit' });
      }
      const amount = parseInt(data.amount);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const transaction = await Transaction.findOne({
        paymentGateway: 'qiospay',
        status: 'pending',
        amount: amount,
        createdAt: { $gt: oneHourAgo }
      }).sort({ createdAt: 1 });
      if (!transaction) {
        return res.status(200).json({ status: 'accept', message: 'No matching transaction' });
      }
      transaction.status = 'paid';
      transaction.paidAt = new Date();
      transaction.qiospayRefId = data.refid;
      transaction.qiospayNmid = data.nmid;
      await transaction.save();
      await processPaidTransaction(transaction);
      return res.status(200).json({ status: 'accept', message: 'Payment processed', data });
    }

    // Pakasir callback
    if (req.body.order_id && req.body.status === 'completed') {
      const transaction = await Transaction.findOne({ orderId: req.body.order_id, paymentGateway: 'pakasir', status: 'pending' });
      if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
      transaction.status = 'paid';
      transaction.paidAt = req.body.completed_at ? new Date(req.body.completed_at) : new Date();
      transaction.paymentMethod = req.body.payment_method;
      await transaction.save();
      await processPaidTransaction(transaction);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown webhook format' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}