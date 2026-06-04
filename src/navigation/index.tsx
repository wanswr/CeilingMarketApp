import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { db, auth } from '../services/firebase';
import { orderService } from '../services/OrderService';

import BottomTabNavigator from './BottomTabNavigator';
import LoginScreen from '../screens/LoginScreen';
import VerifyCodeScreen from '../screens/VerifyCodeScreen';
import RegisterDetailsScreen from '../screens/RegisterDetailsScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';

const Stack = createStackNavigator();

export default function Navigation() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: any;

    const unsubscribeAuth = auth.onAuthStateChanged(async (u: any) => {
      if (u) {
        // @ts-ignore
        unsubscribeProfile = db.collection("users").doc(u.uid).onSnapshot((docSnap: any) => {
          if (docSnap.exists) {
            setNeedsProfile(false);
            const data = docSnap.data();
            if (data.role) {
              orderService.setRole(data.role);
            }
          } else {
            setNeedsProfile(true);
          }
          setUser(u);
          setLoading(false);
        }, (err: any) => {
          console.warn("Profile Listener Error:", err);
          setLoading(false);
        });
      } else {
        if (unsubscribeProfile) unsubscribeProfile();
        setUser(null);
        setNeedsProfile(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  if (loading) return <View style={{flex:1, justifyContent:'center'}}><ActivityIndicator size="large" color="#5856D6"/></View>;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
        </>
      ) : needsProfile ? (
        <>
          <Stack.Screen name="RegisterDetails" component={RegisterDetailsScreen} />
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
          <Stack.Screen 
            name="OrderDetail" 
            component={OrderDetailScreen} 
            options={{headerShown: true, title: 'Заказ'}} 
          />
        </>
      )}
    </Stack.Navigator>
  );
}
