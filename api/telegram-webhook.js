import { Telegraf } from 'telegraf';
import { PendingCustomKey } from '../models/PendingCustomKey.js';
import { Transaction } from '../models/Transaction.js';
import connectDB from '../utils/connectDB.js';

const BASE_URL = process.env.BASE_URL;
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_ID || '').split(',').map(id => id.trim());

function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(String(chatId));
}

export default async function handler(req, res) {
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(data, null, 2));
  };
  if (req.method !== 'POST') {
  res.setHeader('Allow', 'POST');
  return res.status(405).json({
    status: 'error',
    error: 'Method Not Allowed',
    message: 'Webhook Telegram hanya menerima POST request.',
    usage: 'Endpoint ini digunakan oleh Telegram untuk mengirim update. Jangan dipanggil manual. Untuk menguji bot, gunakan perintah di aplikasi Telegram.',
    author: 'Ipanzxdev'
  });
}

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('FATAL: TELEGRAM_BOT_TOKEN missing');
    return res.status(500).json({ error: 'Missing bot token' });
  }

  try {
    const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 9_000 });

    bot.start((ctx) => ctx.reply('Selamat datang! Gunakan /buy untuk membeli API key.\n\nGunakan /cancel untuk membatalkan transaksi yang sedang berlangsung.'));
    bot.help((ctx) => ctx.reply(
      '/buy - Beli API key\n' +
      '/cancel - Batalkan transaksi pending terakhir\n' +
      '/batal - Batalkan input custom key\n\n' +
      'Admin commands:\n/addkey <key> <email> <duration>\n/delkey <key>\n/listkey'
    ));

    // ========== CANCEL TRANSACTION ==========
    bot.command(['cancel', 'batalkan'], async (ctx) => {
      const chatId = ctx.chat.id;
      await connectDB();
      const pendingTransaction = await Transaction.findOne({ chatId, status: 'pending' }).sort({ createdAt: -1 });
      if (!pendingTransaction) {
        return ctx.reply('❌ Tidak ada transaksi pending yang ditemukan.');
      }
      // Hapus transaksi dari database
      await Transaction.deleteOne({ _id: pendingTransaction._id });
      await ctx.reply(`✅ Transaksi dengan ID ${pendingTransaction.orderId} telah dibatalkan.`);
    });

    // ========== ADMIN COMMANDS ==========
    bot.command('addkey', async (ctx) => {
      if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Anda bukan admin.');
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 3) return ctx.reply('Format: /addkey <key> <email> <duration> (1h,7h,1month,permanent)');
      const [key, email, duration] = args;
      try {
        const response = await fetch(`${BASE_URL}/api/admin?action=create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY },
          body: JSON.stringify({ key, email, duration })
        });
        const data = await response.json();
        if (response.ok) ctx.reply(`✅ API Key ${key} berhasil ditambahkan.`);
        else ctx.reply(`❌ Gagal: ${data.error}`);
      } catch (err) {
        ctx.reply('❌ Error menghubungi server.');
      }
    });

    bot.command('delkey', async (ctx) => {
      if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Anda bukan admin.');
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 1) return ctx.reply('Format: /delkey <key>');
      const key = args[0];
      try {
        const response = await fetch(`${BASE_URL}/api/admin?action=delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY },
          body: JSON.stringify({ key })
        });
        const data = await response.json();
        if (response.ok) ctx.reply(`✅ API Key ${key} dihapus.`);
        else ctx.reply(`❌ Gagal: ${data.error}`);
      } catch (err) {
        ctx.reply('❌ Error menghubungi server.');
      }
    });

    bot.command('listkey', async (ctx) => {
      if (!isAdmin(ctx.chat.id)) return ctx.reply('❌ Anda bukan admin.');
      try {
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
      } catch (err) {
        ctx.reply('❌ Error menghubungi server.');
      }
    });

    // ========== PEMBELIAN ==========
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
            [{ text: '💳 Bayar dengan QRIS (Qiospay)', callback_data: `gateway_qiospay_${duration}` }],
            [{ text: '📱 Bayar dengan QRIS (Pakasir)', callback_data: `gateway_pakasir_${duration}` }]
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
      await ctx.reply(`⏳ Menyiapkan pembayaran via ${gateway === 'qiospay' ? 'Qiospay' : 'Pakasir'}...`);
      const payload = { gateway, duration, chatId };
      if (customApiKey) payload.customApiKey = customApiKey;
      try {
        const response = await fetch(`${BASE_URL}/api/create-transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
          const base64Data = data.qrImageUrl.split(',')[1];
          const caption = gateway === 'qiospay'
            ? `💳 *Total: Rp${data.amount.toLocaleString('id-ID')}*\n\nScan QR Code di atas dan lakukan pembayaran sesuai nominal.\n\nSetelah bayar, sistem akan otomatis memverifikasi.\nOrder ID: \`${data.orderId}\``
            : `💳 *Total: Rp${data.amount.toLocaleString('id-ID')}*\n\nQR Code berlaku hingga ${new Date(data.expiredAt).toLocaleString()}\nOrder ID: \`${data.orderId}\``;
          
          // Tambahkan inline keyboard tombol batal
          const cancelKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Batal', callback_data: `cancel_${data.orderId}` }]
              ]
            }
          };
          await ctx.replyWithPhoto(
            { source: Buffer.from(base64Data, 'base64') },
            { caption, parse_mode: 'Markdown', ...cancelKeyboard }
          );
        } else {
          await ctx.reply(`❌ Gagal membuat transaksi: ${data.error || 'Coba lagi nanti'}`);
        }
      } catch (err) {
        console.error('processPayment error:', err);
        await ctx.reply('❌ Terjadi kesalahan saat menghubungi server pembayaran. Silakan coba lagi.');
      }
      await ctx.answerCbQuery();
    }

    // ========== HANDLER CANCEL BUTTON ==========
    bot.action(/cancel_(.+)/, async (ctx) => {
      const orderId = ctx.match[1];
      const chatId = ctx.chat.id;
      await connectDB();
      const transaction = await Transaction.findOne({ orderId, chatId, status: 'pending' });
      if (!transaction) {
        await ctx.reply('❌ Transaksi tidak ditemukan atau sudah diproses.');
        await ctx.answerCbQuery();
        return;
      }
      await Transaction.deleteOne({ _id: transaction._id });
      await ctx.reply(`✅ Transaksi dengan ID ${orderId} telah dibatalkan.`);
      await ctx.answerCbQuery();
    });

    await bot.handleUpdate(req.body);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Unhandled webhook error:', error);
    return res.status(500).send('Internal Server Error');
  }
}