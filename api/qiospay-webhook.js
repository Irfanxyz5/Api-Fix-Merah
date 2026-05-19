import { Telegraf } from 'telegraf';
import connectDB from '../utils/connectDB.js';
import { Transaction } from '../models/Transaction.js';
import { ApiKey } from '../models/ApiKey.js';
import { generateApiKey } from '../utils/generateApiKey.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const SECRET_KEY = process.env.QIOSPAY_WEBHOOK_SECRET;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verifikasi secret key (dari URL parameter /:secret_key)
    const { secret_key } = req.query;
    if (secret_key !== SECRET_KEY) {
      return res.status(403).json({ status: 'reject', message: 'Invalid secret key' });
    }

    await connectDB();
    const rawBody = req.body;
    // Dokumentasi Qiospay: callback mengirim { data: { name, nmid, amount, type, fee, refid, issuer, balance, time } }
    const data = rawBody.data;
    if (!data || !data.refid || !data.amount) {
      console.error('Invalid Qiospay callback data:', rawBody);
      return res.status(400).json({ status: 'error', message: 'Invalid payload' });
    }

    const { refid, amount, nmid, type, time, name, issuer, fee, balance } = data;
    // Hanya terima transaksi tipe CR (kredit)
    if (type !== 'CR') {
      return res.status(200).json({ status: 'accept', message: 'Not credit transaction' });
    }

    // Cari transaksi pending dengan amount yang sama, dan belum terlalu lama (misal 1 jam)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const transaction = await Transaction.findOne({
      paymentGateway: 'qiospay',
      status: 'pending',
      amount: parseInt(amount),
      createdAt: { $gt: oneHourAgo }
    }).sort({ createdAt: 1 }); // ambil yang paling lama

    if (!transaction) {
      console.log(`No pending transaction found for amount ${amount} with refid ${refid}`);
      return res.status(200).json({ status: 'accept', message: 'No matching transaction' });
    }

    // Update transaksi
    transaction.status = 'paid';
    transaction.paidAt = new Date();
    transaction.qiospayRefId = refid;
    transaction.qiospayNmid = nmid;
    await transaction.save();

    // Generate API Key
    let apiKey;
    if (transaction.duration === 'permanent' && transaction.customApiKey) {
      const existing = await ApiKey.findOne({ key: transaction.customApiKey });
      if (existing) {
        apiKey = generateApiKey();
        await bot.telegram.sendMessage(transaction.chatId,
          `⚠️ Custom key sudah terpakai, kami buat random:\n\`${apiKey}\``,
          { parse_mode: 'Markdown' }
        );
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
      { parse_mode: 'Markdown' }
    );

    res.status(200).json({
      status: 'accept',
      message: 'Payment processed',
      data: { name, nmid, amount, type, fee, refid, issuer, balance, time }
    });
  } catch (error) {
    console.error('Qiospay webhook error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}