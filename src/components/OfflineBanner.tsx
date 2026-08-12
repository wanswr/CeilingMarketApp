import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useIsOnline } from '../hooks/useIsOnline';
import { COLORS } from '../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { paddingTop: Math.max(insets.top, 10) }]}>
      <Text style={styles.text}>
        Офлайн-режим — изменения будут синхронизированы автоматически
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.accent || '#FF6B6B',
    paddingBottom: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    zIndex: 9999,
    position: 'absolute',
    top: 0,
    left: 0,
    elevation: 5,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
