// api/telegram-webhook.js
import { Telegraf } from 'telegraf';
import { PendingCustomKey } from '../models/PendingCustomKey';
import connectDB from '../utils/connectDB';

const BASE_URL = process.env.BASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  // Validasi Token
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('FATAL: TELEGRAM_BOT_TOKEN environment variable is missing.');
    return res.status(500).json({ error: 'Server config error: Missing bot token.' });
  }

  try {
    // Inisialisasi Bot dengan timeout 9 detik
    const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9_000 });

    // --- Command Handlers ---
    bot.start((ctx) => ctx.reply('Selamat datang! Gunakan /buy untuk membeli API key.'));
    bot.help((ctx) => ctx.reply('/buy - Beli API key\n/batal - Batalkan input custom key'));

    bot.command('buy', async (ctx) => {
      try {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🕐 1 Jam (Rp5.000)', callback_data: 'buy_1h' }],
              [{ text: '🕖 7 Jam (Rp15.000)', callback_data: 'buy_7h' }],
              [{ text: '📅 1 Bulan (Rp50.000)', callback_data: 'buy_1month' }],
              [{ text: '♾️ Permanen (Rp150.000)', callback_data: 'buy_permanent' }]
            ]
          }
        };
        await ctx.reply('Pilih durasi:', keyboard);
      } catch (err) {
        console.error('Error in /buy command:', err);
        await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
      }
    });

    bot.action(/buy_(.+)/, async (ctx) => {
      const duration = ctx.match[1];
      const chatId = ctx.chat.id;
      try {
        if (duration === 'permanent') {
          await connectDB();
          await PendingCustomKey.findOneAndUpdate({ chatId }, { duration }, { upsert: true });
          await ctx.reply('🔑 Kirimkan custom API Key (8-64 karakter, huruf/angka/_-). Ketik /batal untuk batal.');
          await ctx.answerCbQuery();
          return;
        }
        await processPurchase(ctx, duration, chatId);
      } catch (err) {
        console.error('Error in callback query:', err);
        await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
        await ctx.answerCbQuery();
      }
    });

    bot.on('text', async (ctx) => {
      const chatId = ctx.chat.id;
      const text = ctx.message.text.trim();
      if (text === '/batal') {
        try {
          await PendingCustomKey.deleteOne({ chatId });
          await ctx.reply('❌ Dibatalkan.');
        } catch (err) {
          console.error('Error in /batal:', err);
          await ctx.reply('Terjadi kesalahan saat membatalkan.');
        }
        return;
      }
      try {
        await connectDB();
        const pending = await PendingCustomKey.findOne({ chatId });
        if (!pending) return;
        await PendingCustomKey.deleteOne({ chatId });
        await processPurchase(ctx, pending.duration, chatId, text);
      } catch (err) {
        console.error('Error in text handler:', err);
        await ctx.reply('Terjadi kesalahan. Silakan coba lagi.');
      }
    });

    // Fungsi pembantu untuk proses pembelian
    async function processPurchase(ctx, duration, chatId, customKey = null) {
      await ctx.reply('⏳ Membuat QR Code...');
      const payload = { duration, chatId };
      if (customKey) payload.customApiKey = customKey;
      try {
        const response = await fetch(`${BASE_URL}/api/create-qris-transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
          await ctx.replyWithPhoto(data.qrImageUrl, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nScan QR untuk bayar.`
          });
        } else {
          await ctx.reply(`❌ ${data.error || 'Gagal membuat transaksi'}`);
        }
      } catch (err) {
        console.error('Error in processPurchase:', err);
        await ctx.reply('Terjadi kesalahan saat menghubungi server pembayaran. Silakan coba lagi.');
      }
    }

    // Proses update dari Telegram
    await bot.handleUpdate(req.body);
    return res.status(200).send('OK');

  } catch (error) {
    // Tangkap semua error yang tidak terduga
    console.error('Unhandled error in webhook handler:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}