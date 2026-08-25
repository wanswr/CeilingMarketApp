import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppIcon from '../../components/AppIcon';
import { AppInput } from '../../components/Input';
import { COLORS, SHADOWS } from '../../constants/theme';
import { apiService } from '../../services/ApiService';

export default function AssistantNoteEditorScreen({ navigation, route }: any) {
  const { mode, noteId, initialTitle, initialRawText } = route.params || {};
  const isEdit = mode === 'edit';

  const [title, setTitle] = useState(initialTitle || '');
  const [rawText, setRawText] = useState(initialRawText || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      if (isEdit) {
        await apiService.updateAssistantNote(noteId, {
          title: title.trim(),
          rawText: rawText.trim(),
        });
        Alert.alert('Успех', 'Заметка обновлена');
      } else {
        await apiService.createAssistantNote({
          title: title.trim(),
          rawText: rawText.trim(),
        });
        Alert.alert('Успех', 'Заметка создана');
      }
      navigation.goBack();
    } catch (e: any) {
      const msg = e.response?.data?.message || 'Не удалось сохранить заметку';
      Alert.alert('Ошибка', Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <AppIcon name="nav-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Редактировать' : 'Новая заметка'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <AppInput
            label="Заголовок"
            value={title}
            onChangeText={setTitle}
            placeholder="Квартира на Ленинском"
          />

          <AppInput
            label="Текст заметки"
            value={rawText}
            onChangeText={setRawText}
            placeholder="Запишите всё как есть. Структурировать информацию Ассистент сможет позже."
            multiline
            style={styles.textArea}
          />

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (!title.trim() || submitting) && styles.saveBtnDisabled,
            ]}
            disabled={!title.trim() || submitting}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Сохранить</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark },
  content: { padding: 20 },
  textArea: { height: 180, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24,
    ...SHADOWS.soft,
  },
  saveBtnDisabled: { backgroundColor: COLORS.gray, opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
