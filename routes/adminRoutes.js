import express from 'express';  
import Match from '../models/Match.js'; 
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import fetch from 'node-fetch';
import mongoose from 'mongoose';

const router = express.Router();


router.get('/match-bettors/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const match = await Match.findById(id)
      .populate({
        path: 'bets.userId',
        select: 'username balance' 
      });
    
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const bettors = match.bets.map(bet => ({
      user: bet.userId,
      betType: bet.betType
    }));

    res.json(bettors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


router.post('/create-match',  async (req, res) => {
    try {
      const { homeTeam, awayTeam, amount } = req.body;
  
      if (!homeTeam || !awayTeam || !amount) {
        return res.status(400).json({ message: 'Please provide both home and away teams' });
      }
  
      const bet = await Match.create({
        homeTeam,
        awayTeam, 
        amount,
        bets: []  
      });
  
      res.status(201).json(bet);
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });



router.post('/update-match-score', async (req, res) => {
  try {
    const { matchId, homeScore, awayScore } = req.body;
    console.log('Received matchId:', matchId);

    const match = await Match.findById(matchId).populate('bets.userId');
    if (!match) return res.status(404).json({ message: 'Match not found' });

    // Validate scores
    if (isNaN(homeScore) || isNaN(awayScore)) {
      return res.status(400).json({ message: 'Invalid score values' });
    }

    // Determine winner
    let winnerTeam;
    if (homeScore > awayScore) winnerTeam = 'home';
    else if (awayScore > homeScore) winnerTeam = 'away';
    else winnerTeam = 'draw';

    // Update match details
    match.status = 'completed';
    match.winnerTeam = winnerTeam;
    match.scoreHome = homeScore;
    match.scoreAway = awayScore;

    // Get winning players
    const winningPlayers = winnerTeam === 'draw' 
      ? match.bets 
      : match.bets.filter(bet => bet.betType === winnerTeam);

    console.log('Match updated:', {
      matchId,
      scores: `${homeScore}-${awayScore}`,
      winner: winnerTeam,
      totalBets: match.bets.length
    });

    const winningUserIds = winningPlayers.map(bet => bet.userId._id);
    console.log('Winning Player IDs:', winningUserIds);

    // Calculate winning amount for home/away bets
    let winningAmount = match.amount;
    if (winnerTeam !== 'draw') {
      const totalBettors = match.bets.length;
      const winningBettors = winningPlayers.length;
      winningAmount = (match.amount * totalBettors) / winningBettors;
    }

    // Fetch users and update their balances
    const users = await User.find({ _id: { $in: winningUserIds } });
    
    // Update each winning user's balance and create transactions
    for (const user of users) {
      // Update user balance
      user.balance += winningAmount;
      await user.save();
      
      // Find user's bet for this match
      const userBet = match.bets.find(bet => bet.userId._id.toString() === user._id.toString());
      
      // Create transaction record
      const transaction = new Transaction({
        userId: user._id,
        matchId: match._id,
        betId: userBet._id,
        amount: winningAmount,
        type: 'credit',
        status: 'completed'
      });
      await transaction.save();

      console.log(`Credited ${winningAmount} to ${user.username}. New balance: ${user.balance}`);
    }

    await match.save();
    res.json({ success: true, match });
  } catch (error) {
    console.error('Error updating match score:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


router.put('/update/inplay', async (req, res) => {
  try {
    const { matchId } = req.body;
    
    const updatedMatch = await Match.findByIdAndUpdate(
      matchId,
      { status: 'inplay' },
      { new: true }
    );

    if (!updatedMatch) {
      return res.status(404).json({ message: 'Match not found' });
    }

    res.json(updatedMatch);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/updateStatus', async (req, res) => {
    try {
      const { matchId, status } = req.body;
      
      // Add 'inplay' to allowed statuses
      const allowedStatuses = ['active', 'completed', 'cancelled', 'inplay'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      
      const updatedMatch = await Match.findByIdAndUpdate(
        matchId,
        { status },
        { new: true }
      );
  
      if (!updatedMatch) {
        return res.status(404).json({ message: 'Match not found' });
      }
  
      res.json(updatedMatch);
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

// Create matches from selected API data
router.post('/create-matches', async (req, res) => {
  try {
    const { matches } = req.body;
    
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({
        message: 'Invalid request: matches array is required'
      });
    }

    // Log the incoming data for debugging
    console.log('Received matches data:', matches);

    const newMatches = matches.map(match => {
      // Validate required fields
      if (!match.homeTeam || !match.awayTeam) {
        throw new Error('Home team and away team are required');
      }

      return {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeTeamLogo: match.homeTeamLogo || null,
        awayTeamLogo: match.awayTeamLogo || null,
        matchDate: new Date(match.matchDate),
        apiId: match.apiId || null,
        isTemplate: true,
        status: match.status || 'active',
        bets: []
      };
    });

    // Log the processed data
    console.log('Processed matches data:', newMatches);

    const created = await Match.create(newMatches);
    
    res.status(201).json({ 
      message: 'Matches created successfully',
      createdCount: created.length, 
      matches: created 
    });
  } catch (error) {
    console.error('Error creating matches:', error);
    res.status(400).json({
      message: 'Validation failed',
      error: error.message
    });
  }
});

// Delete a match
router.delete('/delete-match/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Start a session for transaction atomicity
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find the template match
      const templateMatch = await Match.findById(id);
      if (!templateMatch) {
        throw new Error('Template match not found.');
      }

      // Find all user games created from this template
      const userGames = await Match.find({ originalTemplate: id });

      // For each user game, refund the users and delete the game
      for (const game of userGames) {
        if (game.status === 'active') {
          // Refund all users who placed bets
          for (const bet of game.bets) {
            const user = await User.findById(bet.userId);
            if (user) {
              user.balance += game.amount;
              await user.save({ session });

              // Create refund transaction
              await Transaction.create([{
                userId: bet.userId,
                matchId: game._id,
                amount: game.amount,
                type: 'credit',
                status: 'completed',
                description: 'Refund due to match deletion'
              }], { session });
            }
          }
        }
      }

      // Delete all user games created from this template
      await Match.deleteMany({ originalTemplate: id }, { session });

      // Finally delete the template match
      await Match.findByIdAndDelete(id, { session });

      await session.commitTransaction();
      
      res.json({ 
        message: 'Match and all related games deleted successfully',
        gamesDeleted: userGames.length
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error('Error deleting match:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Perform an action on a match
router.post('/action-match/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Implement your action logic here
    // For example, you might want to update some match details or perform a specific operation

    const match = await Match.findById(id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Example action: toggle a custom flag
    match.customFlag = !match.customFlag;
    await match.save();

    res.json({ message: 'Action performed successfully', match });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Endpoint to get the football API key
router.get('/get-football-api-key', (req, res) => {
  res.json({ apiKey: process.env.FOOTBALLAPI });
});

// Proxy endpoint to fetch leagues
router.get('/fetch-leagues', async (req, res) => {
  try {
    const response = await fetch('https://api.football-data.org/v4/competitions', {
      headers: { 'X-Auth-Token': process.env.FOOTBALLAPI }
    });

    if (!response.ok) {
      throw new Error(`Error fetching leagues: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leagues', error: error.message });
  }
});

// Proxy endpoint to fetch matches for a specific league
router.get('/fetch-matches/:leagueId', async (req, res) => {
  const { leagueId } = req.params;
  try {
    const response = await fetch(`https://api.football-data.org/v4/competitions/${leagueId}/matches`, {
      headers: { 'X-Auth-Token': process.env.FOOTBALLAPI }
    });

    if (!response.ok) {
      throw new Error(`Error fetching matches: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter out past matches and ensure we have team crests
    const currentDate = new Date();
    const upcomingMatches = data.matches
      .filter(match => new Date(match.utcDate) > currentDate)
      .map(match => ({
        ...match,
        homeTeam: {
          ...match.homeTeam,
          // Use default logo if crest is not available
          crest: match.homeTeam.crest || 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Question_mark_%28black%29.svg/800px-Question_mark_%28black%29.svg.png'
        },
        awayTeam: {
          ...match.awayTeam,
          // Use default logo if crest is not available
          crest: match.awayTeam.crest || 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Question_mark_%28black%29.svg/800px-Question_mark_%28black%29.svg.png'
        }
      }));

    res.json({ matches: upcomingMatches });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching matches', error: error.message });
  }
});

// Add this new route to get template statistics
router.get('/template-stats/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;

    // Find all matches created from this template
    const userGames = await Match.find({
      originalTemplate: templateId,
      isTemplate: false
    }).populate('bets');

    const stats = {
      activeGames: userGames.filter(game => game.status === 'active' || game.status === 'inplay').length,
      totalUsers: new Set(userGames.flatMap(game => game.bets.map(bet => bet.userId.toString()))).size,
      totalStakes: userGames.reduce((sum, game) => {
        // Calculate total stakes by multiplying number of bets by game amount
        return sum + (game.bets.length * game.amount);
      }, 0)
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template statistics', error: error.message });
  }
});

// Update the declare-template-results route
router.post('/declare-template-results', async (req, res) => {
  // Start a session for transaction atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { templateId, homeScore, awayScore } = req.body;
    
    // Find all active games created from this template
    const activeGames = await Match.find({
      originalTemplate: templateId,
      status: 'inplay'
    }).populate('bets.userId');

    if (activeGames.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No active games found for this template' });
    }

    // Determine winner
    let winnerTeam;
    if (homeScore > awayScore) winnerTeam = 'home';
    else if (awayScore > homeScore) winnerTeam = 'away';
    else winnerTeam = 'draw';

    // Process each game
    for (const game of activeGames) {
      // Get winning bets
      const winningBets = winnerTeam === 'draw' 
        ? game.bets 
        : game.bets.filter(bet => bet.betType === winnerTeam);

      // Calculate winning amount from the pre-calculated pool
      const winningAmount = game.winningPool / winningBets.length;

      // Update winners' balances and create transactions
      for (const bet of winningBets) {
        const user = await User.findById(bet.userId);
        user.balance += winningAmount;
        await user.save({ session });

        // Create transaction record
        await Transaction.create([{
          userId: bet.userId,
          matchId: game._id,
          amount: winningAmount,
          type: 'credit',
          status: 'completed',
          description: `Won bet on ${game.homeTeam} vs ${game.awayTeam} (${winnerTeam})`
        }], { session });
      }

      // Update match status and scores
      game.status = 'completed';
      game.winnerTeam = winnerTeam;
      game.scoreHome = homeScore;
      game.scoreAway = awayScore;
      await game.save({ session });
    }

    // Update template status
    const template = await Match.findById(templateId);
    template.status = 'completed';
    template.scoreHome = homeScore;
    template.scoreAway = awayScore;
    template.winnerTeam = winnerTeam;
    await template.save({ session });

    await session.commitTransaction();

    res.json({ 
      message: 'Results declared and winnings distributed successfully',
      gamesProcessed: activeGames.length
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error declaring results:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
});

// Temporary route for testing - Remove when implementing real payments
router.post('/add-balance', async (req, res) => {
  // Start a session for transaction atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ 
        message: 'Please provide both userId and a positive amount' 
      });
    }

    // Find user within the session
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'User not found' });
    }

    try {
      // Add the amount to user's balance
      user.balance += Number(amount);
      await user.save({ session });

      // Create a transaction record within the session
      const transaction = await Transaction.create([{
        userId: user._id,
        matchId: null, // This is causing the validation error, need to make it optional
        amount: amount,
        type: 'credit',
        status: 'completed',
        description: 'Admin balance top-up (Testing)'
      }], { session });

      // Commit the transaction
      await session.commitTransaction();

      res.json({ 
        message: 'Balance added successfully',
        newBalance: user.balance,
        user: user.username
      });
    } catch (error) {
      // If any error occurs, abort the transaction
      await session.abortTransaction();
      throw error;
    }
  } catch (error) {
    // If any error occurs, abort the transaction
    await session.abortTransaction();
    console.error('Error adding balance:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  } finally {
    // End the session
    session.endSession();
  }
});

// Add this route to get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username balance');
    res.json(users);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching users', 
      error: error.message 
    });
  }
});

// Add this new route to get house profits
router.get('/house-profits', async (req, res) => {
  try {
    const completedMatches = await Match.find({
      status: 'completed',
      isTemplate: false
    });

    const profits = {
      totalCommission: 0,
      totalMatches: completedMatches.length,
      matchDetails: []
    };

    // Calculate total commission and gather match details
    for (const match of completedMatches) {
      const commission = match.houseCommission || 0;
      profits.totalCommission += commission;
      
      if (commission > 0) {
        profits.matchDetails.push({
          matchId: match._id,
          teams: `${match.homeTeam} vs ${match.awayTeam}`,
          commission: commission,
          totalPool: match.totalPool,
          date: match.matchDate
        });
      }
    }

    res.json(profits);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error calculating house profits', 
      error: error.message 
    });
  }
});

export default router;