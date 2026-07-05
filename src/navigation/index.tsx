import React from 'react';
import { TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { TouchableOpacity, createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, useAuth } from '../context/AuthContext';

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
  const { user, loading } = useAuth();

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
