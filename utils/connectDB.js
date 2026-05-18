import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('❌ Missing MONGODB_URI environment variable');
}

// Cache koneksi untuk reuse di serverless functions
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 5000,   // Timeout pilih server (5 detik)
      socketTimeoutMS: 45000,           // Timeout socket (45 detik)
      family: 4,                        // Paksa IPv4, hindari masalah IPv6
      maxPoolSize: 10,                  // Batas pool koneksi (cocok untuk serverless)
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;