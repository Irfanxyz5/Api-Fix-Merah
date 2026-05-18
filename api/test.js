// api/test.js
export default function handler(req, res) {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Serverless function works!',
    env: {
      hasMongoURI: !!process.env.MONGODB_URI,
      hasAdminKey: !!process.env.ADMIN_API_KEY,
      hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN
    }
  });
}