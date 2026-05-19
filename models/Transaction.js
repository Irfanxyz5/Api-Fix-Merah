import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  chatId: { type: String, required: true },
  amount: { type: Number, required: true },
  duration: { type: String, required: true },
  customApiKey: { type: String },
  status: { type: String, enum: ['pending', 'paid', 'expired'], default: 'pending' },
  qrImageUrl: { type: String },
  paymentGateway: { type: String, enum: ['qiospay', 'pakasir'], required: true },

  // Qiospay fields
  qiospayRefId: { type: String },      // refid dari callback
  qiospayNmid: { type: String },       // nmid dari callback

  // Pakasir fields
  pakasirPaymentNumber: { type: String },
  pakasirExpiredAt: { type: Date },
  pakasirTotalPayment: { type: Number },

  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date }
});

export const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);