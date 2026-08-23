import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import AppIcon from '../../components/AppIcon';
import { COLORS, SHADOWS } from '../../constants/theme';
import { apiService } from '../../services/ApiService';
import { AssistantNote } from '../../types';
import { formatDate } from '../../utils/date';

export default function AssistantNoteDetailScreen({ navigation, route }: any) {
  const { noteId } = route.params;
  const [note, setNote] = useState<AssistantNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    fetchNote();
  }, [noteId]);

  const fetchNote = async () => {
    setLoading(true);
    try {
      const res = await apiService.getAssistantNote(noteId);
      setNote(res.data);
    } catch (e: any) {
      Alert.alert('Ошибка', 'Не удалось загрузить заметку');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = () => {
    Alert.alert(
      'Архивирование заметки',
      'Вы уверены, что хотите перенести эту заметку в архив?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Архивировать',
          style: 'destructive',
          onPress: async () => {
            if (archiving) return;
            setArchiving(true);
            try {
              await apiService.archiveAssistantNote(noteId);
              Alert.alert('Успех', 'Заметка перенесена в архив');
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Ошибка', 'Не удалось заархивировать заметку');
            } finally {
              setArchiving(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !note) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <AppIcon name="nav-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Заметка
        </Text>
        <TouchableOpacity onPress={handleArchive} style={styles.archiveHeaderBtn} disabled={archiving}>
          <AppIcon name="action-delete" size={22} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.date}>{formatDate(note.updatedAt || note.createdAt)}</Text>

        <View style={styles.divider} />

        <Text style={styles.bodyText}>
          {note.rawText || 'Текст отсутствует'}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.8}
            onPress={() =>
              navigation.navigate('AssistantNoteEditor', {
                mode: 'edit',
                noteId: note.id,
                initialTitle: note.title,
                initialRawText: note.rawText,
              })
            }
          >
            <AppIcon name="action-edit" size={20} color="#fff" />
            <Text style={styles.editBtnText}>Редактировать</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.archiveBtn}
            activeOpacity={0.8}
            onPress={handleArchive}
            disabled={archiving}
          >
            {archiving ? (
              <ActivityIndicator color={COLORS.danger} />
            ) : (
              <Text style={styles.archiveBtnText}>Архивировать</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  backBtn: { padding: 4 },
  archiveHeaderBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.dark, flex: 1, textAlign: 'center' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.dark, marginBottom: 6 },
  date: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  bodyText: { fontSize: 16, color: COLORS.dark, lineHeight: 26, marginBottom: 30 },
  actionsRow: { gap: 12 },
  editBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    ...SHADOWS.soft,
  },
  editBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  archiveBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  archiveBtnText: { color: COLORS.danger, fontSize: 16, fontWeight: '800' },
});
