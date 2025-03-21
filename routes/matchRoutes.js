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

// Add this route to get template matches
router.get('/templates', async (req, res) => {
  try {
    const templates = await Match.find({ 
      isTemplate: true,
      status: 'active'
    }).sort({ createdAt: -1 });
    
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this route to check if a template exists
router.get('/template/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await Match.findOne({ 
      _id: templateId,
      isTemplate: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update the user-games route to include template information
router.get('/user-games', async (req, res) => {
  try {
    const matches = await Match.aggregate([
      { 
        $match: { 
          isTemplate: false,
          status: { $nin: ['completed', 'cancelled'] } 
        } 
      },
      {
        $lookup: {
          from: 'matches',
          localField: 'originalTemplate',
          foreignField: '_id',
          as: 'templateInfo'
        }
      },
      {
        $addFields: {
          totalStake: {
            $sum: '$bets.amount'
          },
          templateExists: { $size: '$templateInfo' }
        }
      },
      {
        $match: {
          templateExists: { $gt: 0 }
        }
      },
      { $sort: { totalStake: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'bets.userId',
          foreignField: '_id',
          as: 'betUsers'
        }
      }
    ]);

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

// Add this new route to get completed matches
router.get('/completed', async (req, res) => {
  try {
    const completedMatches = await Match.find({
      status: 'completed',
      isTemplate: false
    })
    .sort({ updatedAt: -1 }) // Sort by most recently completed
    .limit(20) // Limit to 20 matches
    .populate('bets.userId');

    res.json(completedMatches);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching completed matches', 
      error: error.message 
    });
  }
});

export default router;
