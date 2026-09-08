import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  Modal,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { io } from 'socket.io-client';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogOut, Users, ShieldCheck, Navigation2, X, ChevronUp, MessageSquare } from 'lucide-react-native';
import { API_URL, SOCKET_OPTIONS, wakeServer } from '../config';
import ChatModal from '../components/ChatModal';

const getAdminLeafletHtml = () => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #0f172a; }
    .leaflet-tile-container img { filter: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([23.6850, 90.3563], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var activeIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    var offlineIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    var markersMap = {};

    window.updateFleetMarkers = function(usersArray) {
      usersArray.forEach(function(u) {
        if (!u.latitude || !u.longitude) return;
        var icon = u.isActive ? activeIcon : offlineIcon;
        var statusHtml = u.isActive ? '<span style="color: #10b981; font-weight: bold;">● Online</span>' : '<span style="color: #94a3b8; font-weight: bold;">○ Offline</span>';
        var popupContent = '<b>' + u.username + '</b> ' + statusHtml + '<br><small>Lat: ' + u.latitude.toFixed(4) + ', Lng: ' + u.longitude.toFixed(4) + '</small><br><small>Last Seen: ' + u.updatedAt + '</small>';

        if (markersMap[u.userId]) {
          markersMap[u.userId].setLatLng([u.latitude, u.longitude]);
          markersMap[u.userId].setIcon(icon);
          markersMap[u.userId].setPopupContent(popupContent);
        } else {
          var marker = L.marker([u.latitude, u.longitude], { icon: icon }).addTo(map).bindPopup(popupContent);
          markersMap[u.userId] = marker;
        }
      });
    };

    window.focusUserLocation = function(lat, lng) {
      if (lat && lng) {
        map.setView([lat, lng], 16);
      }
    };

    window.map = map;
    window.markersMap = markersMap;
  </script>
</body>
</html>
`;

export default function AdminDashboard({ user, onLogout }) {
  const [usersMap, setUsersMap] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Chat State
  const [selectedChatUser, setSelectedChatUser] = useState(null);
  const [chatModalVisible, setChatModalVisible] = useState(false);

  const socketRef = useRef(null);
  const webViewRef = useRef(null);

  const syncWebViewMarkers = (usersData) => {
    if (webViewRef.current) {
      const validUsers = Object.values(usersData).filter((u) => u.latitude && u.longitude);
      const script = `
        if (window.updateFleetMarkers) {
          window.updateFleetMarkers(${JSON.stringify(validUsers)});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  };

  useEffect(() => {
    const fetchUsersOverview = async () => {
      try {
        const token = await AsyncStorage.getItem('tracker_token');
        const response = await axios.get(`${API_URL}/api/admin/users-overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const initialMap = {};
        response.data.forEach((u) => {
          initialMap[u.id] = {
            userId: u.id,
            username: u.username,
            isActive: u.isActive,
            latitude: u.lastLocation ? u.lastLocation.latitude : null,
            longitude: u.lastLocation ? u.lastLocation.longitude : null,
            updatedAt: u.lastLocation
              ? new Date(u.lastLocation.updatedAt).toLocaleTimeString()
              : 'No location recorded',
          };
        });
        setUsersMap(initialMap);
        syncWebViewMarkers(initialMap);
      } catch (err) {
        console.error('[Mobile Admin] Failed to fetch users overview:', err);
      }
    };

    fetchUsersOverview();

    const socket = io(API_URL, SOCKET_OPTIONS);
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      console.log('[Mobile Admin] Socket connect error, retrying:', err.message);
      wakeServer();
    });

    socket.on('connect', () => {
      console.log('[Mobile Admin] Socket connected:', socket.id);
      setIsConnected(true);
      socket.emit('join-room', { userId: user.id, role: 'admin' });
    });

    socket.on('disconnect', () => {
      console.log('[Mobile Admin] Socket disconnected');
      setIsConnected(false);
    });

    socket.on('location-updated', (data) => {
      const { userId, username, latitude, longitude, isActive, updatedAt } = data;
      if (!userId) return;

      setUsersMap((prev) => {
        const existing = prev[userId] || {};
        const updatedMap = {
          ...prev,
          [userId]: {
            ...existing,
            userId,
            username: username || existing.username || 'User',
            isActive: isActive !== undefined ? isActive : existing.isActive,
            latitude: latitude !== undefined && latitude !== null ? latitude : existing.latitude,
            longitude: longitude !== undefined && longitude !== null ? longitude : existing.longitude,
            updatedAt: updatedAt ? new Date(updatedAt).toLocaleTimeString() : existing.updatedAt,
          },
        };
        syncWebViewMarkers(updatedMap);
        return updatedMap;
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  const allUsersList = Object.values(usersMap);
  const activeCount = allUsersList.filter((u) => u.isActive).length;

  const handleLocateUser = (u) => {
    setModalVisible(false);
    if (webViewRef.current && u.latitude && u.longitude) {
      const focusScript = `
        if (window.focusUserLocation) {
          window.focusUserLocation(${u.latitude}, ${u.longitude});
        } else if (window.map) {
          window.map.setView([${u.latitude}, ${u.longitude}], 16);
        }
        true;
      `;
      webViewRef.current.injectJavaScript(focusScript);
    }
  };

  const handleOpenUserChat = (u) => {
    setModalVisible(false);
    setSelectedChatUser(u);
    setChatModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.headerTitle}>
          <ShieldCheck size={20} color="#10b981" />
          <Text style={styles.headerText}>Admin Console</Text>
        </View>

        <View style={styles.rightGroup}>
          <View style={styles.countBadge}>
            <Users size={14} color="#10b981" />
            <Text style={styles.countText}>
              {activeCount}/{allUsersList.length} Active
            </Text>
          </View>

          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#10b981' : '#ef4444' },
              ]}
            />
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <LogOut size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: getAdminLeafletHtml() }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={{ flex: 1, width: '100%', height: '100%' }}
          containerStyle={{ flex: 1 }}
          onLoadEnd={() => {
            syncWebViewMarkers(usersMap);
          }}
        />

        {/* Bottom Floating Trigger for Users Drawer */}
        <TouchableOpacity
          style={styles.drawerTrigger}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.drawerTriggerContent}>
            <Users size={18} color="#10b981" />
            <Text style={styles.drawerTriggerText}>
              System Fleet List ({activeCount}/{allUsersList.length} Active)
            </Text>
          </View>
          <ChevronUp size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet / Modal Drawer */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleGroup}>
                <Users size={18} color="#10b981" />
                <Text style={styles.sheetTitle}>
                  All Users ({activeCount}/{allUsersList.length} Online)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={allUsersList}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <View style={styles.userCard}>
                  <View style={styles.userInfoCol}>
                    <View style={styles.userNameRow}>
                      <View
                        style={[
                          styles.liveDot,
                          { backgroundColor: item.isActive ? '#10b981' : '#64748b' },
                        ]}
                      />
                      <Text style={styles.userCardName}>{item.username}</Text>
                      <View
                        style={[
                          styles.statusTag,
                          {
                            backgroundColor: item.isActive
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(100, 116, 139, 0.15)',
                            borderColor: item.isActive
                              ? 'rgba(16, 185, 129, 0.3)'
                              : 'rgba(100, 116, 139, 0.3)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusTagText,
                            { color: item.isActive ? '#10b981' : '#94a3b8' },
                          ]}
                        >
                          {item.isActive ? 'Online' : 'Offline'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.userCardCoords}>
                      {item.latitude && item.longitude
                        ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                        : 'No coordinates'}
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.chatActionBtn}
                      onPress={() => handleOpenUserChat(item)}
                    >
                      <MessageSquare size={14} color="#3b82f6" />
                    </TouchableOpacity>

                    {item.latitude && item.longitude ? (
                      <TouchableOpacity
                        style={styles.locateBtn}
                        onPress={() => handleLocateUser(item)}
                      >
                        <Navigation2 size={14} color="#3b82f6" />
                        <Text style={styles.locateBtnText}>Focus</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Loading system users...</Text>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>

      {/* Admin Chat Modal */}
      {selectedChatUser && (
        <ChatModal
          visible={chatModalVisible}
          onClose={() => {
            setChatModalVisible(false);
            setSelectedChatUser(null);
          }}
          user={user}
          targetUser={selectedChatUser}
          socket={socketRef.current}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  topBar: {
    height: 60,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  countText: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: 11,
  },
  statusBadge: {
    backgroundColor: '#0f172a',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  drawerTrigger: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 8,
  },
  drawerTriggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerTriggerText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '65%',
    borderTopWidth: 1,
    borderColor: '#334155',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    marginBottom: 12,
  },
  sheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 4,
  },
  userCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfoCol: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userCardName: {
    color: '#f8fafc',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  userCardCoords: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  locateBtnText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
