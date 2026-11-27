export const FOUNDATION_INFO = {
  name: 'มูลนิธิร่วมกุศลสมุทรปราการ',
  systemTitle: 'ระบบนัดหมายเข้ารับบริการฝังเข็ม',
  phone: '02-175-8668',
  phoneTel: '021758668',
  address: 'มูลนิธิร่วมกุศลสมุทรปราการ จ.สมุทรปราการ',
  serviceHours: 'วันอาทิตย์ เวลา 09.00 - 11.30 น. (กำหนดวันเปิดจองโดยผู้ดูแลระบบเท่านั้น)',
  facebookUrl: 'https://www.facebook.com/profile.php?id=100068860846239&locale=th_TH',
  defaultAnnouncement:
    'มูลนิธิร่วมกุศลสมุทรปราการ เปิดให้บริการฝังเข็ม วันอาทิตย์ เวลา 09.00–11.30 น. กรุณามาก่อนเวลานัดหมาย 15 นาที',
  defaultLogoPath: '/assets/aistudio/382492-Photoroom_4c9e02f3.png',
  heroImagePath: '/src/assets/images/hero_acupuncture_clinic_1795657222749.jpg',
} as const;

export const TIME_SLOTS = [
  '09.00 - 09.30',
  '09.31 - 10.00',
  '10.01 - 10.30',
  '10.31 - 11.00',
  '11.01 - 11.30',
] as const;

export const DEFAULT_SLOT_CAPACITY = 5;
export const DEFAULT_DAILY_CAPACITY = 25;

export type BookingStatus =
  | 'Booked'
  | 'Confirmed'
  | 'Arrived'
  | 'InService'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  Booked: 'จองคิวแล้ว',
  Confirmed: 'ยืนยันนัดหมาย',
  Arrived: 'มาถึงจุดลงทะเบียนแล้ว',
  InService: 'กำลังเข้ารับบริการ',
  Completed: 'เข้ารับบริการแล้ว',
  Cancelled: 'ยกเลิกคิว',
  NoShow: 'ไม่มาตามนัด',
};

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

export const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const;

export function formatThaiDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]) + 543;
  const month = parts[1];
  const day = parts[2];
  return `${day}/${month}/${year}`;
}

export function formatThaiDateLong(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]) + 543;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return `${day} ${THAI_MONTHS[monthIdx] ?? parts[1]} พ.ศ. ${year}`;
}

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}-XXX-${digits.slice(-4)}`;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function getBangkokTodayISO(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bkk = new Date(utc + 7 * 3600000);
  return bkk.toISOString().slice(0, 10);
}

export function addDaysISO(baseDate: string, days: number): string {
  const [y, m, d] = baseDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isValidThaiPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return /^0[0-9]{9}$/.test(digits);
}
