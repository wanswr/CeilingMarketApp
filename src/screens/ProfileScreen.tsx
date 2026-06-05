import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { orderService } from '../services/OrderService';
import { auth, db } from '../services/firebase';
import { UserProfile } from '../types';

const ProfileScreen = ({ navigation }: any) => {
  const [role, setRole] = useState(orderService.getCurrentRole());
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const sync = (r: any) => setRole(r);
    orderService.on('roleChanged', sync);

    if (auth.currentUser) {
      const unsub = db.collection("users").doc(auth.currentUser.uid).onSnapshot(doc => {
        if (doc.exists) setProfile(doc.data() as UserProfile);
      });
      return () => {
        orderService.off('roleChanged', sync);
        unsub();
      };
    }
    return () => { orderService.off('roleChanged', sync); };
  }, []);

  const toggle = () => {
    const next = role === 'employer' ? 'worker' : 'employer';
    orderService.setRole(next);
    Alert.alert("Роль изменена", `Вы вошли как ${next === 'employer' ? 'Заказчик' : 'Мастер'}`);
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", onPress: () => auth.signOut(), style: "destructive" }
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
          <View style={[styles.avatarContainer, { borderColor: role === 'employer' ? COLORS.secondary : COLORS.primary }]}>
            {profile?.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            ) : (
              <Ionicons name="person" size={50} color="#ccc" />
            )}
            {profile?.isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{profile?.name || 'Имя не указано'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{role === 'employer' ? 'ЗАКАЗЧИК' : 'МАСТЕР'}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile?.rating ? (Number(profile.rating) * 2).toFixed(1) : '10.0'}</Text>
            <Text style={styles.statLabel}>Рейтинг</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{profile?.experience || '0'}</Text>
            <Text style={styles.statLabel}>Лет опыта</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{role === 'employer' ? profile?.ordersCount || 0 : profile?.completedOrders || 0}</Text>
            <Text style={styles.statLabel}>{role === 'employer' ? 'Заказов' : 'Выполнено'}</Text>
          </View>
        </View>

        <View style={styles.socialIcons}>
          {profile?.instagram && (
            <TouchableOpacity onPress={() => Linking.openURL(`https://instagram.com/${profile?.instagram?.replace('@', '')}`)}>
              <Ionicons name="logo-instagram" size={28} color="#E1306C" style={{ marginHorizontal: 15 }} />
            </TouchableOpacity>
          )}
          {profile?.telegram && (
            <TouchableOpacity onPress={() => Linking.openURL(`https://t.me/${profile?.telegram?.replace('@', '')}`)}>
              <Ionicons name="send" size={28} color="#0088cc" style={{ marginHorizontal: 15 }} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.btn} onPress={toggle}>
        <Text>Сменить роль</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { marginTop: 0 }]} onPress={() => navigation.navigate('Subscription')}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="card-outline" size={20} color={COLORS.success} style={{ marginRight: 10 }} />
          <Text style={{ fontWeight: '700' }}>Активировать подписку</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { marginTop: 0 }]} onPress={() => navigation.navigate('Verification')}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.secondary} style={{ marginRight: 10 }} />
          <Text>Пройти верификацию</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { marginTop: 0 }]} onPress={() => navigation.navigate('InviteFriends')}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="people-outline" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <Text>Пригласить коллег</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { marginTop: 0 }]} onPress={() => Linking.openURL('https://ceilingsapp.example.com/privacy')}>
        <Text style={{ color: COLORS.gray, fontSize: 12 }}>Политика конфиденциальности</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { marginTop: 0 }]} onPress={handleLogout}>
        <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#fff', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  avatarContainer: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderWidth: 3, position: 'relative' },
  avatar: { width: '100%', height: '100%', borderRadius: 55 },
  verifiedBadge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#fff', borderRadius: 12 },
  name: { fontSize: 22, fontWeight: '800', marginTop: 15, color: COLORS.dark },
  roleBadge: { backgroundColor: COLORS.bgLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  roleText: { fontSize: 10, fontWeight: '900', color: COLORS.gray, letterSpacing: 1 },
  statsContainer: { flexDirection: 'row', marginTop: 25, width: '100%', paddingHorizontal: 20 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border, alignSelf: 'center' },
  socialIcons: { flexDirection: 'row', marginTop: 25 },
  btn: { marginHorizontal: 20, marginTop: 15, padding: 18, backgroundColor: '#fff', borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 }
});
export default ProfileScreen;