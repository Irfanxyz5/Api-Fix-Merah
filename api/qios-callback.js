import { Telegraf } from 'telegraf';
import connectDB from '../utils/connectDB.js';
import { Transaction } from '../models/Transaction.js';
import { ApiKey } from '../models/ApiKey.js';
import { generateApiKey } from '../utils/generateApiKey.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    await connectDB();

    const { order_id, status, transaction_id } = req.body;
    if (status !== 'success') return res.status(200).json({ message: 'Not success' });

    const transaction = await Transaction.findOne({ orderId: order_id });
    if (!transaction || transaction.status !== 'pending') return res.status(404).json({ error: 'Transaction not found' });

    transaction.status = 'paid';
    transaction.paidAt = new Date();
    transaction.qiosTransactionId = transaction_id;
    await transaction.save();

    let apiKey;
    if (transaction.duration === 'permanent' && transaction.customApiKey) {
      const existing = await ApiKey.findOne({ key: transaction.customApiKey });
      if (existing) {
        apiKey = generateApiKey();
        await bot.telegram.sendMessage(transaction.chatId,
          `⚠️ Custom key ${transaction.customApiKey} sudah terpakai, kami buatkan random key:\n\`${apiKey}\``,
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
      `🎉 *Pembayaran Berhasil!*\n\n🔑 *API Key Anda:*\n\`${apiKey}\`\n\nSimpan baik-baik.`,
      { parse_mode: 'Markdown' }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('qios-callback error:', error);
    if (error.name === 'MongooseServerSelectionError') {
      return res.status(503).json({ error: 'Database error, pembayaran akan diproses ulang nanti.' });
    }
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}