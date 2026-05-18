import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  chatId: { type: String, required: true },
  amount: { type: Number, required: true },
  duration: { type: String, required: true },
  customApiKey: { type: String },
  status: { type: String, enum: ['pending', 'paid', 'expired'], default: 'pending' },
  qrImageUrl: { type: String },
  qiosTransactionId: { type: String },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date }
});

export const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);