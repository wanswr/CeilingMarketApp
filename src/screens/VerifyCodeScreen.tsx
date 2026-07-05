import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';

export default function VerifyCodeScreen({ navigation }: any) {
  const [code, setCode] = useState('');
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
          <Text style={styles.title}>Подтверждение</Text>
          <AppInput label="Код" value={code} onChangeText={setCode} />
          <Button title="Войти" onPress={() => navigation.replace('MainTabs')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 12 }
});
