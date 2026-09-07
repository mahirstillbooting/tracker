const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');

// Helper auth middleware for chat endpoints
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No authorization token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// GET /api/chat/conversation/:userId
router.get('/conversation/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Security check: users can only access their own conversation unless they are admin
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Query messages where user is sender OR user is target of admin reply
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { targetUserId: userId },
      ],
    }).sort({ createdAt: 1 });

    return res.json(messages);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json({ message: 'Failed to fetch conversation history' });
  }
});

// GET /api/chat/threads (Admin only)
router.get('/threads', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin role required' });
    }

    // Fetch all non-admin users
    const users = await User.find({ role: 'user' }).select('_id username isActive');

    // For each user, query their latest message
    const threads = await Promise.all(
      users.map(async (u) => {
        const lastMsg = await Message.findOne({
          $or: [{ senderId: u._id }, { targetUserId: u._id }],
        }).sort({ createdAt: -1 });

        return {
          userId: u._id,
          username: u.username,
          isActive: u.isActive,
          lastMessage: lastMsg ? lastMsg.content : null,
          lastMessageSender: lastMsg ? lastMsg.senderUsername : null,
          updatedAt: lastMsg ? lastMsg.createdAt : u.createdAt,
        };
      })
    );

    // Sort threads by latest message timestamp
    threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return res.json(threads);
  } catch (error) {
    console.error('Error fetching chat threads:', error);
    return res.status(500).json({ message: 'Failed to fetch chat threads' });
  }
});

module.exports = router;
