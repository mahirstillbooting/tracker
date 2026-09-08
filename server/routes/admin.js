const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Location = require('../models/Location');
const Message = require('../models/Message');
const { verifyAdmin } = require('../middleware/auth');

// GET /api/admin/users-overview (High-Performance Aggregated Query)
router.get('/users-overview', verifyAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('_id username isActive createdAt').lean();
    const userIds = users.map((u) => u._id);

    // Single aggregation query for all users' latest locations
    const latestLocations = await Location.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: '$userId',
          latitude: { $first: '$latitude' },
          longitude: { $first: '$longitude' },
          updatedAt: { $first: '$updatedAt' },
        },
      },
    ]);

    const locMap = new Map();
    latestLocations.forEach((loc) => {
      locMap.set(loc._id.toString(), loc);
    });

    const usersOverview = users.map((u) => {
      const lastLoc = locMap.get(u._id.toString());
      return {
        id: u._id.toString(),
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
    });

    return res.json(usersOverview);
  } catch (error) {
    console.error('Error in GET /api/admin/users-overview:', error);
    return res.status(500).json({ message: 'Failed to fetch users overview' });
  }
});

// DELETE /api/admin/user/:userId
router.delete('/user/:userId', verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (userToDelete.role === 'admin') {
      return res.status(403).json({ message: 'Admin users cannot be deleted' });
    }

    // 1. Delete user record
    await User.findByIdAndDelete(userId);

    // 2. Delete all location records for this user
    await Location.deleteMany({ userId });

    // 3. Delete all chat messages involving this user
    await Message.deleteMany({
      $or: [{ senderId: userId }, { targetUserId: userId }],
    });

    // 4. Broadcast real-time deletion event if socket server is attached
    const io = req.app.get('io');
    if (io) {
      io.emit('user-deleted', { userId });
    }

    return res.json({ success: true, message: `User ${userToDelete.username} deleted successfully` });
  } catch (error) {
    console.error('Error in DELETE /api/admin/user/:userId:', error);
    return res.status(500).json({ message: 'Failed to delete user' });
  }
});

module.exports = router;
