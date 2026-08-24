import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';

export type MascotState = 'idle' | 'listening' | 'thinking' | 'success' | 'question';

interface Props {
  state?: MascotState;
  size?: number;
}

export const AssistantMascot: React.FC<Props> = ({ state = 'idle', size = 50 }) => {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -4,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    floatLoop.start();
    pulseLoop.start();

    return () => {
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, []);

  const getAuraColor = () => {
    switch (state) {
      case 'listening':
        return '#34C759'; // Green
      case 'thinking':
        return '#FF9500'; // Orange
      case 'success':
        return '#30B0C7'; // Teal
      case 'question':
        return '#AF52DE'; // Purple
      case 'idle':
      default:
        return '#007AFF'; // Blue
    }
  };

  const getBadgeIcon = () => {
    switch (state) {
      case 'listening':
        return '🎙';
      case 'thinking':
        return '⚙';
      case 'success':
        return '✓';
      case 'question':
        return '❓';
      default:
        return null;
    }
  };

  const auraColor = getAuraColor();
  const badgeIcon = getBadgeIcon();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ translateY: floatAnim }, { scale: pulseAnim }],
        },
      ]}
    >
      <View
        style={[
          styles.outerAura,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: `${auraColor}20`,
            borderColor: `${auraColor}40`,
          },
        ]}
      >
        <View
          style={[
            styles.innerCore,
            {
              width: size * 0.72,
              height: size * 0.72,
              borderRadius: (size * 0.72) / 2,
              backgroundColor: auraColor,
            },
          ]}
        >
          {/* Eyes */}
          <View style={styles.faceRow}>
            <View
              style={[
                styles.eye,
                {
                  width: size * 0.12,
                  height: size * 0.12,
                  borderRadius: (size * 0.12) / 2,
                },
              ]}
            />
            <View
              style={[
                styles.eye,
                {
                  width: size * 0.12,
                  height: size * 0.12,
                  borderRadius: (size * 0.12) / 2,
                },
              ]}
            />
          </View>

          {/* Smile */}
          <View
            style={[
              styles.smile,
              {
                width: size * 0.22,
                height: size * 0.08,
                borderRadius: size * 0.04,
              },
            ]}
          />
        </View>

        {/* State Badge Overlay */}
        {badgeIcon ? (
          <View
            style={[
              styles.badge,
              {
                right: -2,
                top: -2,
                width: size * 0.36,
                height: size * 0.36,
                borderRadius: (size * 0.36) / 2,
              },
            ]}
          >
            <Text style={{ fontSize: size * 0.2 }}>{badgeIcon}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerAura: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  innerCore: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  faceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '45%',
    marginBottom: 2,
  },
  eye: {
    backgroundColor: '#FFF',
  },
  smile: {
    backgroundColor: '#FFF',
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
