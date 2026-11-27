import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  formatPhoneDisplay,
  formatThaiDate,
  FOUNDATION_INFO,
  maskPhoneNumber,
} from './constants';

export interface TicketPayload {
  bookingId: string;
  queueNo: string;
  fullName: string;
  bookingDate: string;
  bookingTime: string;
  phoneNumber: string;
  maskedPhone?: string;
  disease?: string;
  isSpecial?: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderTicketCanvas(
  ticket: TicketPayload,
  logoUrl?: string
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer clean border
  ctx.strokeStyle = '#0F294A';
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  // Header band
  ctx.fillStyle = '#0F294A';
  ctx.fillRect(36, 36, canvas.width - 72, 180);

  // Logo preserved unmodified in aspect ratio
  const img = await loadImage(logoUrl || FOUNDATION_INFO.defaultLogoPath);
  if (img) {
    const boxSize = 112;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(130, 126, 62, 0, Math.PI * 2);
    ctx.fill();
    const ratio = Math.min(boxSize / img.width, boxSize / img.height);
    const drawW = img.width * ratio;
    const drawH = img.height * ratio;
    ctx.drawImage(img, 130 - drawW / 2, 126 - drawH / 2, drawW, drawH);
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px "Noto Sans Thai", sans-serif';
  ctx.fillText(FOUNDATION_INFO.name, 220, 114);
  ctx.font = '500 24px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = '#A7F3D0';
  ctx.fillText('บัตรคิวอิเล็กทรอนิกส์ · คลินิกฝังเข็ม', 220, 162);

  // Queue Number Box
  ctx.fillStyle = '#ECFDF5';
  ctx.fillRect(84, 256, canvas.width - 168, 220);
  ctx.strokeStyle = '#6EE7B7';
  ctx.lineWidth = 3;
  ctx.strokeRect(84, 256, canvas.width - 168, 220);

  ctx.fillStyle = '#0F294A';
  ctx.font = '600 28px "Noto Sans Thai", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('คิวลำดับที่', canvas.width / 2, 316);

  ctx.fillStyle = ticket.isSpecial ? '#B91C1C' : '#0F294A';
  ctx.font = 'bold 112px "IBM Plex Mono", monospace';
  ctx.fillText(ticket.queueNo, canvas.width / 2, 434);

  // Details list
  ctx.textAlign = 'left';
  const rows: Array<[string, string]> = [
    ['ชื่อผู้รับบริการ', ticket.fullName],
    ['วันที่นัดหมาย', formatThaiDate(ticket.bookingDate)],
    ['ช่วงเวลา', `${ticket.bookingTime} น.`],
    ['โทรศัพท์', ticket.maskedPhone || maskPhoneNumber(ticket.phoneNumber)],
  ];

  let y = 550;
  for (const [label, value] of rows) {
    ctx.fillStyle = '#64748B';
    ctx.font = '500 24px "Noto Sans Thai", sans-serif';
    ctx.fillText(label, 96, y);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 30px "Noto Sans Thai", sans-serif';
    ctx.fillText(value, 96, y + 42);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(96, y + 66);
    ctx.lineTo(canvas.width - 96, y + 66);
    ctx.stroke();

    y += 108;
  }

  // Warning box
  ctx.fillStyle = '#FEF3C7';
  ctx.fillRect(84, 1000, canvas.width - 168, 118);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2;
  ctx.strokeRect(84, 1000, canvas.width - 168, 118);

  ctx.fillStyle = '#92400E';
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px "Noto Sans Thai", sans-serif';
  ctx.fillText('โปรดเข้ารับบริการก่อนเวลานัดหมาย 15 นาที', canvas.width / 2, 1052);
  ctx.font = '600 24px "Noto Sans Thai", sans-serif';
  ctx.fillText(`ติดต่อสอบถาม โทร. ${FOUNDATION_INFO.phone}`, canvas.width / 2, 1094);

  // Footer reference
  ctx.fillStyle = '#64748B';
  ctx.font = '500 20px "IBM Plex Mono", monospace';
  ctx.fillText(`REF: ${ticket.bookingId.slice(0, 8).toUpperCase()}`, canvas.width / 2, 1185);

  return canvas;
}

export async function downloadTicketImage(
  ticket: TicketPayload,
  logoUrl?: string
): Promise<void> {
  const canvas = await renderTicketCanvas(ticket, logoUrl);
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = `Queue-${ticket.queueNo}-${ticket.bookingDate}.png`;
  link.click();
}

export async function downloadTicketPdf(
  ticket: TicketPayload,
  logoUrl?: string
): Promise<void> {
  const canvas = await renderTicketCanvas(ticket, logoUrl);
  const imgData = canvas.toDataURL('image/png');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });
  doc.addImage(imgData, 'PNG', 6, 6, 136, 181);
  doc.save(`Queue-${ticket.queueNo}-${ticket.bookingDate}.pdf`);
}

