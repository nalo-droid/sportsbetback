import express from 'express';
import PersonalBetGroup from '../models/PersonalBetGroup.js';
import { v4 as uuidv4 } from 'uuid';
import Match from '../models/Match.js';

const router = express.Router();

// Create personal group
router.post('/create', async (req, res) => {
  try {
    const { matchId, userId } = req.body;
    const originalMatch = await Match.findById(matchId);

    const personalMatch = await Match.create({
      homeTeam: originalMatch.homeTeam,
      awayTeam: originalMatch.awayTeam,
      amount: originalMatch.amount,
      matchDate: originalMatch.matchDate,
      type: 'personal',
      originalMatch: matchId,
      groupCode: uuidv4().slice(0, 8).toUpperCase(),
      status: 'active'
    });

    const newGroup = new PersonalBetGroup({
      code: personalMatch.groupCode,
      match: personalMatch._id,
      creator: userId,
      participants: [userId]
    });

    await originalMatch.updateOne({
      $push: { linkedMatches: personalMatch._id }
    });

    await newGroup.save();
    res.status(201).json(newGroup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join personal group
router.post('/join', async (req, res) => {
  try {
    const { code, userId } = req.body;
    
    const group = await PersonalBetGroup.findOne({ code })
      .populate('match')
      .populate('participants', 'username');

    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.participants.some(p => p._id.equals(userId))) {
      return res.status(400).json({ error: 'Already in group' });
    }

    group.participants.push(userId);
    await group.save();
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch personal groups for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const groups = await PersonalBetGroup.find({ participants: userId })
      .populate('match')
      .populate('participants', 'username');
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
