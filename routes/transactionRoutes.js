import express from 'express';  
import Transaction from '../models/Transaction.js';

const router = express.Router();


router.get('/recent', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 }).populate('userId', 'username').populate('betId', 'matchId');
    return res.status(200).json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ error: 'An error occurred while fetching transactions.' });
  }
});
 
// get /user/:userId
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const transactions = await Transaction.find({ userId }).populate('matchId', 'homeTeam awayTeam');
  return res.status(200).json(transactions);
}); 


export default router;