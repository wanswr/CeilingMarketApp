import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../services/ApiService';

import BottomTabNavigator from './BottomTabNavigator';
import LoginScreen from '../screens/LoginScreen';
import VerifyCodeScreen from '../screens/VerifyCodeScreen';
import RegisterDetailsScreen from '../screens/RegisterDetailsScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import EditOrderScreen from '../screens/EditOrderScreen';
import InviteFriendsScreen from '../screens/InviteFriendsScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import VerificationScreen from '../screens/VerificationScreen';
import EditProfileScreen from '../screens/EditProfileScreen';

const Stack = createStackNavigator();

export default function Navigation() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        const response = await apiService.getProfile();
        setUser(response.data);
      }
    } catch (e) {
      console.error("Auth check failed:", e);
      await AsyncStorage.removeItem('userToken');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <View style={{flex:1, justifyContent:'center'}}><ActivityIndicator size="large" color="#5856D6"/></View>;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
        </>
      ) : !user.role ? (
        <>
          <Stack.Screen name="RegisterDetails" component={RegisterDetailsScreen} />
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{headerShown: true, title: 'Заказ'}} />
          <Stack.Screen name="EditOrder" component={EditOrderScreen} options={{headerShown: true, title: 'Редактирование'}} />
          <Stack.Screen name="InviteFriends" component={InviteFriendsScreen} options={{headerShown: true, title: 'Пригласить друзей'}} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{headerShown: true, title: 'Подписка'}} />
          <Stack.Screen name="Verification" component={VerificationScreen} options={{headerShown: true, title: 'Верификация'}} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{headerShown: true, title: 'Редактировать профиль'}} />
        </>
      )}
    </Stack.Navigator>
  );
}
