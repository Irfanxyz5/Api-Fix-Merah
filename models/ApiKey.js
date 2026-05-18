import mongoose from 'mongoose';

const apiKeySchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  email: { type: String, required: true },
  duration: { type: String, enum: ['1h', '7h', '1month', 'permanent'], required: true },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

apiKeySchema.index({ key: 1 });
apiKeySchema.index({ expiresAt: 1 });

export const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);