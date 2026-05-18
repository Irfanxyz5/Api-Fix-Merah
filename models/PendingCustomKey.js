import mongoose from 'mongoose';

const pendingCustomKeySchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  duration: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 } // auto delete after 5 minutes
});

export const PendingCustomKey = mongoose.models.PendingCustomKey || mongoose.model('PendingCustomKey', pendingCustomKeySchema);