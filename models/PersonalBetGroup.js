import mongoose from 'mongoose';

const personalBetGroupSchema = new mongoose.Schema({
  betType: {
    type: String,
    required: true,
    enum: ['public', 'personal'],
  },
  code: { type: String, unique: true, required: true },
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match.bets' }],
}, { timestamps: true });

export default mongoose.model('PersonalBetGroup', personalBetGroupSchema);
