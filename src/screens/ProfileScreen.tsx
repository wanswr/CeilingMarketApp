import React, { useState, useEffect } from 'react';

import { TouchableOpacity,  View,
 Text,
 StyleSheet,

 Alert,
 ActivityIndicator,
 Image,
 ScrollView,
 Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { mapEngine } from '../services/MapEngine';
import { useAuth } from '../context/AuthContext';
import { storageService } from '../services/StorageService';
import { COLORS, SHADOWS } from '../constants/theme';
import { Button } from '../components/Button';

const ProfileScreen = ({ route, navigation }: any) => {
  const userId = route.params?.userId;
  const { updateUser, signOut } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [switchingRole, setSwitchingRole] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async (force: boolean = false) => {
    try {
      const responseData = userId
        ? await mapEngine.getExternalUser(userId)
        : await mapEngine.syncUser(force);
      setUser(responseData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = async () => {
    if (userId) return; // Cannot toggle role for external user
    const newRole = user?.role === 'EMPLOYER' ? 'WORKER' : 'EMPLOYER';

    setSwitchingRole(true);
    try {
      const updatedUser = await mapEngine.updateProfile({ role: newRole });
      setUser(updatedUser);
      updateUser(updatedUser);
      Alert.alert('Роль изменена', `Теперь вы используете приложение как ${newRole === 'EMPLOYER' ? 'Заказчик' : 'Исполнитель'}`);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сменить роль');
    } finally {
      setSwitchingRole(false);
    }
  };

  const handleLogout = () => {
    storageService.clearAll();
    signOut();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }] });
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={COLORS.primary} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {userId && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <BlurView intensity={80} tint="light" style={styles.backBtnBlur}>
            <Ionicons name="chevron-back" size={24} color={COLORS.dark} />
          </BlurView>
        </TouchableOpacity>
      )}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
             <View style={styles.avatarWrapper}>
                <Text style={styles.avatarText}>{user?.name ? user.name[0] : 'U'}</Text>
             </View>
             {user?.isVerified && (
               <View style={styles.verifiedBadge}>
                 <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
               </View>
             )}
          </View>

          <Text style={styles.name}>{user?.name || 'Пользователь'}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
              <Text style={styles.statLabel}>Рейтинг</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.completedOrders || 0}</Text>
              <Text style={styles.statLabel}>Заказы</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.experience || 0}</Text>
              <Text style={styles.statLabel}>Опыт (лет)</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {!userId && (
            <>
              <Text style={styles.sectionTitle}>Текущая роль</Text>
              <TouchableOpacity
                style={styles.roleCard}
                onPress={toggleRole}
                disabled={switchingRole}
              >
                <View style={[styles.iconBox, { backgroundColor: user?.role === 'EMPLOYER' ? 'rgba(45, 91, 255, 0.1)' : 'rgba(16, 185, 129, 0.1)' }]}>
                  <Ionicons
                    name={user?.role === 'EMPLOYER' ? "briefcase" : "construct"}
                    size={20}
                    color={user?.role === 'EMPLOYER' ? COLORS.primary : "#10B981"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuText}>
                    {user?.role === 'EMPLOYER' ? 'Я Заказчик' : 'Я Исполнитель'}
                  </Text>
                  <Text style={styles.menuSubtext}>Нажмите, чтобы переключить</Text>
                </View>
                {switchingRole ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="swap-horizontal" size={20} color={COLORS.placeholder} />
                )}
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.sectionTitle}>Управление</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('EditProfile')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(45, 91, 255, 0.1)' }]}>
                <Ionicons name="person" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.menuText}>Личные данные</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Subscription')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(130, 87, 229, 0.1)' }]}>
                <Ionicons name="card" size={20} color={COLORS.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>Подписка</Text>
                <Text style={[styles.menuSubtext, { color: user?.subscription?.isActive ? COLORS.success : COLORS.danger }]}>
                  {user?.subscription?.isActive ? 'Активна' : 'Не активна'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('В разработке')}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(0, 200, 151, 0.1)' }]}>
                <Ionicons name="list" size={20} color={COLORS.success} />
              </View>
              <Text style={styles.menuText}>История заказов</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
             <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
             <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>

          <Text style={styles.version}>Версия 2.4.0 (2026.1)</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 20,
    zIndex: 100
  },
  backBtnBlur: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)'
  },
  profileHeader: { alignItems: 'center', paddingTop: 40, paddingBottom: 30, backgroundColor: COLORS.white, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, ...SHADOWS.soft },
  avatarContainer: { position: 'relative', marginBottom: 20 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: '900' },
  verifiedBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.white, borderRadius: 12, padding: 2, ...SHADOWS.soft },
  name: { fontSize: 24, fontWeight: '900', color: COLORS.dark, letterSpacing: -0.5 },
  phone: { fontSize: 15, color: COLORS.gray, marginTop: 4, fontWeight: '500' },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 25, paddingHorizontal: 30 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  statDivider: { width: 1, height: 24, backgroundColor: COLORS.border, marginHorizontal: 10 },
  content: { padding: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, marginBottom: 16, marginTop: 10, letterSpacing: -0.5 },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    marginBottom: 20,
    ...SHADOWS.soft
  },
  menuCard: { backgroundColor: COLORS.white, borderRadius: 28, padding: 10, ...SHADOWS.soft },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  menuText: { flex: 1, fontSize: 16, fontWeight: '600', color: COLORS.dark },
  menuSubtext: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 30, padding: 20, borderRadius: 20, backgroundColor: 'rgba(255, 71, 87, 0.05)' },
  logoutText: { marginLeft: 10, fontSize: 16, fontWeight: '700', color: COLORS.danger },
  version: { textAlign: 'center', marginTop: 30, color: COLORS.placeholder, fontSize: 12, fontWeight: '500' }
});

export default ProfileScreen;
