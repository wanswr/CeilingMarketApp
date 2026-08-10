import AppIcon from './AppIcon';
import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { COLORS } from '../constants/theme';

interface RoleSwitchMenuProps {
  visible: boolean;
  anchor: { x: number; y: number; width: number; height: number } | null;
  currentRole: 'WORKER' | 'EMPLOYER' | null | undefined;
  onSelect: (role: 'WORKER' | 'EMPLOYER') => void;
  onClose: () => void;
}

const MENU_WIDTH = 180;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RoleSwitchMenu({
  visible,
  anchor,
  currentRole,
  onSelect,
  onClose,
}: RoleSwitchMenuProps) {
  const animOpacity = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(animOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(animScale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      animOpacity.setValue(0);
      animScale.setValue(0.9);
    }
  }, [visible]);

  if (!visible || !anchor) return null;

  // Calculate coordinates to place the menu above the tab icon
  const menuBottom = SCREEN_HEIGHT - anchor.y + 8;
  const menuLeftRaw = anchor.x + anchor.width / 2 - MENU_WIDTH / 2;
  // Ensure the menu stays within screen boundaries
  const menuLeft = Math.max(12, Math.min(menuLeftRaw, SCREEN_WIDTH - MENU_WIDTH - 12));

  const handleSelect = (role: 'WORKER' | 'EMPLOYER') => {
    if (currentRole === role) {
      onClose();
      return;
    }
    onSelect(role);
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType="none"
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.menuCard,
            {
              bottom: menuBottom,
              left: menuLeft,
              opacity: animOpacity,
              transform: [{ scale: animScale }],
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.menuItem,
              currentRole === 'WORKER' && styles.menuItemActive,
            ]}
            onPress={() => handleSelect('WORKER')}
          >
            <View style={styles.itemLeft}>
              <Text style={styles.itemEmoji}>🔨</Text>
              <Text
                style={[
                  styles.itemText,
                  currentRole === 'WORKER' && styles.itemTextActive,
                ]}
              >
                Мастер
              </Text>
            </View>
            {currentRole === 'WORKER' && (
              <AppIcon name="sys-check" size={18} color={COLORS.primary} />
            )}
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            style={[
              styles.menuItem,
              currentRole === 'EMPLOYER' && styles.menuItemActive,
            ]}
            onPress={() => handleSelect('EMPLOYER')}
          >
            <View style={styles.itemLeft}>
              <Text style={styles.itemEmoji}>💼</Text>
              <Text
                style={[
                  styles.itemText,
                  currentRole === 'EMPLOYER' && styles.itemTextActive,
                ]}
              >
                Заказчик
              </Text>
            </View>
            {currentRole === 'EMPLOYER' && (
              <AppIcon name="sys-check" size={18} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  menuCard: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  menuItemActive: {
    backgroundColor: 'rgba(45, 91, 255, 0.06)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemEmoji: {
    fontSize: 16,
    marginRight: 10,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  itemTextActive: {
    color: COLORS.primary,
  },
  separator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 12,
  },
});
