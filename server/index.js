require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

const User = require('./models/User');
const Location = require('./models/Location');
const Message = require('./models/Message');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');

const app = express();
const server = http.createServer(app);

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);

// Base health route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Tracker Server is running' });
});

// Store socket.id -> userId mapping
const activeSocketUsers = new Map();

// Real-time tracking & chat via Socket.io
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Room Join Event
  socket.on('join-room', (data) => {
    if (!data) return;
    const { userId, role } = data;
    if (userId) {
      activeSocketUsers.set(socket.id, userId.toString());
      socket.join(userId.toString());
      console.log(`[Socket] Client ${socket.id} joined user room: ${userId}`);
    }
    if (role === 'admin') {
      socket.join('admins');
      console.log(`[Socket] Client ${socket.id} joined "admins" room`);
    }
  });

  // Location Update Listener
  socket.on('update-location', async (data) => {
    try {
      const { userId, latitude, longitude } = data;
      if (!userId || latitude === undefined || longitude === undefined) return;

      activeSocketUsers.set(socket.id, userId.toString());
      socket.join(userId.toString());

      const updatedLocation = await Location.findOneAndUpdate(
        { userId },
        { latitude, longitude, updatedAt: new Date() },
        { upsert: true, new: true }
      ).populate('userId', 'username role isActive');

      await User.findByIdAndUpdate(userId, { isActive: true });

      io.emit('location-updated', {
        userId,
        username: updatedLocation.userId ? updatedLocation.userId.username : 'User',
        latitude,
        longitude,
        isActive: true,
        updatedAt: updatedLocation.updatedAt,
      });
    } catch (err) {
      console.error('[Socket] Error updating location:', err);
    }
  });

  // User Send Message to Admin Team
  socket.on('chat:send-to-admin', async (data) => {
    try {
      const { userId, username, content } = data;
      if (!userId || !content || !content.trim()) return;

      const newMsg = new Message({
        senderId: userId,
        senderUsername: username || 'User',
        recipientRole: 'admin',
        content: content.trim(),
        createdAt: new Date(),
      });

      await newMsg.save();

      // Emit to all admins & back to the sender
      io.to('admins').emit('chat:new-message', newMsg);
      io.to(userId.toString()).emit('chat:new-message', newMsg);
    } catch (err) {
      console.error('[Socket] Error in chat:send-to-admin:', err);
    }
  });

  // Admin Reply to Specific User
  socket.on('chat:admin-reply', async (data) => {
    try {
      const { adminId, adminUsername, targetUserId, content } = data;
      if (!adminId || !targetUserId || !content || !content.trim()) return;

      const newMsg = new Message({
        senderId: adminId,
        senderUsername: adminUsername || 'Admin',
        recipientRole: 'user',
        targetUserId: targetUserId,
        content: content.trim(),
        createdAt: new Date(),
      });

      await newMsg.save();

      // Emit to target user's room and all admins
      io.to(targetUserId.toString()).emit('chat:new-message', newMsg);
      io.to('admins').emit('chat:new-message', newMsg);
    } catch (err) {
      console.error('[Socket] Error in chat:admin-reply:', err);
    }
  });

  // Disconnect Listener
  socket.on('disconnect', async () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    const userId = activeSocketUsers.get(socket.id);
    if (userId) {
      activeSocketUsers.delete(socket.id);
      try {
        const user = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
        const lastLoc = await Location.findOne({ userId }).sort({ updatedAt: -1 });

        io.emit('location-updated', {
          userId,
          username: user ? user.username : 'User',
          latitude: lastLoc ? lastLoc.latitude : null,
          longitude: lastLoc ? lastLoc.longitude : null,
          isActive: false,
          updatedAt: lastLoc ? lastLoc.updatedAt : new Date(),
        });
      } catch (err) {
        console.error('[Socket] Error updating user offline status:', err);
      }
    }
  });
});

// Automated admin seeder
const seedAdminUser = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin12345';

      const newAdmin = new User({
        username: adminUsername,
        password: adminPassword,
        role: 'admin',
        isActive: true,
      });

      await newAdmin.save();
      console.log(`[Auto-Seed] Created default admin user: "${adminUsername}"`);
    } else {
      console.log(`[Auto-Seed] Admin user exists ("${adminExists.username}")`);
    }
  } catch (error) {
    console.error('[Auto-Seed] Error seeding admin user:', error);
  }
};

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

server.listen(PORT, async () => {
  console.log(`[Server] Tracker server running on http://localhost:${PORT}`);
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[MongoDB] Connected successfully to Cluster');
    await seedAdminUser();
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
    console.warn('[MongoDB] Note: Check MONGO_URI credentials or IP Whitelist in server/.env');
  }
});
