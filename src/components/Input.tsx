import React from 'react';
import { TextInput, StyleSheet, TextInputProps, View, Text } from 'react-native';
import { COLORS } from '../constants/theme';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const AppInput = ({ label, error, style, ...props }: AppInputProps) => {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput 
        {...props} 
        style={[
          styles.input, 
          error ? styles.inputError : null,
          style
        ]} 
        placeholderTextColor="#999"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    fontSize: 16,
    color: COLORS.dark,
    minHeight: 52,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },
});