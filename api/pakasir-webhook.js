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

    const { order_id, status, amount, payment_method, completed_at } = req.body;
    if (status !== 'completed') return res.status(200).json({ message: 'Not completed' });

    const transaction = await Transaction.findOne({ orderId: order_id, paymentGateway: 'pakasir', status: 'pending' });
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    transaction.status = 'paid';
    transaction.paidAt = completed_at ? new Date(completed_at) : new Date();
    transaction.paymentMethod = payment_method;
    await transaction.save();

    let apiKey;
    if (transaction.duration === 'permanent' && transaction.customApiKey) {
      const existing = await ApiKey.findOne({ key: transaction.customApiKey });
      if (existing) {
        apiKey = generateApiKey();
        await bot.telegram.sendMessage(transaction.chatId, `⚠️ Custom key sudah terpakai, random:\n\`${apiKey}\``, { parse_mode: 'Markdown' });
      } else {
        apiKey = transaction.customApiKey;
      }
    } else {
      apiKey = generateApiKey();
    }

    const expiresAt = calculateExpiry(transaction.duration);
    const newKey = new ApiKey({ key: apiKey, email: `telegram_${transaction.chatId}@user.telegram`, duration: transaction.duration, expiresAt });
    await newKey.save();

    await bot.telegram.sendMessage(transaction.chatId, `🎉 *Pembayaran Berhasil!*\n\n🔑 *API Key:*\n\`${apiKey}\``, { parse_mode: 'Markdown' });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Pakasir webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}