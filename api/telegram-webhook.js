import { Telegraf } from 'telegraf';
import { PendingCustomKey } from '../models/PendingCustomKey.js';
import connectDB from '../utils/connectDB.js';

const BASE_URL = process.env.BASE_URL;
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_ID || '').split(',').map(id => id.trim());

function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(String(chatId));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'Missing bot token' });

  try {
    const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9_000 });

    bot.start(ctx => ctx.reply('Selamat datang! Gunakan /buy untuk membeli API key.'));
    bot.help(ctx => ctx.reply('/buy - Beli API key\n/batal - Batalkan input custom key\n\nAdmin commands:\n/addkey <key> <email> <duration>\n/delkey <key>\n/listkey'));

    // Command untuk admin
    bot.command('addkey', async (ctx) => {
      if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Anda bukan admin.');
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 3) return ctx.reply('Format: /addkey <key> <email> <duration> (1h,7h,1month,permanent)');
      const [key, email, duration] = args;
      const response = await fetch(`${BASE_URL}/api/admin?action=create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY },
        body: JSON.stringify({ key, email, duration })
      });
      const data = await response.json();
      if (response.ok) ctx.reply(`✅ API Key ${key} berhasil ditambahkan.`);
      else ctx.reply(`❌ Gagal: ${data.error}`);
    });

    bot.command('delkey', async (ctx) => {
      if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Anda bukan admin.');
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 1) return ctx.reply('Format: /delkey <key>');
      const key = args[0];
      const response = await fetch(`${BASE_URL}/api/admin?action=delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY },
        body: JSON.stringify({ key })
      });
      const data = await response.json();
      if (response.ok) ctx.reply(`✅ API Key ${key} dihapus.`);
      else ctx.reply(`❌ Gagal: ${data.error}`);
    });

    bot.command('listkey', async (ctx) => {
      if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Anda bukan admin.');
      const response = await fetch(`${BASE_URL}/api/admin?action=list`, {
        headers: { 'x-admin-key': process.env.ADMIN_API_KEY }
      });
      const data = await response.json();
      if (!data.success) return ctx.reply('Gagal mengambil data.');
      if (data.keys.length === 0) return ctx.reply('Tidak ada API Key.');
      let msg = '*Daftar API Key:*\n';
      for (const k of data.keys.slice(0, 20)) {
        msg += `\`${k.key}\` - ${k.duration} - ${k.isActive ? '✅ aktif' : '❌ nonaktif'}\n`;
      }
      if (data.keys.length > 20) msg += `\n... dan ${data.keys.length - 20} lainnya.`;
      ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    // Perintah /buy (sama seperti sebelumnya)
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
      await ctx.reply('Pilih durasi API key:', keyboard);
    });

    bot.action(/buy_(1h|7h|1month)/, async (ctx) => {
      const duration = ctx.match[1];
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Qiospay', callback_data: `gateway_qiospay_${duration}` }],
            [{ text: '📱 Pakasir', callback_data: `gateway_pakasir_${duration}` }]
          ]
        }
      };
      await ctx.reply('Pilih metode pembayaran:', keyboard);
      await ctx.answerCbQuery();
    });

    bot.action('buy_permanent', async (ctx) => {
      await connectDB();
      await PendingCustomKey.findOneAndUpdate({ chatId: ctx.chat.id }, { duration: 'permanent' }, { upsert: true });
      await ctx.reply('🔑 Kirimkan custom API Key (8-64 karakter, huruf/angka/_-). Ketik /batal untuk batal.');
      await ctx.answerCbQuery();
    });

    bot.action(/gateway_(qiospay|pakasir)_(1h|7h|1month)/, async (ctx) => {
      const gateway = ctx.match[1];
      const duration = ctx.match[2];
      await processPayment(ctx, gateway, duration, ctx.chat.id);
    });

    bot.action(/gateway_(qiospay|pakasir)_permanent_custom_(.+)/, async (ctx) => {
      const gateway = ctx.match[1];
      const customKey = ctx.match[2];
      await processPayment(ctx, gateway, 'permanent', ctx.chat.id, customKey);
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
      if (!pending || pending.duration !== 'permanent') return;
      await PendingCustomKey.deleteOne({ chatId });
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Qiospay', callback_data: `gateway_qiospay_permanent_custom_${text}` }],
            [{ text: '📱 Pakasir', callback_data: `gateway_pakasir_permanent_custom_${text}` }]
          ]
        }
      };
      await ctx.reply('Pilih metode pembayaran untuk paket permanen:', keyboard);
    });

    async function processPayment(ctx, gateway, duration, chatId, customApiKey = null) {
      await ctx.reply(`⏳ Menyiapkan pembayaran via ${gateway}...`);
      const payload = { gateway, duration, chatId };
      if (customApiKey) payload.customApiKey = customApiKey;
      const response = await fetch(`${BASE_URL}/api/create-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        if (gateway === 'qiospay') {
          await ctx.replyWithPhoto({ url: data.qrImageUrl }, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nScan QR statis dan bayar sesuai nominal.`
          });
        } else {
          const buffer = Buffer.from(data.qrImageUrl.split(',')[1], 'base64');
          await ctx.replyWithPhoto({ source: buffer }, {
            caption: `💳 Total: Rp${data.amount.toLocaleString('id-ID')}\nQR berlaku hingga ${new Date(data.expiredAt).toLocaleString()}`
          });
        }
      } else {
        await ctx.reply(`❌ Gagal: ${data.error}`);
      }
      await ctx.answerCbQuery();
    }

    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
}