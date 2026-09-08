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
      $or: [{ senderId: userId }, { targetUserId: userId }],
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.json(messages);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return res.status(500).json({ message: 'Failed to fetch conversation history' });
  }
});

// GET /api/chat/threads (Admin only - High-Performance Aggregation Query)
router.get('/threads', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin role required' });
    }

    const users = await User.find({ role: 'user' }).select('_id username isActive createdAt').lean();

    // Query all latest messages across all threads in ONE single aggregation query
    const latestMessages = await Message.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$recipientRole', 'user'] },
              '$targetUserId',
              '$senderId',
            ],
          },
          lastMessage: { $first: '$content' },
          lastMessageSender: { $first: '$senderUsername' },
          updatedAt: { $first: '$createdAt' },
        },
      },
    ]);

    const msgMap = new Map();
    latestMessages.forEach((m) => {
      if (m._id) msgMap.set(m._id.toString(), m);
    });

    const threads = users.map((u) => {
      const lastMsg = msgMap.get(u._id.toString());
      return {
        userId: u._id,
        username: u.username,
        isActive: u.isActive,
        lastMessage: lastMsg ? lastMsg.lastMessage : null,
        lastMessageSender: lastMsg ? lastMsg.lastMessageSender : null,
        updatedAt: lastMsg ? lastMsg.updatedAt : u.createdAt,
      };
    });

    threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return res.json(threads);
  } catch (error) {
    console.error('Error fetching chat threads:', error);
    return res.status(500).json({ message: 'Failed to fetch chat threads' });
  }
});

module.exports = router;
