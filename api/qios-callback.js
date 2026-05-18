import { Telegraf } from 'telegraf';
import connectDB from '../utils/connectDB';
import { Transaction } from '../models/Transaction';
import { ApiKey } from '../models/ApiKey';
import { generateApiKey } from '../utils/generateApiKey';
import { calculateExpiry } from '../utils/calculateExpiry';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await connectDB();

  const { order_id, status, transaction_id } = req.body;
  if (status !== 'success') return res.status(200).json({ message: 'Not success' });

  const transaction = await Transaction.findOne({ orderId: order_id });
  if (!transaction || transaction.status !== 'pending') return res.status(404).json({ error: 'Transaction not found or already processed' });

  // Update transaksi
  transaction.status = 'paid';
  transaction.paidAt = new Date();
  transaction.qiosTransactionId = transaction_id;
  await transaction.save();

  // Generate atau gunakan custom API Key
  let apiKey;
  if (transaction.duration === 'permanent' && transaction.customApiKey) {
    const existing = await ApiKey.findOne({ key: transaction.customApiKey });
    if (existing) {
      // Jika bentrok (sangat jarang), fallback random
      apiKey = generateApiKey();
      await bot.telegram.sendMessage(transaction.chatId,
        `⚠️ Custom key ${transaction.customApiKey} sudah terpakai, kami membuatkan random key.\n🔑 \`${apiKey}\``,
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

  // Kirim API Key ke user
  const durationText = transaction.duration === 'permanent' ? 'PERMANEN' : transaction.duration;
  await bot.telegram.sendMessage(transaction.chatId,
    `🎉 *Pembayaran Berhasil!*\n\n` +
    `Durasi: *${durationText}*\n` +
    `🔑 *API Key Anda:*\n\`${apiKey}\`\n\n` +
    `Simpan baik-baik. Gunakan untuk mengirim email via API kami.`,
    { parse_mode: 'Markdown' }
  );

  res.status(200).json({ success: true });
}