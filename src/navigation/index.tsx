import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

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
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        const userDoc = await getDoc(doc(db, "users", u.uid));
        setNeedsProfile(!userDoc.exists());
        setUser(u);
      } else {
        setUser(null);
        setNeedsProfile(false);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <View style={{flex:1, justifyContent:"center"}}><ActivityIndicator size="large" color="#5856D6"/></View>;

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