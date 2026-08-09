import { StyleSheet, TouchableOpacity, View } from 'react-native';
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

import DashboardScreen from '../screens/DashboardScreen';
import CreateOrderScreen from '../screens/CreateOrderScreen';
import MapScreen from '../screens/MapScreen';
import OrdersListScreen from '../screens/OrdersListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatListScreen from '../screens/ChatListScreen';
import { COLORS } from '../constants/theme'
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/ApiService';
import { socketService } from '../services/SocketService';
import { useState, useEffect, useRef } from 'react';
import RoleTabIcon from '../components/RoleTabIcon';
import RoleSwitchMenu from '../components/RoleSwitchMenu';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { useRoleSwitch } from '../hooks/useRoleSwitch';

const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  const { user } = useAuth();
  const isEmployer = user?.role === 'EMPLOYER';
  const [unreadCount, setUnreadCount] = useState(0);
  const { switchRole, isSwitching } = useRoleSwitch();

  const profileTabRef = useRef<any>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  let profileTitle = 'Профиль';
  if (user?.role === 'EMPLOYER') profileTitle = 'Заказчик';
  else if (user?.role === 'WORKER') profileTitle = 'Мастер';

  const fetchUnreadCount = async () => {
    try {
      const res = await apiService.getMyChats();
      const total = res.data.reduce((sum: number, chat: any) => sum + (chat.unreadCount || 0), 0);
      setUnreadCount(total);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();

    socketService.on('chat.update', fetchUnreadCount);
    socketService.on('message.new', fetchUnreadCount);
    socketService.on('message.read', fetchUnreadCount);

    return () => {
        socketService.off('chat.update', fetchUnreadCount);
        socketService.off('message.new', fetchUnreadCount);
        socketService.off('message.read', fetchUnreadCount);
    };
  }, [user]);

  return (
    <>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Dashboard') return null; // Rendered via custom tabBarButton
          else if (route.name === 'Create') iconName = focused ? 'add-circle' : 'add-circle-outline';
          else if (route.name === 'Map') iconName = focused ? 'map' : 'map-outline';
          else if (route.name === 'Orders') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Chats') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'Profile') {
            return <RoleTabIcon role={user?.role} focused={focused} size={size} color={color} />;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: 'gray',
        headerShown: true })}
    >
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Карта' }} />
      <Tab.Screen name="Orders" component={OrdersListScreen} options={{ title: 'Мои Заказы' }} />
      {isEmployer && (
        <Tab.Screen name="Create" component={CreateOrderScreen} options={{ title: 'Создать' }} />
      )}
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Главная',
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              style={[props.style, styles.centralTabButton]}
              activeOpacity={0.8}
            >
              <View style={[styles.centralTabButtonInner, props.accessibilityState?.selected && styles.centralTabButtonInnerActive]}>
                <Ionicons
                  name={props.accessibilityState?.selected ? "grid" : "grid-outline"}
                  size={24}
                  color={props.accessibilityState?.selected ? "#fff" : COLORS.primary}
                />
              </View>
            </TouchableOpacity>
          )
        }}
      />
      <Tab.Screen
        name="Chats"
        component={ChatListScreen}
        options={{
          title: 'Чаты',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: profileTitle,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              ref={profileTabRef}
              activeOpacity={0.8}
              onPress={(e) => {
                if (props.onPress) {
                  props.onPress(e);
                }
              }}
              onLongPress={() => {
                if (!user?.role || isSwitching) return;

                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                profileTabRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
                  setAnchor({ x, y, width, height });
                  setMenuVisible(true);
                });
              }}
            />
          )
        }}
      />
    </Tab.Navigator>
      <RoleSwitchMenu
        visible={menuVisible}
        anchor={anchor}
        currentRole={user?.role ? (user.role.toUpperCase() as any) : null}
        onClose={() => setMenuVisible(false)}
        onSelect={async (role) => {
          try {
            await switchRole(role);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err) {
            // error alert is already shown inside useRoleSwitch
          }
        }}
      />
    </>
  );
};

export default BottomTabNavigator;

const styles = StyleSheet.create({
  centralTabButton: {
    top: -10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centralTabButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#F1F5F9',
    shadowColor: '#2D5BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  centralTabButtonInnerActive: {
    backgroundColor: '#2D5BFF',
    borderColor: '#E0E7FF',
    transform: [{ scale: 1.05 }],
  }
});