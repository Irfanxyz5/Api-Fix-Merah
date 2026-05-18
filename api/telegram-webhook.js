import { Telegraf } from 'telegraf';
import { PendingCustomKey } from '../models/PendingCustomKey';
import connectDB from '../utils/connectDB';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const BASE_URL = process.env.BASE_URL;

bot.start(ctx => ctx.reply('Selamat datang! Gunakan /buy untuk membeli API key.'));
bot.help(ctx => ctx.reply('/buy - Beli API key\n/batal - Batalkan input custom key'));

bot.command('buy', async (ctx) => {
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
});

bot.action(/buy_(.+)/, async (ctx) => {
  const duration = ctx.match[1];
  const chatId = ctx.chat.id;
  if (duration === 'permanent') {
    await connectDB();
    await PendingCustomKey.findOneAndUpdate({ chatId }, { duration }, { upsert: true });
    await ctx.reply('🔑 Kirimkan custom API Key (8-64 karakter, huruf/angka/_-). Ketik /batal untuk batal.');
    await ctx.answerCbQuery();
    return;
  }
  await processPurchase(ctx, duration, chatId);
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  if (text === '/batal') {
    await PendingCustomKey.deleteOne({ chatId });
    await ctx.reply('❌ Dibatalkan.');
    return;
  }
  await connectDB();
  const pending = await PendingCustomKey.findOne({ chatId });
  if (!pending) return;
  await PendingCustomKey.deleteOne({ chatId });
  await processPurchase(ctx, pending.duration, chatId, text);
});

async function processPurchase(ctx, duration, chatId, customKey = null) {
  await ctx.reply('⏳ Membuat QR Code...');
  const payload = { duration, chatId };
  if (customKey) payload.customApiKey = customKey;
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
}

export default async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } else {
      res.status(405).send('Method Not Allowed');
    }
  } catch (error) {
    console.error('webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};