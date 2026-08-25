import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { AssistantMascot } from '../../components/assistant/AssistantMascot';
import StorageService from '../../services/StorageService';

interface Props {
  navigation: any;
}

export const AssistantOnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const [step, setStep] = useState<number>(1);

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    StorageService.setItem('assistant_onboarding_seen', 'true');
    navigation.replace('AssistantScreen');
  };

  const getStepContent = () => {
    switch (step) {
      case 1:
        return {
          mascotState: 'idle' as const,
          title: 'Привет, я Ассистент',
          subtitle: 'Просто расскажи мне всё как есть.\nНе нужно заполнять сложную форму.',
          buttonText: 'Далее',
        };
      case 2:
        return {
          mascotState: 'listening' as const,
          title: 'Можешь просто наговорить заметку',
          subtitle:
            'Пример:\n«Спальня 20 м², 15 светильников, 2 метра парящего…»\n\nЯ сохраню запись и аккуратно распознаю речь.',
          buttonText: 'Далее',
        };
      case 3:
        return {
          mascotState: 'success' as const,
          title: 'Чем я могу помочь из заметки:',
          subtitle:
            '• Сохранить и структурировать информацию\n• Сделать понятную таблицу позиций\n• Создать напоминания по датам и задачам\n• Подготовить черновик заказа',
          buttonText: 'Далее',
        };
      case 4:
        return {
          mascotState: 'question' as const,
          title: 'Заметка всегда живая',
          subtitle:
            'Если что-то изменилось — просто дополни заметку:\n«Светильников теперь 12, а не 15»\n\nЯ предложу изменения, а ты их подтвердишь.',
          buttonText: 'Попробовать',
        };
      default:
        return {
          mascotState: 'idle' as const,
          title: '',
          subtitle: '',
          buttonText: 'Далее',
        };
    }
  };

  const content = getStepContent();

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.skipButton} onPress={handleFinish}>
          <Text style={styles.skipText}>Пропустить</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.centerContent}>
        <View style={styles.mascotWrapper}>
          <AssistantMascot state={content.mascotState} size={100} />
        </View>

        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.subtitle}>{content.subtitle}</Text>

        {/* Step Indicator */}
        <View style={styles.indicatorRow}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.indicatorDot, i === step ? styles.indicatorActive : null]}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.ctaButton} onPress={handleNext}>
          <Text style={styles.ctaButtonText}>{content.buttonText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9FB' },
  topBar: {
    paddingTop: 50,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  skipButton: { padding: 8 },
  skipText: { fontSize: 14, color: '#8E8E93', fontWeight: '600' },
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  mascotWrapper: { marginBottom: 30 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#3A3A3C',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  indicatorRow: { flexDirection: 'row', justifyContent: 'center' },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: '#007AFF',
    width: 20,
  },
  bottomBar: { padding: 20, paddingBottom: 40 },
  ctaButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
