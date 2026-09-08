// Centralized backend connection pointing to live Render backend
export const API_URL = 'https://tracker-server-9626.onrender.com';

// Shared Socket.io options. The backend sleeps on Render's free plan and a cold
// start can take well over a minute, so the handshake timeout is generous and
// reconnection never gives up.
export const SOCKET_OPTIONS = {
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000,
};

// Hits the health route so a sleeping backend starts waking up before (and
// while) the socket handshake is attempted.
export const wakeServer = async () => {
  try {
    await fetch(`${API_URL}/api/health`);
  } catch (err) {
    console.warn('[Wake] Health check failed:', err.message);
  }
};
