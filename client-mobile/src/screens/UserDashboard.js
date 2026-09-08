import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  AppState,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import { LogOut, User, Navigation, MessageSquare } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../config';
import ChatModal from '../components/ChatModal';

// Haversine Distance Utility (calculates distance in meters)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const getLeafletHtml = () => `
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
    var map = L.map('map', { zoomControl: false }).setView([23.6850, 90.3563], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var userIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    var userMarker = null;

    window.updateUserLocation = function(lat, lng) {
      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map)
          .bindPopup('<b>You</b><br>Your live location');
        map.setView([lat, lng], 16);
      } else {
        userMarker.setLatLng([lat, lng]);
        map.panTo([lat, lng], { animate: true, duration: 1 });
      }
    };

    window.userMarker = userMarker;
    window.map = map;
  </script>
</body>
</html>
`;

export default function UserDashboard({ user, onLogout }) {
  const insets = useSafeAreaInsets();
  const currentUserId = user.id || user._id;

  // Default coordinates: Bangladesh center [23.6850, 90.3563]
  const [location, setLocation] = useState({ latitude: 23.6850, longitude: 90.3563 });
  const [gpsReady, setGpsReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);

  const socketRef = useRef(null);
  const locationSubRef = useRef(null);
  const webViewRef = useRef(null);
  const lastValidLocation = useRef(null);

  // Helper to inject JavaScript script into Leaflet WebView
  const injectMapLocation = (lat, lng) => {
    if (webViewRef.current) {
      const script = `
        if (window.updateUserLocation) {
          window.updateUserLocation(${lat}, ${lng});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    }
  };

  const startTracking = async () => {
    try {
      // 1. Socket.io initialization (polling first ensures 100% reliable Android HTTP/SSL handshake)
      if (!socketRef.current) {
        const socket = io(API_URL, {
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: 15,
          reconnectionDelay: 1000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[Mobile] Socket connected:', socket.id);
          setIsConnected(true);
          socket.emit('join-room', { userId: currentUserId, role: 'user' });

          if (lastValidLocation.current) {
            socket.emit('update-location', {
              userId: currentUserId,
              latitude: lastValidLocation.current.latitude,
              longitude: lastValidLocation.current.longitude,
            });
          }
        });

        socket.on('disconnect', () => {
          console.log('[Mobile] Socket disconnected');
          setIsConnected(false);
        });
      } else if (!socketRef.current.connected) {
        socketRef.current.connect();
      }

      // 2. Request Foreground Location Permission & Check GPS Services
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert('GPS Disabled', 'Please enable Location Services (GPS) in your phone settings.');
      }

      // 3. Fast Last-Known & One-Shot Position Fix
      try {
        let initialPos = await Location.getLastKnownPositionAsync();
        if (!initialPos) {
          initialPos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }

        if (initialPos && initialPos.coords) {
          const { latitude, longitude } = initialPos.coords;
          console.log(`[Mobile GPS] Immediate fix acquired: [${latitude.toFixed(5)}, ${longitude.toFixed(5)}]`);
          setLocation({ latitude, longitude });
          setGpsReady(true);
          lastValidLocation.current = { latitude, longitude };

          injectMapLocation(latitude, longitude);

          if (socketRef.current) {
            socketRef.current.emit('update-location', {
              userId: currentUserId,
              latitude,
              longitude,
            });
          }
        }
      } catch (oneShotErr) {
        console.warn('[Mobile GPS] Quick fix skipped, relying on watcher:', oneShotErr.message);
      }

      // 4. Continuous Location Watcher
      if (!locationSubRef.current) {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 3,
          },
          (loc) => {
            const { latitude, longitude, accuracy } = loc.coords;

            // Discard extreme outlier noise > 100m
            if (accuracy && accuracy > 100) {
              console.log(`[GPS Filter] Discarded extreme outlier (accuracy: ${accuracy.toFixed(1)}m > 100m)`);
              return;
            }

            console.log(`[GPS Watcher] Accepted location: [${latitude.toFixed(5)}, ${longitude.toFixed(5)}]`);
            const newPos = { latitude, longitude };
            lastValidLocation.current = newPos;
            setLocation(newPos);
            setGpsReady(true);

            injectMapLocation(latitude, longitude);

            if (socketRef.current) {
              socketRef.current.emit('update-location', {
                userId: currentUserId,
                latitude,
                longitude,
              });
            }
          }
        );
        locationSubRef.current = sub;
      }
    } catch (err) {
      console.error('[Mobile] Location tracking error:', err);
    }
  };

  const stopTracking = () => {
    if (locationSubRef.current) {
      console.log('[Mobile] Stopping location watcher');
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    if (socketRef.current) {
      console.log('[Mobile] Disconnecting socket');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  };

  useEffect(() => {
    startTracking();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        startTracking();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        stopTracking();
      }
    });

    return () => {
      subscription.remove();
      stopTracking();
    };
  }, [user]);

  const handleLogoutPress = () => {
    stopTracking();
    onLogout();
  };

  const dynamicTopPadding = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0) + 4;

  return (
    <SafeAreaView style={[styles.container, { paddingTop: dynamicTopPadding }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" translucent={true} />

      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <View style={styles.userInfo}>
          <View style={styles.userIconBadge}>
            <User size={18} color="#3b82f6" />
          </View>
          <View style={styles.userTextCol}>
            <Text style={styles.userName} numberOfLines={1}>{user.username}</Text>
            <Text style={styles.userRole}>{user.role.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.rightActions}>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#10b981' : '#ef4444' },
              ]}
            />
            <Text style={[styles.statusText, { color: isConnected ? '#10b981' : '#ef4444' }]}>
              {isConnected ? 'Online' : 'Offline'}
            </Text>
          </View>

          <TouchableOpacity style={styles.chatBtn} onPress={() => setChatVisible(true)} activeOpacity={0.7}>
            <MessageSquare size={20} color="#3b82f6" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutPress} activeOpacity={0.7}>
            <LogOut size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Map Container */}
      <View style={styles.mapWrapper}>
        {/* Subtle Non-Blocking Floating Acquisition Banner */}
        {!gpsReady && (
          <View style={styles.acquisitionBanner}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.acquisitionText}>Acquiring high-precision GPS...</Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: getLeafletHtml() }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={{ flex: 1, width: '100%', height: '100%' }}
          containerStyle={{ flex: 1 }}
          onLoadEnd={() => {
            if (location) {
              injectMapLocation(location.latitude, location.longitude);
            }
          }}
        />

        {/* Live Coordinate Card Overlay */}
        <View style={styles.coordCard}>
          <Navigation size={18} color="#3b82f6" />
          <View style={styles.coordTextContainer}>
            <Text style={styles.coordTitle}>
              {gpsReady ? 'Live GPS Active (Filtered)' : 'Initializing Location'}
            </Text>
            <Text style={styles.coordValue}>
              Lat: {location.latitude.toFixed(5)} | Lng: {location.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
      </View>

      {/* Chat Modal */}
      <ChatModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        user={user}
        socket={socketRef.current}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'android' ? ((StatusBar.currentHeight || 30) + 6) : 0,
  },
  topBar: {
    minHeight: 64,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 6,
  },
  userIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  userTextCol: {
    flexShrink: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  userRole: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  mapWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  acquisitionBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 1000,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  acquisitionText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  coordCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 8,
  },
  coordTextContainer: {
    flex: 1,
  },
  coordTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  coordValue: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
});
