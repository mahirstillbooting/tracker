// Centralized API and Socket configuration for Tracker Web Client
const DEFAULT_HOST =
  typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost'
    ? `http://${window.location.hostname}:5000`
    : 'http://localhost:5000';

export const BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_HOST;
export const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || BASE_URL;
export const API_AUTH_URL = `${BASE_URL}/api/auth`;
export const API_ADMIN_URL = `${BASE_URL}/api`;
export const API_CHAT_URL = `${BASE_URL}/api/chat`;
