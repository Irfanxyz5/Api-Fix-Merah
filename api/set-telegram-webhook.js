import { Telegraf } from 'telegraf';

export default async function handler(req, res) {
  try {
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    const webhookUrl = `${process.env.BASE_URL}/api/telegram-webhook`;
    await bot.telegram.setWebhook(webhookUrl);
    res.status(200).json({ message: `Webhook set to ${webhookUrl}` });
  } catch (error) {
    console.error('set-webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}