import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import { LogOut, User, Navigation, Radio, MapPin, AlertTriangle } from 'lucide-react';
import { userIcon } from '../utils/leafletFix';
import UserChatWidget from './UserChatWidget';

import { SOCKET_SERVER_URL, SOCKET_OPTIONS } from '../config';

function MapRecenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 16, { animate: true });
    }
  }, [position, map]);
  return null;
}

export default function UserDashboard({ user, onLogout }) {
  const defaultPos = [23.6850, 90.3563];
  const [position, setPosition] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, SOCKET_OPTIONS);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      setIsConnected(true);
      socket.emit('join-room', { userId: user.id, role: 'user' });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setPosition([lat, lng]);
          setGeoError(null);

          socket.emit('update-location', {
            userId: user.id,
            latitude: lat,
            longitude: lng,
          });
        },
        (err) => {
          console.error('Geolocation error:', err);
          setGeoError(err.message || 'Unable to fetch location');
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    } else {
      setGeoError('Geolocation is not supported by your browser');
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  const mapCenter = position || defaultPos;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 font-sans overflow-hidden">
      {/* Sleek Dark Responsive Top Bar */}
      <header className="min-h-16 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 z-20 shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 sm:p-2 bg-blue-600/10 border border-blue-500/20 text-blue-500 rounded-xl">
            <Navigation className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Tracker Dashboard</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-400">User Portal</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs">
            <User className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-slate-100 text-xs">{user.username}</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] uppercase font-bold">
              {user.role}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <Radio
              className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`}
            />
            <span className="font-medium text-xs">
              {isConnected ? (
                <span className="text-emerald-400">Online</span>
              ) : (
                <span className="text-red-400">Offline</span>
              )}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl text-xs font-semibold transition-all duration-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Map Container */}
      <main className="flex-1 relative w-full h-full">
        {geoError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-amber-950/90 border border-amber-800 text-amber-300 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Geolocation Note: {geoError}</span>
          </div>
        )}

        <MapContainer
          center={mapCenter}
          zoom={position ? 16 : 7}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {position && <MapRecenter position={position} />}

          {position && (
            <Marker position={position} icon={userIcon}>
              <Popup>
                <div className="p-1 text-slate-900 font-sans text-xs">
                  <div className="font-bold flex items-center gap-1 text-blue-600">
                    <MapPin className="w-4 h-4" />
                    <span>My Location</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-700">
                    Lat: {position[0].toFixed(5)} <br />
                    Lng: {position[1].toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Floating Chat Widget */}
        <UserChatWidget user={user} socket={socketRef.current} />
      </main>
    </div>
  );
}
