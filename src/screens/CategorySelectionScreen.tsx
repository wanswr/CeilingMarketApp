import React, { useState, useEffect } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/ApiService';
import { usePendingAction } from '../context/PendingActionContext';

const CategorySelectionScreen = ({ navigation, route }: any) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { updateUser } = useAuth();
  const { resumePendingAction } = usePendingAction();

  useEffect(() => {
    const fetchCats = async () => {
      setLoading(true);
      try {
        const res = await apiService.getCategories();
        setCategories(res.data || []);
      } catch (err) {
        Alert.alert('Ошибка', 'Не удалось загрузить направления');
      } finally {
        setLoading(false);
      }
    };
    fetchCats();
  }, []);

  const selectCategory = async (categoryId: string) => {
    setLoading(true);
    try {
      const res = await apiService.setActiveCategory(categoryId);
      updateUser(res.data);
      if (route.params?.pendingAction) {
        resumePendingAction();
        navigation.goBack();
      } else {
        navigation.navigate('MainTabs');
      }
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 400) {
        const errorMsg = error.response?.data?.message || '';
        if (
          errorMsg.toLowerCase().includes('subscription') ||
          errorMsg.toLowerCase().includes('active') ||
          errorMsg.toLowerCase().includes('подписк')
        ) {
          Alert.alert('Ошибка', 'Нельзя сменить направление, пока активна подписка');
          return;
        }
      }
      Alert.alert('Ошибка', 'Не удалось сохранить направление');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Выберите ваше направление</Text>

        {loading && categories.length === 0 ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={styles.card}
              onPress={() => selectCategory(cat.id)}
              disabled={loading}
            >
              <Text style={styles.cardTitle}>{cat.name}</Text>
              <Text style={styles.cardDesc}>Специализация на направлении {cat.name.toLowerCase()}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 20, paddingBottom: 40, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, marginTop: 20 },
  card: {
    backgroundColor: '#f8f9fa',
    padding: 25,
    borderRadius: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center'
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary, marginBottom: 5 },
  cardDesc: { fontSize: 13, color: '#666', textAlign: 'center' }
});

export default CategorySelectionScreen;
