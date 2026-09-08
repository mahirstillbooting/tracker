// Centralized API and Socket configuration for Tracker Web Client
export const RENDER_BACKEND_URL = 'https://tracker-server-9626.onrender.com';

const DEFAULT_HOST =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : RENDER_BACKEND_URL;

export const BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_HOST;
export const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || BASE_URL;
export const API_AUTH_URL = `${BASE_URL}/api/auth`;
export const API_ADMIN_URL = `${BASE_URL}/api`;
export const API_CHAT_URL = `${BASE_URL}/api/chat`;
