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
  await ctx.reply('Pilih durasi API key yang ingin dibeli:', keyboard);
});

bot.action(/buy_(.+)/, async (ctx) => {
  const duration = ctx.match[1];
  const chatId = ctx.chat.id;

  if (duration === 'permanent') {
    await connectDB();
    await PendingCustomKey.findOneAndUpdate(
      { chatId },
      { duration, createdAt: new Date() },
      { upsert: true }
    );
    await ctx.reply('🔑 Anda memilih paket PERMANEN dengan kustom API Key.\n\nSilakan kirimkan custom API Key Anda.\nAturan:\n- Huruf, angka, underscore (_), strip (-)\n- Panjang 8-64 karakter\n- Harus unik\n\nKetik /batal untuk membatalkan.');
    await ctx.answerCbQuery();
    return;
  }

  // Non-permanent langsung proses
  await processPurchase(ctx, duration, chatId);
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();
  if (text === '/batal') {
    await PendingCustomKey.deleteOne({ chatId });
    await ctx.reply('❌ Pembelian dibatalkan.');
    return;
  }

  await connectDB();
  const pending = await PendingCustomKey.findOne({ chatId });
  if (!pending) return; // tidak dalam state menunggu

  await PendingCustomKey.deleteOne({ chatId });
  const duration = pending.duration; // pasti 'permanent'
  await processPurchase(ctx, duration, chatId, text);
});

async function processPurchase(ctx, duration, chatId, customKey = null) {
  await ctx.reply('⏳ Membuat QR Code pembayaran...');
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
        caption: `💳 *Instruksi Pembayaran*\n\n💰 Total: Rp${data.amount.toLocaleString('id-ID')}\n📱 Scan QR Code di atas menggunakan e-wallet atau mobile banking.\n\n✅ Pembayaran akan otomatis terdeteksi. API Key akan dikirim setelah sukses.\n\n⏱️ QR Code berlaku 1 jam.`,
        parse_mode: 'Markdown'
      });
    } else {
      let errorMsg = data.error || 'Gagal membuat transaksi. Coba lagi.';
      if (data.error === 'Custom API Key sudah digunakan') {
        errorMsg = '⚠️ Custom API Key sudah digunakan. Silakan pilih key lain dengan /buy permanen.';
      }
      await ctx.reply(`❌ ${errorMsg}`);
    }
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi nanti.');
  }
}

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method Not Allowed');
  }
};