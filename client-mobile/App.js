import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AuthScreen from './src/screens/AuthScreen';
import UserDashboard from './src/screens/UserDashboard';
import AdminDashboard from './src/screens/AdminDashboard';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore persistent user session from AsyncStorage on app launch
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('tracker_token');
        const savedUser = await AsyncStorage.getItem('tracker_user');

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (e) {
        console.error('Failed to load session from AsyncStorage:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLoginSuccess = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('tracker_token');
      await AsyncStorage.removeItem('tracker_user');
    } catch (e) {
      console.error('Failed to clear AsyncStorage:', e);
    }
    setUser(null);
    setToken(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!user || !token ? (
            <Stack.Screen name="Auth">
              {(props) => <AuthScreen {...props} onLoginSuccess={handleLoginSuccess} />}
            </Stack.Screen>
          ) : user.role === 'admin' ? (
            <Stack.Screen name="AdminDashboard">
              {(props) => <AdminDashboard {...props} user={user} onLogout={handleLogout} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="UserDashboard">
              {(props) => <UserDashboard {...props} user={user} onLogout={handleLogout} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
