export const formatPhoneNumber = (value: string): string => {
  const cleaned = value.replace(/\D/g, '');

  if (cleaned.length === 0) return '';

  if (cleaned.startsWith('90')) {
    const phoneNumber = cleaned.slice(2);
    if (phoneNumber.length <= 3) return `+90 ${phoneNumber}`;
    if (phoneNumber.length <= 6) return `+90 ${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3)}`;
    if (phoneNumber.length <= 8) return `+90 ${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3, 6)} ${phoneNumber.slice(6)}`;
    return `+90 ${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3, 6)} ${phoneNumber.slice(6, 10)}`;
  }

  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  if (cleaned.length <= 8) return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  if (cleaned.length <= 10) return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;

  return `+90 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
};

export const cleanPhoneNumber = (value: string): string => {
  return value.replace(/\D/g, '');
};
