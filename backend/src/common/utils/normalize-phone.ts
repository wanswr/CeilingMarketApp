export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const withoutLeadingSeven = digits.startsWith('8') && digits.length === 11
    ? '7' + digits.slice(1)
    : digits;
  return '+' + (withoutLeadingSeven.startsWith('7') ? withoutLeadingSeven : '7' + withoutLeadingSeven);
}
