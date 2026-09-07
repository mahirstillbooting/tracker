import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import axios from 'axios';
import {
  LogOut,
  ShieldCheck,
  Users,
  Radio,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Navigation2,
  Search,
  MessageSquare,
  Send,
  X,
  Activity,
  Trash2,
} from 'lucide-react';
import { activeUserIcon, offlineUserIcon } from '../utils/leafletFix';

import { SOCKET_SERVER_URL, API_ADMIN_URL as API_BASE_URL } from '../config';

function MapFlyTo({ targetCoords }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords) {
      map.flyTo(targetCoords, 16, { animate: true, duration: 1.5 });
    }
  }, [targetCoords, map]);
  return null;
}

export default function AdminDashboard({ user, onLogout }) {
  const defaultPos = [23.6850, 90.3563];
  const [usersMap, setUsersMap] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('fleet'); // 'fleet' | 'messages'
  const [targetFlyCoords, setTargetFlyCoords] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Chat State
  const [chatThreads, setChatThreads] = useState([]);
  const [selectedUserChat, setSelectedUserChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [adminInput, setAdminInput] = useState('');
  const [unreadThreads, setUnreadThreads] = useState(new Set());
  const chatEndRef = useRef(null);

  const socketRef = useRef(null);

  // Fetch initial users overview & chat threads
  useEffect(() => {
    const token = localStorage.getItem('tracker_token');
    const authHeaders = { Authorization: `Bearer ${token}` };

    const fetchInitialData = async () => {
      try {
        const [overviewRes, threadsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/admin/users-overview`, { headers: authHeaders }),
          axios.get(`${API_BASE_URL}/chat/threads`, { headers: authHeaders }),
        ]);

        const initialMap = {};
        overviewRes.data.forEach((u) => {
          initialMap[u.id] = {
            userId: u.id,
            username: u.username,
            isActive: u.isActive,
            latitude: u.lastLocation ? u.lastLocation.latitude : null,
            longitude: u.lastLocation ? u.lastLocation.longitude : null,
            updatedAt: u.lastLocation
              ? new Date(u.lastLocation.updatedAt).toLocaleString()
              : 'No location recorded',
          };
        });
        setUsersMap(initialMap);
        setChatThreads(threadsRes.data);
      } catch (err) {
        console.error('Error fetching admin data:', err);
      }
    };

    fetchInitialData();

    // Socket.io connection & room join
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Admin socket connected:', socket.id);
      setIsConnected(true);
      socket.emit('join-room', { userId: user.id, role: 'admin' });
    });

    socket.on('disconnect', () => {
      console.log('Admin socket disconnected');
      setIsConnected(false);
    });

    // Live Location Updates
    socket.on('location-updated', (data) => {
      const { userId, username, latitude, longitude, isActive, updatedAt } = data;
      if (!userId) return;

      setUsersMap((prev) => {
        const existing = prev[userId] || {};
        return {
          ...prev,
          [userId]: {
            ...existing,
            userId,
            username: username || existing.username || 'User',
            isActive: isActive !== undefined ? isActive : existing.isActive,
            latitude: latitude !== undefined && latitude !== null ? latitude : existing.latitude,
            longitude: longitude !== undefined && longitude !== null ? longitude : existing.longitude,
            updatedAt: updatedAt ? new Date(updatedAt).toLocaleString() : existing.updatedAt,
          },
        };
      });
    });

    // Live Chat Messages
    socket.on('chat:new-message', (newMsg) => {
      const threadUserId = newMsg.senderId === user.id ? newMsg.targetUserId : newMsg.senderId;

      // Update active conversation if selected
      if (selectedUserChat && (selectedUserChat.userId === threadUserId || selectedUserChat.id === threadUserId)) {
        setChatMessages((prev) => {
          if (prev.some((m) => m._id && m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
      } else {
        setUnreadThreads((prev) => new Set(prev).add(threadUserId));
      }

      // Update thread preview list
      setChatThreads((prev) => {
        const index = prev.findIndex((t) => t.userId === threadUserId);
        const updatedThread = {
          userId: threadUserId,
          username: newMsg.senderUsername,
          lastMessage: newMsg.content,
          lastMessageSender: newMsg.senderUsername,
          updatedAt: newMsg.createdAt,
        };
        if (index > -1) {
          const newThreads = [...prev];
          newThreads[index] = { ...newThreads[index], ...updatedThread };
          return newThreads;
        }
        return [updatedThread, ...prev];
      });
    });

    // Live User Deletion Broadcast
    socket.on('user-deleted', ({ userId }) => {
      if (!userId) return;
      setUsersMap((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      setChatThreads((prev) => prev.filter((t) => (t.userId || t.id) !== userId));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user, selectedUserChat]);

  // Fetch specific conversation when admin opens a user chat
  const handleOpenUserChat = async (targetUser) => {
    setSelectedUserChat(targetUser);
    setUnreadThreads((prev) => {
      const next = new Set(prev);
      next.delete(targetUser.userId || targetUser.id);
      return next;
    });

    try {
      const token = localStorage.getItem('tracker_token');
      const targetId = targetUser.userId || targetUser.id;
      const response = await axios.get(`${API_BASE_URL}/chat/conversation/${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setChatMessages(response.data);
    } catch (err) {
      console.error('Failed to load user chat history:', err);
    }
  };

  useEffect(() => {
    if (selectedUserChat) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, selectedUserChat]);

  const handleSendAdminReply = (e) => {
    e.preventDefault();
    if (!adminInput.trim() || !selectedUserChat || !socketRef.current) return;

    const targetId = selectedUserChat.userId || selectedUserChat.id;
    socketRef.current.emit('chat:admin-reply', {
      adminId: user.id,
      adminUsername: user.username,
      targetUserId: targetId,
      content: adminInput.trim(),
    });

    setAdminInput('');
  };

  const allUsersList = Object.values(usersMap);
  const activeCount = allUsersList.filter((u) => u.isActive).length;
  const filteredUsers = allUsersList.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLocateUser = (u) => {
    if (u.latitude && u.longitude) {
      setTargetFlyCoords([u.latitude, u.longitude]);
    }
  };

  const handleDeleteUser = async (u) => {
    const targetId = u.userId || u.id;
    if (!targetId) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete user "${u.username}"? This will permanently remove their account, location records, and chat history.`
    );
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('tracker_token');
      await axios.delete(`${API_BASE_URL}/admin/user/${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUsersMap((prev) => {
        const copy = { ...prev };
        delete copy[targetId];
        return copy;
      });

      setChatThreads((prev) => prev.filter((t) => (t.userId || t.id) !== targetId));

      if (selectedUserChat && (selectedUserChat.userId === targetId || selectedUserChat.id === targetId)) {
        setSelectedUserChat(null);
      }
    } catch (err) {
      console.error('Delete user error:', err);
      alert(err.response?.data?.message || 'Failed to delete user from database');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 font-sans overflow-hidden">
      {/* Top Bar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600/10 border border-emerald-500/20 text-emerald-500 rounded-xl">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Tracker Admin Console</span>
            </h1>
            <p className="text-xs text-slate-400">Live Fleet & Direct Messaging Support</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-100">
              {activeCount} Online / {allUsersList.length} Total Users
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <Radio
              className={`w-4 h-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`}
            />
            <span className="font-medium">
              {isConnected ? (
                <span className="text-emerald-400">Live Feed</span>
              ) : (
                <span className="text-red-400">Disconnected</span>
              )}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Body with Map and Drawer */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Collapsible Dark Side Drawer */}
        <div
          className={`bg-slate-900 border-r border-slate-800 z-10 transition-all duration-300 flex flex-col shadow-2xl ${
            drawerOpen ? 'w-96' : 'w-0 border-r-0'
          }`}
        >
          {drawerOpen && (
            <div className="p-4 flex flex-col h-full">
              {/* Tab Selector: Fleet vs Messages */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-3">
                <button
                  onClick={() => setActiveTab('fleet')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                    activeTab === 'fleet'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>Fleet Map ({allUsersList.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all relative ${
                    activeTab === 'messages'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Messages</span>
                  {unreadThreads.size > 0 && (
                    <span className="w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {unreadThreads.size}
                    </span>
                  )}
                </button>
              </div>

              {/* FLEET TAB */}
              {activeTab === 'fleet' && (
                <>
                  <div className="relative mb-3">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search user..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl py-2 pl-9 pr-3 text-slate-200 text-xs outline-none placeholder-slate-600"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {filteredUsers.map((u) => (
                      <div
                        key={u.userId}
                        className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl hover:border-blue-500/40 transition-all flex items-center justify-between group"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                u.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'
                              }`}
                            />
                            <span className="text-xs font-bold text-slate-200 truncate">
                              {u.username}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                u.isActive
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {u.isActive ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono mt-1">
                            {u.latitude && u.longitude
                              ? `${u.latitude.toFixed(4)}, ${u.longitude.toFixed(4)}`
                              : 'No coordinates'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setActiveTab('messages');
                              handleOpenUserChat(u);
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs"
                            title="Chat with user"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          {u.latitude && u.longitude && (
                            <button
                              onClick={() => handleLocateUser(u)}
                              className="px-2 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-medium flex items-center gap-1"
                              title="Locate on Map"
                            >
                              <Navigation2 className="w-3.5 h-3.5" />
                              <span>Locate</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg text-xs transition-all"
                            title="Delete User from Database"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* MESSAGES TAB */}
              {activeTab === 'messages' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    User Conversation Threads
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {chatThreads.map((t) => {
                      const hasUnread = unreadThreads.has(t.userId);
                      const isSelected = selectedUserChat && (selectedUserChat.userId === t.userId || selectedUserChat.id === t.userId);
                      return (
                        <button
                          key={t.userId}
                          onClick={() => handleOpenUserChat(t)}
                          className={`w-full p-3 text-left rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-blue-600/10 border-blue-500/50 text-white'
                              : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold flex items-center gap-2">
                              <span>{t.username}</span>
                              {hasUnread && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {t.updatedAt ? new Date(t.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {t.lastMessageSender ? `${t.lastMessageSender}: ` : ''}{t.lastMessage || 'No messages yet'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toggle Drawer Button */}
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="absolute left-0 top-4 z-[1000] bg-slate-900 border border-slate-800 text-slate-300 hover:text-white p-2 rounded-r-xl shadow-xl transition-all"
          style={{ transform: drawerOpen ? 'translateX(384px)' : 'translateX(0px)' }}
        >
          {drawerOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>

        {/* Map Container */}
        <main className="flex-1 h-full w-full relative">
          <MapContainer center={defaultPos} zoom={7} scrollWheelZoom={true} className="w-full h-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {targetFlyCoords && <MapFlyTo targetCoords={targetFlyCoords} />}

            {allUsersList
              .filter((u) => u.latitude && u.longitude)
              .map((u) => (
                <Marker
                  key={u.userId}
                  position={[u.latitude, u.longitude]}
                  icon={u.isActive ? activeUserIcon : offlineUserIcon}
                >
                  <Popup>
                    <div className="p-1 text-slate-900 font-sans text-xs">
                      <div className="font-bold flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-blue-600" />
                          <span>{u.username}</span>
                        </span>
                        <span
                          className={`px-1 rounded text-[9px] font-bold uppercase ${
                            u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {u.isActive ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-700">
                        Lat: {u.latitude.toFixed(5)} <br />
                        Lng: {u.longitude.toFixed(5)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </main>

        {/* Floating Active Chat Box for Selected User */}
        {selectedUserChat && (
          <div className="absolute bottom-6 right-6 z-[1500] w-80 md:w-96 h-[440px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
            {/* Box Header */}
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-100">
                  Chatting with: <span className="text-blue-400">{selectedUserChat.username}</span>
                </span>
              </div>
              <button
                onClick={() => setSelectedUserChat(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat History */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-900/60">
              {chatMessages.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No message history with {selectedUserChat.username}.
                </div>
              ) : (
                chatMessages.map((msg, index) => {
                  const isAdminSender = msg.senderId === user.id || msg.recipientRole === 'user';
                  return (
                    <div
                      key={msg._id || index}
                      className={`flex flex-col ${isAdminSender ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] text-slate-400 mb-1">{msg.senderUsername}</span>
                      <div
                        className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          isAdminSender
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Admin Input Reply */}
            <form onSubmit={handleSendAdminReply} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                placeholder={`Reply to ${selectedUserChat.username}...`}
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-slate-100 placeholder-slate-500 text-xs outline-none"
              />
              <button
                type="submit"
                disabled={!adminInput.trim()}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
