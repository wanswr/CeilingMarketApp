import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { auth, db } from '../services/firebase';

import BottomTabNavigator from './BottomTabNavigator';
import LoginScreen from '../screens/LoginScreen';
import VerifyCodeScreen from '../screens/VerifyCodeScreen';
import RegisterDetailsScreen from '../screens/RegisterDetailsScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import EditOrderScreen from '../screens/EditOrderScreen';

const Stack = createStackNavigator();

export default function Navigation() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (u) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (u) {
        unsubscribeUserDoc = db.collection("users").doc(u.uid).onSnapshot((doc) => {
          if (doc.exists) {
            const data = doc.data();
            setNeedsProfile(false);
            setNeedsRole(!data?.role);
          } else {
            setNeedsProfile(true);
            setNeedsRole(false);
          }
          setUser(u);
          setLoading(false);
        }, (err) => {
          console.error("User Doc Error:", err);
          setUser(u);
          setLoading(false);
        });
      } else {
        setUser(null);
        setNeedsProfile(false);
        setNeedsRole(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
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
      ) : (needsProfile || needsRole) ? (
        <>
          {needsProfile && <Stack.Screen name="RegisterDetails" component={RegisterDetailsScreen} />}
          {needsRole && <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />}
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
          <Stack.Screen 
            name="OrderDetail" 
            component={OrderDetailScreen} 
            options={{headerShown: true, title: 'Заказ'}} 
          />
          <Stack.Screen
            name="EditOrder"
            component={EditOrderScreen}
            options={{headerShown: true, title: 'Редактирование'}}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
