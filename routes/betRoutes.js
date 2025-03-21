import express from 'express';  
import User from '../models/User.js';
import Match from '../models/Match.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';

const router = express.Router(); 

router.post('/place-bet', async (req, res) => {
  const { matchId, userId, betType } = req.body;

  if (!matchId || !userId || !betType) {
    return res.status(400).json({ error: 'Required fields: matchId, userId, betType' });
  }

  try {
    const match = await Match.findById(matchId);
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found.' });
    }

    if (match.status !== 'active') {
      return res.status(400).json({ error: 'Betting is closed for this match' });
    }

    // Check if the bet type is already taken
    const existingBetOfType = match.bets.find(b => b.betType === betType);
    if (existingBetOfType) {
      return res.status(400).json({ error: 'This bet type is already taken.' });
    }

    // Check if user already placed a bet
    const existingUserBet = match.bets.find(b => b.userId.toString() === userId);
    if (existingUserBet) {
      return res.status(400).json({ error: 'You have already placed a bet on this match.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (user.balance < match.amount) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }
    
    // Start a session for transaction atomicity
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Deduct user balance
      user.balance -= match.amount;
      await user.save({ session });

      // Create transaction record
      const transaction = await Transaction.create([{
        userId,
        matchId: match._id,
        amount: match.amount,
        type: 'debit',
        status: 'completed',
        description: `Bet placed on ${betType} for ${match.homeTeam} vs ${match.awayTeam}`
      }], { session });

      // Add the bet
      match.bets.push({
        userId,
        betType,
        amount: match.amount,
        transactionId: transaction[0]._id
      });

      // If this is the second bet, update match status to inplay
      if (match.bets.length >= 2) {
        match.status = 'inplay';
        
        // Calculate potential winnings for each bet type
        const totalPool = match.bets.length * match.amount; // Total pool = 200 for two 100 ETB bets
        const houseCommission = totalPool * 0.1; // 10% house commission = 20 ETB
        const winningPool = totalPool - houseCommission; // Net pool = 180 ETB
        
        // Store these values in the match for later use
        match.totalPool = totalPool;
        match.houseCommission = houseCommission;
        match.winningPool = winningPool;
      }

      await match.save({ session });
      await session.commitTransaction();

      return res.status(201).json({ message: 'Bet placed successfully.', match });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
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

// Add this route to create a game from a template
router.post('/create-game', async (req, res) => {
  const { templateMatchId, userId, stakeAmount } = req.body;

  if (!templateMatchId || !userId || !stakeAmount) {
    return res.status(400).json({ error: 'Required fields: templateMatchId, userId, stakeAmount' });
  }

  try {
    // Find the template match
    const templateMatch = await Match.findById(templateMatchId);
    
    if (!templateMatch) {
      return res.status(404).json({ error: 'Template match not found.' });
    }

    if (!templateMatch.isTemplate) {
      return res.status(400).json({ error: 'Selected match is not a template.' });
    }

    // Create a new match based on the template
    const newMatch = new Match({
      homeTeam: templateMatch.homeTeam,
      awayTeam: templateMatch.awayTeam,
      homeTeamLogo: templateMatch.homeTeamLogo,
      awayTeamLogo: templateMatch.awayTeamLogo,
      amount: stakeAmount,
      matchDate: templateMatch.matchDate,
      status: 'active',
      isTemplate: false,
      createdBy: userId,
      originalTemplate: templateMatchId,
      bets: []
    });

    await newMatch.save();

    return res.status(201).json({ 
      message: 'Game created successfully.',
      match: newMatch 
    });
  } catch (error) {
    console.error('Error creating game:', error);
    return res.status(500).json({ 
      error: 'An error occurred while creating the game.',
      details: error.message 
    });
  }
});

export default router;