const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Location = require('../models/Location');
const Message = require('../models/Message');
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