export function downloadCalendarEvent(ticket: TicketPayload): void {
  const [startRaw, endRaw] = ticket.bookingTime.split('-').map((s) => s.trim().replace('.', ''));
  const dateCompact = ticket.bookingDate.replace(/-/g, '');
  const dtStart = `${dateCompact}T${startRaw.padEnd(4, '0')}00`;
  const dtEnd = `${dateCompact}T${(endRaw || startRaw).padEnd(4, '0')}00`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ruamkusol Samut Prakan//Acupuncture Queue//TH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ticket.bookingId}@ruamkusol.org`,
    `DTSTAMP:${dateCompact}T000000Z`,
    `DTSTART;TZID=Asia/Bangkok:${dtStart}`,
    `DTEND;TZID=Asia/Bangkok:${dtEnd}`,
    `SUMMARY:นัดฝังเข็ม มูลนิธิร่วมกุศลสมุทรปราการ (คิว ${ticket.queueNo})`,
    `DESCRIPTION:คิวลำดับที่ ${ticket.queueNo} ชื่อ ${ticket.fullName} โปรดมาถึงก่อนเวลานัดหมาย 15 นาที โทร ${FOUNDATION_INFO.phone}`,
    `LOCATION:${FOUNDATION_INFO.address}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:ท่านมีนัดเข้ารับบริการฝังเข็มในวันพรุ่งนี้ โปรดมาถึงก่อนเวลา 15 นาที',
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:อีก 1 ชั่วโมงจะถึงเวลานัดหมาย กรุณาเตรียมตัวเดินทาง',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:ใกล้ถึงเวลานัดหมาย โปรดเข้ารับบริการ ณ จุดลงทะเบียน',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Appointment-${ticket.queueNo}-${ticket.bookingDate}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadWalletPassFile(
  ticket: TicketPayload,
  walletType: 'google' | 'apple'
): void {
  const passData = {
    provider: walletType === 'google' ? 'Google Wallet Pass Object' : 'Apple Wallet Pass Payload',
    organizationName: FOUNDATION_INFO.name,
    service: 'คลินิกฝังเข็ม มูลนิธิร่วมกุศลสมุทรปราการ',
    queueNo: ticket.queueNo,
    patientName: ticket.fullName,
    appointmentDate: formatThaiDate(ticket.bookingDate),
    appointmentTime: `${ticket.bookingTime} น.`,
    phone: formatPhoneDisplay(ticket.phoneNumber),
    reminderNote: 'โปรดเข้ารับบริการก่อนเวลานัดหมาย 15 นาที',
    contactPhone: FOUNDATION_INFO.phone,
    bookingId: ticket.bookingId,
  };
  const blob = new Blob([JSON.stringify(passData, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${walletType}-wallet-queue-${ticket.queueNo}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ReportRow {
  bookingDate: string;
  bookingTime: string;
  queueNo: string;
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  status: string;
  isSpecial: boolean;
}

export function exportReportExcel(rows: ReportRow[], title: string): void {
  const worksheetData = rows.map((r) => ({
    วันที่นัดหมาย: formatThaiDate(r.bookingDate),
    ช่วงเวลา: r.bookingTime,
    เลขคิว: r.queueNo,
    ประเภท: r.isSpecial ? 'คิวพิเศษ' : 'คิวปกติ',
    'ชื่อ-นามสกุล': r.fullName,
    อายุ: r.age,
    โรคประจำตัว: r.disease,
    เบอร์โทรศัพท์: formatPhoneDisplay(r.phoneNumber),
    สถานะ: BOOKING_STATUS_LABELS[r.status as BookingStatus] || r.status,
  }));

  const ws = XLSX.utils.json_to_sheet(worksheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายงานคิวฝังเข็ม');
  XLSX.writeFile(wb, `${title}.xlsx`);
}

export function exportReportCsv(rows: ReportRow[], title: string): void {
  const headers = [
    'วันที่นัดหมาย',
    'ช่วงเวลา',
    'เลขคิว',
    'ประเภท',
    'ชื่อ-นามสกุล',
    'อายุ',
    'โรคประจำตัว',
    'เบอร์โทรศัพท์',
    'สถานะ',
  ];

  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        formatThaiDate(r.bookingDate),
        r.bookingTime,
        r.queueNo,
        r.isSpecial ? 'คิวพิเศษ' : 'คิวปกติ',
        r.fullName,
        r.age,
        r.disease,
        formatPhoneDisplay(r.phoneNumber),
        BOOKING_STATUS_LABELS[r.status as BookingStatus] || r.status,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportReportPdf(
  rows: ReportRow[],
  summaryTitle: string,
  metrics: {
    totalCount: number;
    completedCount: number;
    cancelledCount: number;
    noShowCount: number;
    avgAge: number;
  }
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rowsPerPage = 14;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  for (let p = 0; p < totalPages; p++) {
    const pageRows = rows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1120;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F294A';
    ctx.fillRect(0, 0, canvas.width, 108);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px "Noto Sans Thai", sans-serif';
    ctx.fillText(`${FOUNDATION_INFO.name} — ${summaryTitle}`, 48, 56);
    ctx.font = '500 22px "Noto Sans Thai", sans-serif';
    ctx.fillStyle = '#A7F3D0';
    ctx.fillText(
      `ทั้งหมด ${metrics.totalCount} ราย · สำเร็จ ${metrics.completedCount} · ยกเลิก ${metrics.cancelledCount} · ไม่มา ${metrics.noShowCount} · อายุเฉลี่ย ${metrics.avgAge} ปี`,
      48,
      90
    );

    // Table header
    const cols = [
      { label: 'วันที่', x: 48 },
      { label: 'เวลา', x: 200 },
      { label: 'เลขคิว', x: 380 },
      { label: 'ชื่อ-นามสกุล', x: 520 },
      { label: 'อายุ', x: 860 },
      { label: 'โรค/อาการ', x: 950 },
      { label: 'โทรศัพท์', x: 1230 },
      { label: 'สถานะ', x: 1410 },
    ];

    ctx.fillStyle = '#F2F4F1';
    ctx.fillRect(36, 130, canvas.width - 72, 54);
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
    for (const c of cols) {
      ctx.fillText(c.label, c.x, 165);
    }

    let y = 220;
    ctx.font = '500 21px "Noto Sans Thai", sans-serif';
    for (const r of pageRows) {
      ctx.fillStyle = '#0F172A';
      ctx.fillText(formatThaiDate(r.bookingDate), cols[0].x, y);
      ctx.fillText(r.bookingTime, cols[1].x, y);
      ctx.fillText(r.queueNo, cols[2].x, y);
      ctx.fillText(r.fullName.slice(0, 22), cols[3].x, y);
      ctx.fillText(String(r.age), cols[4].x, y);
      ctx.fillText((r.disease || '-').slice(0, 18), cols[5].x, y);
      ctx.fillText(formatPhoneDisplay(r.phoneNumber), cols[6].x, y);
      ctx.fillText(BOOKING_STATUS_LABELS[r.status as BookingStatus] || r.status, cols[7].x, y);

      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(36, y + 18);
      ctx.lineTo(canvas.width - 36, y + 18);
      ctx.stroke();
      y += 58;
    }

    ctx.fillStyle = '#64748B';
    ctx.font = '500 18px "Noto Sans Thai", sans-serif';
    ctx.fillText(`หน้า ${p + 1} / ${totalPages}`, canvas.width - 160, canvas.height - 32);

    if (p > 0) doc.addPage();
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 5, 5, 287, 200);
  }

  doc.save(`${summaryTitle}.pdf`);
}
