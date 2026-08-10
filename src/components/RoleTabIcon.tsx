import AppIcon from './AppIcon';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../constants/theme';

interface RoleTabIconProps {
  role: 'WORKER' | 'EMPLOYER' | null | undefined;
  focused: boolean;
  size: number;
  color: string;
}

export default function RoleTabIcon({ role, focused, size, color }: RoleTabIconProps) {
  const baseIcon = 'tab-profile';

  if (!role) {
    return <AppIcon name={baseIcon} size={size} color={color} focused={focused} />;
  }

  const isWorker = role === 'WORKER';
  const badgeBg = isWorker ? '#00C897' : '#ff9067';
  const badgeIcon = isWorker ? 'role-worker' : 'role-employer';

  return (
    <View style={styles.container}>
      <AppIcon name={baseIcon} size={size} color={color} focused={focused} />
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <AppIcon name={badgeIcon} size={8} color="#fff" focused={focused} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: -3,
    right: -4,
    width: 15,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
});
