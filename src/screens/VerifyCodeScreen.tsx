import React, { useState } from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { Button } from '../components/Button';
import { AppInput } from '../components/Input';

export default function VerifyCodeScreen({ route, navigation }: any) {
  const { phoneNumber, confirmResult } = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try { await confirmResult.confirm(code); } 
    catch (err) { Alert.alert("Ошибка", "Неверный код"); } 
    finally { setLoading(false); }
  };

  return (
    <View style={{flex:1, padding:30, justifyContent:'center', backgroundColor:'#fff'}}>
      <Text style={{fontSize:24, fontWeight:'bold'}}>Код из SMS</Text>
      <AppInput label="Введите 6 цифр" value={code} onChangeText={(t:any) => { setCode(t); if(t.length === 6) handleVerify(); }} keyboardType="number-pad" maxLength={6} autoFocus />
      {loading ? <ActivityIndicator size="large" color="#5856D6" /> : <Button title="Войти" onPress={handleVerify} />}
    </View>
  );
}