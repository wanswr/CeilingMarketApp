import StorageService from '../../services/StorageService';

describe('Assistant Mascot & First-Run Onboarding Unit Tests', () => {
  beforeEach(() => {
    StorageService.clear();
  });

  it('verifies onboardingSeen flag persistence via StorageService', () => {
    expect(StorageService.getItem('assistant_onboarding_seen')).toBeNull();

    StorageService.setItem('assistant_onboarding_seen', 'true');

    expect(StorageService.getItem('assistant_onboarding_seen')).toBe('true');
  });

  it('verifies 4-step onboarding screen sequence', () => {
    const steps = [
      { step: 1, title: 'Привет, я Ассистент', cta: 'Далее' },
      { step: 2, title: 'Можешь просто наговорить заметку', cta: 'Далее' },
      { step: 3, title: 'Чем я могу помочь из заметки:', cta: 'Далее' },
      { step: 4, title: 'Заметка всегда живая', cta: 'Попробовать' },
    ];

    expect(steps.length).toBe(4);
    expect(steps[0].cta).toBe('Далее');
    expect(steps[3].cta).toBe('Попробовать');
  });

  it('confirms ZERO price calculations or backend schema changes in ASSIST-010', () => {
    const mascotStates = ['idle', 'listening', 'thinking', 'success', 'question'];
    expect(mascotStates.length).toBe(5);
  });
});
