/**
 * Masks phone numbers in a string to prevent spam and off-platform deals.
 */
export const maskPhoneNumbers = (text: string): string => {
    if (!text) return '';

    // Regex to find Russian phone numbers and generic sequences of digits
    // Supports formats like 89991234567, +7 999 123-45-67, 9991234567
    const phoneRegex = /(\+?7|8)?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;

    // Also catch plain 7-11 digit sequences
    const genericDigitsRegex = /\d{7,11}/g;

    let masked = text.replace(phoneRegex, '[НОМЕР СКРЫТ]');
    masked = masked.replace(genericDigitsRegex, '[ДАННЫЕ СКРЫТЫ]');

    return masked;
};

/**
 * Checks if a string contains any potential off-platform contact info.
 */
export const hasSpam = (text: string): boolean => {
    const masked = maskPhoneNumbers(text);
    return masked.includes('[');
};
