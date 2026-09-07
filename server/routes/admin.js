const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Location = require('../models/Location');
const { verifyAdmin } = require('../middleware/auth');

// GET /api/admin/users-overview
router.get('/users-overview', verifyAdmin, async (req, res) => {
  try {
    // 1. Fetch all users with role 'user'
    const users = await User.find({ role: 'user' }).select('_id username isActive createdAt');

    // 2. Fetch last known location for each user
    const usersOverview = await Promise.all(
      users.map(async (u) => {
        const lastLoc = await Location.findOne({ userId: u._id }).sort({ updatedAt: -1 });

        return {
          id: u._id,
          username: u.username,
          isActive: u.isActive,
          lastLocation: lastLoc
            ? {
                latitude: lastLoc.latitude,
                longitude: lastLoc.longitude,
                updatedAt: lastLoc.updatedAt,
              }
            : null,
        };
      })
    );

    return res.json(usersOverview);
  } catch (error) {
    console.error('Error in GET /api/admin/users-overview:', error);
    return res.status(500).json({ message: 'Failed to fetch users overview' });
  }
});

module.exports = router;
