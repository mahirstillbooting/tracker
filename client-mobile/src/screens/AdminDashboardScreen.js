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
import MapView, { Marker, Callout, UrlTile } from 'react-native-maps';
import { io } from 'socket.io-client';
import { LogOut, Users, ShieldCheck, Radio, Navigation2, X, ChevronUp } from 'lucide-react-native';
import { API_URL } from '../config';

export default function AdminDashboardScreen({ user, onLogout }) {
  const [usersMap, setUsersMap] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const socketRef = useRef(null);
  const mapRef = useRef(null);

  const defaultRegion = {
    latitude: 23.6850,
    longitude: 90.3563,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Mobile admin socket connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Mobile admin socket disconnected');
      setIsConnected(false);
    });

    socket.on('location-updated', (data) => {
      const { userId, username, latitude, longitude, updatedAt } = data;
      if (!userId) return;

      setUsersMap((prev) => ({
        ...prev,
        [userId]: {
          userId,
          username: username || 'User',
          latitude,
          longitude,
          updatedAt: updatedAt ? new Date(updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
        },
      }));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const activeUsers = Object.values(usersMap);

  const handleLocateUser = (u) => {
    setModalVisible(false);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: u.latitude,
        longitude: u.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
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
            <Text style={styles.countText}>{activeUsers.length}</Text>
          </View>

          <View style={styles.statusBadge}>
            <Radio size={14} color={isConnected ? '#10b981' : '#ef4444'} />
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <LogOut size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={defaultRegion}
          showsUserLocation={false}
        >
          {/* OpenStreetMap Tile Overlay */}
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />

          {activeUsers.map((u) => (
            <Marker
              key={u.userId}
              coordinate={{ latitude: u.latitude, longitude: u.longitude }}
            >
              <View style={styles.userMarkerBadge}>
                <Text style={styles.userMarkerText}>
                  {u.username.charAt(0).toUpperCase()}
                </Text>
              </View>

              <Callout tooltip>
                <View style={styles.calloutCard}>
                  <Text style={styles.calloutUser}>{u.username}</Text>
                  <Text style={styles.calloutCoords}>
                    {u.latitude.toFixed(4)}, {u.longitude.toFixed(4)}
                  </Text>
                  <Text style={styles.calloutTime}>Seen: {u.updatedAt}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>

        {/* Bottom Floating Trigger for Users Drawer */}
        <TouchableOpacity
          style={styles.drawerTrigger}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.drawerTriggerContent}>
            <Users size={18} color="#10b981" />
            <Text style={styles.drawerTriggerText}>
              Active Fleet List ({activeUsers.length})
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
                <Text style={styles.sheetTitle}>Active Users ({activeUsers.length})</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={activeUsers}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <View style={styles.userCard}>
                  <View style={styles.userInfoCol}>
                    <View style={styles.userNameRow}>
                      <View style={styles.liveDot} />
                      <Text style={styles.userCardName}>{item.username}</Text>
                    </View>
                    <Text style={styles.userCardCoords}>
                      {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </Text>
                    <Text style={styles.userCardTime}>Last update: {item.updatedAt}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.locateBtn}
                    onPress={() => handleLocateUser(item)}
                  >
                    <Navigation2 size={14} color="#3b82f6" />
                    <Text style={styles.locateBtnText}>Locate</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No users reporting location right now.</Text>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>
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
    fontSize: 12,
  },
  statusBadge: {
    backgroundColor: '#0f172a',
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
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
  map: {
    width: '100%',
    height: '100%',
  },
  userMarkerBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  calloutCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 140,
  },
  calloutUser: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: 13,
  },
  calloutCoords: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  calloutTime: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
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
    maxHeight: '60%',
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
    fontSize: 16,
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
    backgroundColor: '#10b981',
  },
  userCardName: {
    color: '#f8fafc',
    fontWeight: 'bold',
    fontSize: 14,
  },
  userCardCoords: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  userCardTime: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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
