import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({  
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  bets: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    betType: { type: String, enum: ['home', 'draw', 'away'] },
  }],
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['active','cancelled','inplay', 'completed'], default: 'active' },
  winnerTeam: { type: String, enum: ['home', 'draw', 'away', null], default: null },
  scoreHome: { type: String, default: null },
  scoreAway: { type: String, default: null },
  matchDate: { type: Date, required: true },
}, {timestamps: true});
 

const Match = mongoose.model('Match', matchSchema);

export default Match;
