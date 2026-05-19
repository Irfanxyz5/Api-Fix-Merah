# Email API Dual Gateway (Qiospay & Pakasir)

API pengirim email menggunakan Node.js (Vercel Serverless Functions) dengan integrasi sistem pembayaran QRIS (Qiospay & Pakasir) dan Bot Telegram untuk manajemen API Key.

## 🚀 Fitur Utama
- **Send Email:** Kirim email via SMTP Gmail dengan mudah.
- **Dual Payment Gateway:** Integrasi QRIS melalui Qiospay dan Pakasir.
- **Telegram Bot:** Beli API Key, cek status, dan kelola transaksi langsung dari Telegram.
- **Admin Dashboard (API):** Kelola, tambah, dan hapus API Key secara manual.
- **Auto Cleanup:** Sistem otomatis untuk menonaktifkan API Key yang sudah kedaluwarsa.
- **Pretty Print Response:** Semua respon JSON diformat rapi agar mudah dibaca.

---

## 🛠️ Cara Install & Setup

### 1. Persyaratan Sistem
- [Node.js](https://nodejs.org/) (Versi 18 ke atas)
- [MongoDB](https://www.mongodb.com/) (Local atau Atlas)
- Akun [Vercel](https://vercel.com/) (Untuk deployment)
- Bot Token dari [@BotFather](https://t.me/botfather)

### 2. Clone Repository
```bash
git clone https://github.com/Irfanxyz5/Api-Fix-Merah.git
cd Api-Fix-Merah
```

### 3. Install Dependensi
```bash
npm install
```

### 4. Konfigurasi Environment Variables (`.env`)
Buat file `.env` di root direktori atau tambahkan di Vercel Dashboard:
```env
MONGODB_URI=mongodb+srv://...
ADMIN_API_KEY=rahasia_admin_anda
ADMIN_CHAT_ID=ID_Telegram_Anda
TELEGRAM_BOT_TOKEN=token_bot_anda
BASE_URL=https://domain-anda.vercel.app
CRON_SECRET=rahasia_cron_anda
```

### 5. Deployment ke Vercel
```bash
vercel --prod
```

---

## 📖 Dokumentasi Endpoint API

### 1. Mengirim Email
`POST /api/send-email`

**Request Body:**
```json
{
  "apiKey": "YOUR_API_KEY",
  "to": "penerima@gmail.com",
  "subject": "Halo!",
  "text": "Isi pesan teks",
  "html": "<b>Isi pesan HTML</b>",
  "gmailUser": "emailanda@gmail.com",
  "gmailAppPassword": "abcd efgh ijkl mnop"
}
```

**Respon Success (200 OK):**
```json
{
  "success": true,
  "messageId": "<unique-id@gmail.com>"
}
```

**Respon Error (401 Unauthorized):**
```json
{
  "error": "Invalid or expired API Key"
}
```

---

### 2. Verifikasi API Key
`POST /api/verify-apikey`

**Request Body:**
```json
{
  "apiKey": "YOUR_API_KEY"
}
```

**Respon Success (200 OK):**
```json
{
  "valid": true,
  "role": "user",
  "email": "user@example.com",
  "duration": "1month"
}
```

---

### 3. Membuat Transaksi (QRIS)
`POST /api/create-transaction`

**Request Body:**
```json
{
  "gateway": "qiospay",
  "duration": "1h",
  "chatId": "12345678"
}
```

**Respon Success (200 OK):**
```json
{
  "success": true,
  "orderId": "ORD-12345",
  "amount": 5000,
  "qrImageUrl": "data:image/png;base64,..."
}
```

---

## 🤖 Penggunaan Bot Telegram
1. Cari bot Anda di Telegram dan ketik `/start`.
2. Gunakan `/buy` untuk memilih paket API Key.
3. Pilih metode pembayaran (Qiospay/Pakasir).
4. Scan QR Code yang dikirimkan bot.
5. Setelah pembayaran sukses, bot akan mengirimkan API Key Anda secara otomatis.

---

## 🛡️ Keamanan (Penting!)
- **Gmail App Password:** Jangan gunakan password utama Gmail Anda. Buat "App Password" di [Google Security](https://myaccount.google.com/apppasswords).
- **Admin Key:** Pastikan `ADMIN_API_KEY` sulit ditebak untuk mencegah akses ilegal ke manajemen kunci.

---

## 👨‍💻 Author
**Ipanzxdev** - [GitHub](https://github.com/Irfanxyz5)
