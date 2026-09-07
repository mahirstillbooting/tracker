import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageSquare, X, Send, ShieldCheck, User } from 'lucide-react';

import { API_CHAT_URL as API_BASE_URL } from '../config';

export default function UserChatWidget({ user, socket }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch conversation history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('tracker_token');
        const response = await axios.get(`${API_BASE_URL}/conversation/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(response.data);
      } catch (err) {
        console.error('Error fetching user chat history:', err);
      }
    };

    fetchHistory();
  }, [user]);

  // Socket listener for new messages
  useEffect(() => {
    if (!socket) return;

    // Join room for this user
    socket.emit('join-room', { userId: user.id, role: 'user' });

    const handleNewMessage = (newMsg) => {
      // Check if message belongs to this user conversation
      if (newMsg.senderId === user.id || newMsg.targetUserId === user.id) {
        setMessages((prev) => {
          // Avoid duplicate messages if already present
          if (prev.some((m) => m._id && m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });

        if (!isOpen && newMsg.senderId !== user.id) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    };

    socket.on('chat:new-message', handleNewMessage);

    return () => {
      socket.off('chat:new-message', handleNewMessage);
    };
  }, [socket, user, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    socket.emit('chat:send-to-admin', {
      userId: user.id,
      username: user.username,
      content: inputText.trim(),
    });

    setInputText('');
  };

  return (
    <div className="fixed bottom-6 right-6 z-[2000] font-sans">
      {/* Floating Chat Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl shadow-blue-500/40 border border-blue-400/30 flex items-center justify-center transition-all duration-200 active:scale-95 group"
          title="Open Admin Support Chat"
        >
          <MessageSquare className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900 animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Collapsible Dark Chat Window */}
      {isOpen && (
        <div className="w-80 md:w-96 h-[460px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Admin Support Chat</h3>
                <p className="text-[10px] text-emerald-400 font-medium">● Real-time Direct Channel</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-900/60">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                Send a message to start chatting with admin support.
              </div>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.senderId === user.id;
                return (
                  <div
                    key={msg._id || index}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                      <span>{isMe ? 'You' : msg.senderUsername}</span>
                    </div>
                    <div
                      className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/20'
                          : 'bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 font-mono">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              placeholder="Type message to admin..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-slate-100 placeholder-slate-500 text-xs outline-none"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
