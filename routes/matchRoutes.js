import express from 'express'; 
import Match from '../models/Match.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  try {
    const matches = await Match.aggregate([
      { $match: { status: { $nin: ['completed', 'cancelled'] } } },
      {
        $addFields: {
          totalStake: {
            $sum: '$bets.amount'  // Calculate sum of all bet amounts
          }
        }
      },
      { $sort: { totalStake: -1 } },  // Sort by totalStake in descending order
      {
        $lookup: {
          from: 'users',
          localField: 'bets.userId',
          foreignField: '_id',
          as: 'betUsers'
        }
      }
    ]);

    // Reconstruct the bets array with user information
    const populatedMatches = matches.map(match => ({
      ...match,
      bets: match.bets.map(bet => ({
        ...bet,
        userId: match.betUsers.find(user => user._id.equals(bet.userId))
      }))
    }));

    res.json(populatedMatches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
