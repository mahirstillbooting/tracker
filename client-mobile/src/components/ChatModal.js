import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MessageSquare, Send, X, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../config';

export default function ChatModal({ visible, onClose, user, socket, targetUser }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef(null);

  const isUserRole = user.role === 'user';
  const chatUserId = isUserRole ? user.id || user._id : targetUser?.userId || targetUser?.id;
  const chatUsername = isUserRole ? 'Admin Support' : targetUser?.username || 'User';

  useEffect(() => {
    if (!visible || !chatUserId) return;

    const fetchHistory = async () => {
      try {
        const token = await AsyncStorage.getItem('tracker_token');
        const response = await axios.get(`${API_URL}/api/chat/conversation/${chatUserId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(response.data);
      } catch (err) {
        console.error('[Mobile Chat] Error fetching history:', err);
      }
    };

    fetchHistory();
  }, [visible, chatUserId]);

  useEffect(() => {
    if (!socket || !visible) return;

    const handleNewMessage = (newMsg) => {
      if (
        newMsg.senderId === chatUserId ||
        newMsg.targetUserId === chatUserId ||
        (isUserRole && (newMsg.senderId === (user.id || user._id) || newMsg.targetUserId === (user.id || user._id)))
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m._id && m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
      }
    };

    socket.on('chat:new-message', handleNewMessage);

    return () => {
      socket.off('chat:new-message', handleNewMessage);
    };
  }, [socket, visible, chatUserId, isUserRole, user]);

  const handleSend = () => {
    if (!inputText.trim() || !socket) return;
    const currentUserId = user.id || user._id;

    if (isUserRole) {
      socket.emit('chat:send-to-admin', {
        userId: currentUserId,
        username: user.username,
        content: inputText.trim(),
      });
    } else {
      socket.emit('chat:admin-reply', {
        adminId: currentUserId,
        adminUsername: user.username,
        targetUserId: chatUserId,
        content: inputText.trim(),
      });
    }

    setInputText('');
  };

  const dynamicTopPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0) + 4;
  const dynamicBottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 12) + 8;

  return (
    <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { paddingTop: dynamicTopPadding }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" translucent={true} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.iconBadge}>
                <MessageSquare size={18} color="#3b82f6" />
              </View>
              <View>
                <Text style={styles.headerTitle}>{chatUsername}</Text>
                <Text style={styles.headerSubtitle}>
                  {isUserRole ? 'Real-Time Support Channel' : 'Admin Reply'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => item._id || index.toString()}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isMe = item.senderId === (user.id || user._id);
              return (
                <View
                  style={[
                    styles.messageRow,
                    isMe ? styles.messageRowMe : styles.messageRowOther,
                  ]}
                >
                  <Text style={styles.senderText}>
                    {isMe ? 'You' : item.senderUsername}
                  </Text>
                  <View
                    style={[
                      styles.bubble,
                      isMe ? styles.bubbleMe : styles.bubbleOther,
                    ]}
                  >
                    <Text style={styles.bubbleText}>{item.content}</Text>
                  </View>
                  <Text style={styles.timeText}>
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No messages yet. Send a message to start.</Text>
            }
          />

          {/* Input Bar */}
          <View style={[styles.inputBar, { paddingBottom: dynamicBottomPadding }]}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#64748b"
              value={inputText}
              onChangeText={setInputText}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Send size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'android' ? ((StatusBar.currentHeight || 30) + 6) : 0,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    minHeight: 60,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageRow: {
    marginBottom: 12,
    maxWidth: '82%',
  },
  messageRowMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderText: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 2,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderBottomLeftRadius: 2,
  },
  bubbleText: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 20,
  },
  timeText: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 24 : 12,
    gap: 8,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 14,
    color: '#f8fafc',
    fontSize: 14,
  },
  sendBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
});
