import { Telegraf } from 'telegraf';

export default async function handler(req, res) {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  const webhookUrl = `${process.env.BASE_URL}/api/telegram-webhook`;
  try {
    await bot.telegram.setWebhook(webhookUrl);
    res.status(200).json({ message: `Webhook set to ${webhookUrl}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}