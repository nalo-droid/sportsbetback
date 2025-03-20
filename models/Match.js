import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({  
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  bets: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    betType: { type: String, enum: ['home', 'draw', 'away'] },
  }],
  amount: { type: Number, required: function() { return !this.isTemplate; }, min: 1 },
  status: { type: String, enum: ['active','cancelled','inplay', 'completed'], default: 'active' },
  winnerTeam: { type: String, enum: ['home', 'draw', 'away', null], default: null },
  scoreHome: { type: String, default: null },
  scoreAway: { type: String, default: null },
  matchDate: { type: Date, required: true },
  isTemplate: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  originalTemplate: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Match',
    default: null
  },
  totalPool: { type: Number, default: 0 },
  houseCommission: { type: Number, default: 0 },
  winningPool: { type: Number, default: 0 }
}, {timestamps: true});
 

const Match = mongoose.model('Match', matchSchema);

export default Match;
