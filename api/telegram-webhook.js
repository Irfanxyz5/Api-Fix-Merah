import { Telegraf } from 'telegraf';
import { PendingCustomKey } from '../models/PendingCustomKey.js';
import connectDB from '../utils/connectDB.js';

const BASE_URL = process.env.BASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'Missing bot token' });

  try {
    const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9_000 });

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
        await ctx.reply('🔑 Kirimkan custom API Key (8-64 karakter, huruf/angka/_-). Ketik /batal.');
        await ctx.answerCbQuery();
        return;
      }
      // Tampilkan pilihan gateway
      const gatewayKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Bayar dengan QRIS (Qiospay)', callback_data: `gateway_qiospay_${duration}` }],
            [{ text: '📱 Bayar dengan QRIS (Pakasir)', callback_data: `gateway_pakasir_${duration}` }]
          ]
        }
      };
      await ctx.reply('Pilih metode pembayaran:', gatewayKeyboard);
      await ctx.answerCbQuery();
    });

    bot.action(/gateway_(qiospay|pakasir)_(.+)/, async (ctx) => {
      const gateway = ctx.match[1];
      const duration = ctx.match[2];
      const chatId = ctx.chat.id;
      await ctx.reply(`⏳ Menyiapkan ${gateway === 'qiospay' ? 'Qiospay' : 'Pakasir'}...`);
      const endpoint = gateway === 'qiospay' ? '/api/create-qiospay-transaction' : '/api/create-pakasir-transaction';
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, chatId })
      });
      const data = await response.json();
      if (data.success) {
        if (gateway === 'qiospay') {
          await ctx.replyWithPhoto({ url: data.qrImageUrl }, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nScan QR statis dan bayar sesuai nominal. Setelah bayar, kami akan verifikasi otomatis.\n\nOrder ID: ${data.orderId}`
          });
        } else {
          await ctx.replyWithPhoto({ source: Buffer.from(data.qrImageUrl.split(',')[1], 'base64') }, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nScan QR dinamis. Berlaku hingga ${new Date(data.expiredAt).toLocaleString()}`
          });
        }
      } else {
        await ctx.reply(`❌ Gagal: ${data.error}`);
      }
      await ctx.answerCbQuery();
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
      // Untuk permanen, tanya gateway juga
      const gatewayKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Bayar dengan QRIS (Qiospay)', callback_data: `gateway_qiospay_${pending.duration}_custom_${text}` }],
            [{ text: '📱 Bayar dengan QRIS (Pakasir)', callback_data: `gateway_pakasir_${pending.duration}_custom_${text}` }]
          ]
        }
      };
      await ctx.reply('Pilih metode pembayaran untuk paket permanen:', gatewayKeyboard);
    });

    // Handler untuk custom permanent + gateway
    bot.action(/gateway_(qiospay|pakasir)_(.+)_custom_(.+)/, async (ctx) => {
      const gateway = ctx.match[1];
      const duration = ctx.match[2];
      const customKey = ctx.match[3];
      const chatId = ctx.chat.id;
      await ctx.reply(`⏳ Menyiapkan ${gateway} untuk key permanen...`);
      const endpoint = gateway === 'qiospay' ? '/api/create-qiospay-transaction' : '/api/create-pakasir-transaction';
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, chatId, customApiKey: customKey })
      });
      const data = await response.json();
      if (data.success) {
        if (gateway === 'qiospay') {
          await ctx.replyWithPhoto({ url: data.qrImageUrl }, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nScan QR statis dan bayar. Setelah bayar, API Key custom akan aktif.`
          });
        } else {
          await ctx.replyWithPhoto({ source: Buffer.from(data.qrImageUrl.split(',')[1], 'base64') }, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nQR dinamis berlaku hingga ${new Date(data.expiredAt).toLocaleString()}`
          });
        }
      } else {
        await ctx.reply(`❌ Gagal: ${data.error}`);
      }
      await ctx.answerCbQuery();
    });

    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
}