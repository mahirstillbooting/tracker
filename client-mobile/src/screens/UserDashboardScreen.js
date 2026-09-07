import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import { LogOut, User, Radio, MapPin, Navigation } from 'lucide-react-native';
import { API_URL } from '../config';

export default function UserDashboardScreen({ user, onLogout }) {
  const [location, setLocation] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const socketRef = useRef(null);
  const locationSubRef = useRef(null);
  const mapRef = useRef(null);

  // Default region: Bangladesh center
  const [region, setRegion] = useState({
    latitude: 23.6850,
    longitude: 90.3563,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  useEffect(() => {
    // 1. Connect Socket.io to backend
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Mobile socket connected:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Mobile socket disconnected');
      setIsConnected(false);
    });

    // 2. Request Location Permission and Watch Position
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
          return;
        }

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 3,
          },
          (loc) => {
            const { latitude, longitude } = loc.coords;
            const newPos = { latitude, longitude };
            setLocation(newPos);

            // Animate map camera to user position
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude,
                longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              });
            }

            // Emit live location update to Socket.io backend server
            if (socketRef.current) {
              socketRef.current.emit('update-location', {
                userId: user.id,
                latitude,
                longitude,
              });
            }
          }
        );
        locationSubRef.current = sub;
      } catch (err) {
        console.error('Mobile location watch error:', err);
        setErrorMsg('Failed to initialize location watch');
      }
    })();

    // Cleanup subscription & socket connection on unmount / logout
    return () => {
      if (locationSubRef.current) {
        locationSubRef.current.remove();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <View style={styles.userInfo}>
          <View style={styles.userIconBadge}>
            <User size={16} color="#3b82f6" />
          </View>
          <View>
            <Text style={styles.userName}>{user.username}</Text>
            <Text style={styles.userRole}>{user.role.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.rightActions}>
          {/* Socket Status Indicator */}
          <View style={styles.statusBadge}>
            <Radio size={14} color={isConnected ? '#10b981' : '#ef4444'} />
            <Text style={[styles.statusText, { color: isConnected ? '#10b981' : '#ef4444' }]}>
              {isConnected ? 'Live' : 'Offline'}
            </Text>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <LogOut size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map View with Standard OpenStreetMap Tile Overlay */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          showsUserLocation={false}
        >
          {/* Clean Standard OpenStreetMap Tiles */}
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />

          {location && (
            <Marker coordinate={location} title="My Current Location">
              <View style={styles.markerContainer}>
                <View style={styles.markerBadge}>
                  <MapPin size={22} color="#ffffff" />
                </View>
              </View>
            </Marker>
          )}
        </MapView>

        {/* Live Coordinate Card Overlay */}
        {location && (
          <View style={styles.coordCard}>
            <Navigation size={18} color="#3b82f6" />
            <View style={styles.coordTextContainer}>
              <Text style={styles.coordTitle}>Tracking Active</Text>
              <Text style={styles.coordValue}>
                Lat: {location.latitude.toFixed(5)} | Lng: {location.longitude.toFixed(5)}
              </Text>
            </View>
          </View>
        )}
      </View>
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
    zIndex: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  userName: {
    fontSize: 14,
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
    gap: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
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
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
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
