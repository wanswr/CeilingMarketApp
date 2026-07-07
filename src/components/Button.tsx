import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS, GRADIENTS } from '../constants/theme'

interface ButtonProps {
  title: string;
  onPress: () => void;
  style?: any;
  textStyle?: any;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
  disabled,
  loading,
  variant = 'primary'
}) => {
  const isOutline = variant === 'outline';

  const getColors = () => {
    if (disabled) return [COLORS.gray, COLORS.gray];
    if (variant === 'danger') return [COLORS.danger, COLORS.danger];
    return GRADIENTS.button;
  };

  const Container: any = isOutline ? TouchableOpacity : LinearGradient;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.touchable, style]}
    >
      <Container
        colors={getColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.button,
          isOutline && styles.outline,
          disabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isOutline ? COLORS.primary : COLORS.white} />
        ) : (
          <Text style={[
            styles.text,
            isOutline && styles.outlineText,
            textStyle
          ]}>
            {title}
          </Text>
        )}
      </Container>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    width: '100%',
    marginTop: 10 },
  button: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56 },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.primary },
  disabled: {
    opacity: 0.6 },
  text: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5 },
  outlineText: {
    color: COLORS.primary } });
