import express from 'express';  
import User from '../models/User.js';
import Match from '../models/Match.js';
import Transaction from '../models/Transaction.js';

const router = express.Router(); 

router.post('/place-bet', async (req, res) => {
  const { matchId, userId, betType } = req.body;

  if (!matchId || !userId || !betType ) {
    return res.status(400).json({ error: 'Required fields: matchId, userId, betType' });
  }

  try {
    const match = await Match.findById(matchId);
    
    // Check if match exists
    if (!match) {
      return res.status(404).json({ error: 'Match not found.' });
    }

    // Prevent betting if match is not active
    if (match.status !== 'active') {
      return res.status(400).json({ error: 'Betting is closed for this match' });
    }

    // Check if the user has already placed a bet on this match
    const existingUserBet = match.bets.find(b => b.userId.toString() === userId);
    if (existingUserBet) {
      return res.status(400).json({ error: 'You have already placed a bet on this match.' });
    }

    // Find the user and deduct the amount
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (user.balance < match.amount) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }
    
    user.balance -= match.amount;
    await user.save();

    // Create a transaction record
    const transaction = new Transaction({
      userId,
      matchId: match._id,
      amount: match.amount,
      type: 'debit',
      status: 'completed'
    });
    await transaction.save();

    // Add the user's bet with transaction reference
    match.bets.push({
      userId,
      betType,
      amount: match.amount,
      transactionId: transaction._id
    }); 

    await match.save();

    return res.status(201).json({ message: 'Bet placed successfully.', match });
  } catch (error) {
    console.error('Error placing bet:', error);
    return res.status(500).json({ error: 'An error occurred while placing the bet.' });
  }
});

// New route for canceling a bet
router.post('/cancel-bet', async (req, res) => {
  const { matchId, userId } = req.body;

  if (!matchId || !userId) {
    return res.status(400).json({ error: 'Required fields: matchId, userId' });
  }

  try {
    // Start a session for transaction atomicity
    const session = await Match.startSession();
    session.startTransaction();

    try {
      // Find the match and the user's bet
      const match = await Match.findById(matchId);
      if (!match) {
        throw new Error('Match not found.');
      }

      if (match.status === 'inplay') {
        throw new Error('Match is inplay and cannot be cancelled.');
      }

      // Find the user's bet
      const betIndex = match.bets.findIndex(b => b.userId.toString() === userId);
      if (betIndex === -1) {
        throw new Error('Bet not found.');
      }

      const bet = match.bets[betIndex];
      const amount = match.amount;
      // Find the user and restore their balance
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found.');
      }

      // Restore user's balance
      user.balance += amount;
      await user.save({ session });

      // Create refund transaction
      const refundTransaction = new Transaction({
        userId,
        matchId: match._id,
        amount,
        type: 'credit',
        status: 'completed'
      });
      await refundTransaction.save({ session });

      // Remove the bet from the match
      match.bets.splice(betIndex, 1);
      await match.save({ session });

      await session.commitTransaction();
      
      return res.status(200).json({ 
        message: 'Bet cancelled successfully.',
        updatedMatch: match,
        updatedBalance: user.balance
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error cancelling bet:', error);
    return res.status(500).json({ 
      error: 'An error occurred while cancelling the bet.',
      details: error.message 
    });
  }
});

router.delete('/delete/:matchId', async (req, res) => {
  const { matchId } = req.params;

  try {
    const match = await Match.findById(matchId);

    if (!match) {
      return res.status(404).json({ error: 'Match not found.' });
    }

    // Check if there are any active bets
    if (match.bets.length > 0) {
      return res.status(400).json({ error: 'Cannot delete match with existing bets.' });
    }

    await Match.findByIdAndDelete(matchId);
    return res.status(200).json({ message: 'Match deleted successfully.' });
  } catch (error) {
    console.error('Error deleting match:', error);
    return res.status(500).json({ error: 'An error occurred while deleting the match.' });
  }
});

export default router;