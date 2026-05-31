import React, { useState } from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { auth } from '../services/firebase';
import { AppInput } from '../components/Input';
import { Button } from '../components/Button';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('+7');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (phone.length < 12) {
      Alert.alert("Ошибка", "Введите номер +79991234567");
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore - In some RN firebase environments, applicationVerifier is handled internally or provided via a global shim
      const result = await auth.signInWithPhoneNumber(phone);
      navigation.navigate('VerifyCode', { phoneNumber: phone, confirmResult: result });
    } catch (err: any) {
      console.error(err);
      Alert.alert("Ошибка", "Не удалось отправить код. " + err.message);
    }
    finally { setLoading(false); }
  };

  return (
    <View style={{flex:1, backgroundColor:'#fff', padding:30, justifyContent:'center'}}>
      <Text style={{fontSize:32, fontWeight:'bold', marginBottom:10}}>Вход</Text>
      <AppInput label="Номер телефона" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {loading ? (
        <ActivityIndicator size="large" color="#5856D6" />
      ) : (
        <Button title="Получить код" onPress={handleSendCode} />
      )}
    </View>
  );
}
