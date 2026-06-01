import React, { useState } from 'react';
import { TextInput, StyleSheet, TextInputProps, View, Text, Animated } from 'react-native';
import { COLORS } from '../constants/theme';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const AppInput = ({ label, error, style, icon, ...props }: AppInputProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, isFocused && {color: COLORS.primary}]}>{label}</Text> : null}
      <View style={[
        styles.inputWrapper,
        isFocused && styles.inputFocused,
        error ? styles.inputError : null
      ]}>
        {icon && <View style={styles.iconWrapper}>{icon}</View>}
        <TextInput
          {...props}
          style={[styles.input, style]}
          placeholderTextColor={COLORS.gray}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 58,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  inputFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.dark,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  iconWrapper: {
    marginRight: 10,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },
});