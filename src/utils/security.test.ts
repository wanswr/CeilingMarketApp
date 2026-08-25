import { maskPhoneNumbers, hasSpam } from './security';

describe('src/utils/security - Client Anti-Spam & Contact Masking', () => {
  it('should leave normal order descriptions, titles, and chat messages unchanged', () => {
    const normalText = 'Требуется качественная установка натяжного потолка 20 кв.м. Цена 5000 рублей.';
    expect(maskPhoneNumbers(normalText)).toBe(normalText);
    expect(hasSpam(normalText)).toBe(false);
  });

  it('should mask Russian phone numbers in various formats', () => {
    expect(maskPhoneNumbers('Звоните +7 (999) 123-45-67')).toBe('Звоните [НОМЕР СКРЫТ]');
    expect(maskPhoneNumbers('Мой номер 89991234567')).toBe('Мой номер [НОМЕР СКРЫТ]');
    expect(maskPhoneNumbers('Пишите 8-999-123-45-67')).toBe('Пишите [НОМЕР СКРЫТ]');
  });

  it('should mask plain digit sequences between 7 and 11 digits', () => {
    expect(maskPhoneNumbers('Звоните 9991234567')).toBe('Звоните [НОМЕР СКРЫТ]');
    expect(maskPhoneNumbers('Код 12345678')).toBe('Код [НОМЕР СКРЫТ]');
  });

  it('should correctly evaluate hasSpam()', () => {
    expect(hasSpam('Обычный текст без контактов')).toBe(false);
    expect(hasSpam('Связь по телефону +79991234567')).toBe(true);
  });

  it('should preserve already masked text without corruption during retries (idempotency)', () => {
    const textWithPhone = 'Звоните 89991234567';
    const maskedOnce = maskPhoneNumbers(textWithPhone);
    const maskedTwice = maskPhoneNumbers(maskedOnce);

    expect(maskedOnce).toBe('Звоните [НОМЕР СКРЫТ]');
    expect(maskedTwice).toBe('Звоните [НОМЕР СКРЫТ]');
  });
});
