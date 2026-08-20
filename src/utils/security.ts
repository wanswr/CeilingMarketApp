/**
 * Masks phone numbers in a string to prevent spam and off-platform deals.
 */
export const maskPhoneNumbers = (text: string): string => {
    if (!text) return '';

    // Matches Russian phone numbers (+7/8 xxx xxx-xx-xx) and sequences of 7-11 digits
    const phoneRegex = /(?:\+?7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\b\d{7,11}\b/g;

    return text.replace(phoneRegex, '[НОМЕР СКРЫТ]');
};

/**
 * Checks if a string contains any potential off-platform contact info.
 */
export const hasSpam = (text: string): boolean => {
    const masked = maskPhoneNumbers(text);
    return masked.includes('[');
};
