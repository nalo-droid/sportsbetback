import express from 'express';  
import Match from '../models/Match.js'; 
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import fetch from 'node-fetch';

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

    // Validate input
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ message: 'Invalid matches array' });
    }

    const newMatches = matches.map(m => {
      // Validate required fields
      if (!m.homeTeam || !m.awayTeam || !m.amount || !m.matchDate) {
        throw new Error('Missing required fields for match');
      }

      const matchDate = new Date(m.matchDate);
      if (isNaN(matchDate)) {
        throw new Error('Invalid match date');
      }

      return {
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        amount: m.amount,
        matchDate,
        apiId: m.apiId || null,
        status: 'active'
      };
    });

    const created = await Match.insertMany(newMatches);
    res.json({ createdCount: created.length, matches: created });
  } catch (error) {
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
    const deletedMatch = await Match.findByIdAndDelete(id);

    if (!deletedMatch) {
      return res.status(404).json({ message: 'Match not found' });
    }

    res.json({ message: 'Match deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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

    // Filter out past matches
    const currentDate = new Date();
    const upcomingMatches = data.matches.filter(match => new Date(match.utcDate) > currentDate);

    res.json({ matches: upcomingMatches });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching matches', error: error.message });
  }
});

export default router;