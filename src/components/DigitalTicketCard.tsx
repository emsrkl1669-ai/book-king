import { useState } from 'react';
import {
  Bell,
  CalendarPlus,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Phone,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { formatThaiDate, FOUNDATION_INFO, maskPhoneNumber } from '../lib/constants';
import {
  downloadCalendarEvent,
  downloadTicketImage,
  downloadTicketPdf,
  downloadWalletPassFile,
  type TicketPayload,
} from '../lib/exportUtils';

interface DigitalTicketCardProps {
  ticket: TicketPayload;
  logoUrl?: string;
  foundationPhone?: string;
  onTrackQueue?: () => void;
  onNewBooking?: () => void;
}

export function DigitalTicketCard({
  ticket,
  logoUrl,
  foundationPhone = FOUNDATION_INFO.phone,
  onTrackQueue,
  onNewBooking,
}: DigitalTicketCardProps) {
  const [feedback, setFeedback] = useState<string>('');
  const [notifEnabled, setNotifEnabled] = useState<boolean>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    setBusyAction('pdf');
    try {
      await downloadTicketPdf(ticket, logoUrl);
      setFeedback('ดาวน์โหลดบัตรคิว PDF เรียบร้อยแล้ว');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveImage = async () => {
    setBusyAction('img');
    try {
      await downloadTicketImage(ticket, logoUrl);
      setFeedback('บันทึกรูปภาพบัตรคิว (.png) ลงเครื่องเรียบร้อยแล้ว');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCalendar = () => {
    downloadCalendarEvent(ticket);
    setFeedback('ดาวน์โหลดไฟล์นัดหมายปฏิทิน (.ics) พร้อมแจ้งเตือนอัตโนมัติแล้ว');
  };

  const handleWallet = (type: 'google' | 'apple') => {
    downloadWalletPassFile(ticket, type);
    setFeedback(
      type === 'google'
        ? 'สร้างไฟล์บัตรคิวสำหรับ Google Wallet เรียบร้อยแล้ว'
        : 'สร้างไฟล์บัตรคิวสำหรับ Apple Wallet เรียบร้อยแล้ว'
    );
  };

  const handleEnablePush = async () => {
    if (typeof Notification === 'undefined') {
      setFeedback('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบ Push กรุณาเพิ่มลงปฏิทินแทน');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setNotifEnabled(true);
      new Notification(`${FOUNDATION_INFO.name} — บันทึกการแจ้งเตือนแล้ว`, {
        body: `คิวลำดับที่ ${ticket.queueNo} วันที่ ${formatThaiDate(ticket.bookingDate)} เวลา ${ticket.bookingTime} น.`,
      });
      setFeedback('เปิดรับการแจ้งเตือนอัตโนมัติบนอุปกรณ์นี้เรียบร้อยแล้ว');
    } else {
      setFeedback('ไม่ได้รับอนุญาตให้ส่งการแจ้งเตือน กรุณาตรวจสอบการตั้งค่าเบราว์เซอร์');
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-2xl p-5 flex items-start gap-4">
        <CheckCircle2 className="w-7 h-7 text-[#065F46] shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0F294A]">
            บันทึกการจองคิวสำเร็จ
          </h2>
          <p className="text-[17px] text-slate-700 mt-1">
            ระบบออกเลขคิวและบัตรคิวอิเล็กทรอนิกส์ให้ท่านเรียบร้อยแล้ว กรุณาบันทึกบัตรคิวไว้แสดงต่อเจ้าหน้าที่
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Official Digital Ticket (Section 6) */}
        <div className="lg:col-span-6 bg-white border-2 border-[#0F294A] rounded-2xl overflow-hidden">
          <div className="bg-[#0F294A] text-white px-6 py-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-white rounded-full p-1 flex items-center justify-center shrink-0">
              <img
                src={logoUrl || FOUNDATION_INFO.defaultLogoPath}
                alt={FOUNDATION_INFO.name}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xl font-bold leading-snug">{FOUNDATION_INFO.name}</p>
              <p className="text-[15px] text-[#A7F3D0]">บัตรคิวอิเล็กทรอนิกส์ (Digital Queue Ticket)</p>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-xl py-6 px-4 text-center">
              <p className="text-[18px] font-semibold text-[#065F46]">คิวลำดับที่</p>
              <p className="text-6xl font-bold font-mono-num text-[#0F294A] mt-1 tracking-tight">
                {ticket.queueNo}
              </p>
            </div>

            <dl className="divide-y divide-slate-200 text-[19px]">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-600">ชื่อ</dt>
                <dd className="font-bold text-[#0F294A] text-right">{ticket.fullName}</dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-600">วันที่</dt>
                <dd className="font-bold font-mono-num text-[#0F294A] text-right">
                  {formatThaiDate(ticket.bookingDate)}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-600">เวลา</dt>
                <dd className="font-bold font-mono-num text-[#0F294A] text-right">
                  {ticket.bookingTime} น.
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-600">โทรศัพท์</dt>
                <dd className="font-bold font-mono-num text-[#0F294A] text-right">
                  {ticket.maskedPhone || maskPhoneNumber(ticket.phoneNumber)}
                </dd>
              </div>
            </dl>

            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-center space-y-1.5">
              <p className="text-[18px] font-bold text-amber-900">
                โปรดเข้ารับบริการก่อนเวลานัดหมาย 15 นาที
              </p>
              <a
                href={`tel:${foundationPhone.replace(/\D/g, '')}`}
                className="inline-flex items-center justify-center gap-2 text-[18px] font-bold text-amber-950 hover:underline"
              >
                <Phone className="w-5 h-5" aria-hidden="true" />
                <span>{foundationPhone}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Save to Mobile & Auto Notifications */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-7 space-y-5">
            <h3 className="text-2xl font-bold text-[#0F294A]">บันทึกใบนัดลงมือถือ</h3>
            <p className="text-[17px] text-slate-600">
              เลือกบันทึกรูปภาพหรือเอกสารใบนัดเก็บไว้ในโทรศัพท์มือถือของท่าน
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={busyAction !== null}
                className="flex items-center justify-center gap-2.5 px-5 py-3.5 min-h-[52px] rounded-xl bg-[#0F294A] text-white text-[18px] font-bold hover:bg-[#163A66] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-5 h-5 shrink-0 text-[#86EFAC]" aria-hidden="true" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={handleSaveImage}
                disabled={busyAction !== null}
                className="flex items-center justify-center gap-2.5 px-5 py-3.5 min-h-[52px] rounded-xl border border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] text-[18px] font-bold hover:bg-[#DCFCE7] transition-colors cursor-pointer whitespace-nowrap"
              >
                <ImageIcon className="w-5 h-5 shrink-0 text-[#065F46]" aria-hidden="true" />
                <span>Save Ticket Image</span>
              </button>

              <button
                type="button"
                onClick={() => handleWallet('google')}
                className="flex items-center justify-center gap-2.5 px-5 py-3.5 min-h-[52px] rounded-xl border border-[#CBD5E1] bg-[#F4F7FB] text-[#0F294A] text-[17px] font-semibold hover:border-[#0F294A] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Wallet className="w-5 h-5 shrink-0 text-[#065F46]" aria-hidden="true" />
                <span>Add Google Wallet</span>
              </button>

              <button
                type="button"
                onClick={() => handleWallet('apple')}
                className="flex items-center justify-center gap-2.5 px-5 py-3.5 min-h-[52px] rounded-xl border border-[#CBD5E1] bg-[#F4F7FB] text-[#0F294A] text-[17px] font-semibold hover:border-[#0F294A] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Smartphone className="w-5 h-5 shrink-0 text-[#065F46]" aria-hidden="true" />
                <span>Add Apple Wallet</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCalendar}
              className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 min-h-[52px] rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[18px] font-semibold hover:bg-[#F4F7FB] transition-colors cursor-pointer"
            >
              <CalendarPlus className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
              <span>Add Calendar Event (เพิ่มลงปฏิทินพร้อมแจ้งเตือน)</span>
            </button>

            {feedback && (
              <p role="status" className="text-[16px] font-semibold text-[#0F294A] bg-[#ECFDF5] border border-[#86EFAC] rounded-lg px-4 py-3">
                {feedback}
              </p>
            )}
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-[#0F294A]">ระบบแจ้งเตือนอัตโนมัติ (3 ระยะ)</h3>
              <button
                type="button"
                onClick={handleEnablePush}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[16px] font-bold transition-colors cursor-pointer ${
                  notifEnabled
                    ? 'bg-[#ECFDF5] text-[#065F46] border border-[#86EFAC]'
                    : 'bg-[#0F294A] text-white hover:bg-[#163A66]'
                }`}
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                <span>{notifEnabled ? 'เปิดแจ้งเตือนแล้ว' : 'เปิดรับ Push Notification'}</span>
              </button>
            </div>

            <div className="divide-y divide-slate-200 text-[16px]">
              <div className="py-3">
                <p className="font-bold text-[#0F294A]">1. แจ้งเตือน 1 วันก่อนนัด</p>
                <p className="text-slate-600 mt-0.5">
                  &ldquo;ท่านมีนัดเข้ารับบริการฝังเข็มในวันพรุ่งนี้ โปรดมาถึงก่อนเวลา 15 นาที&rdquo;
                </p>
              </div>
              <div className="py-3">
                <p className="font-bold text-[#0F294A]">2. แจ้งเตือน 1 ชั่วโมงก่อนนัด</p>
                <p className="text-slate-600 mt-0.5">
                  &ldquo;อีก 1 ชั่วโมงจะถึงเวลานัดหมาย กรุณาเตรียมตัวเดินทาง&rdquo;
                </p>
              </div>
              <div className="py-3">
                <p className="font-bold text-[#0F294A]">3. แจ้งเตือน 15 นาทีก่อนนัด</p>
                <p className="text-slate-600 mt-0.5">
                  &ldquo;ใกล้ถึงเวลานัดหมาย โปรดเข้ารับบริการ ณ จุดลงทะเบียน&rdquo;
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {onTrackQueue && (
              <button
                type="button"
                onClick={onTrackQueue}
                className="flex-1 min-w-[200px] px-6 py-4 rounded-xl bg-[#0F294A] text-white text-[18px] font-bold hover:bg-[#163A66] transition-colors cursor-pointer"
              >
                ติดตามสถานะคิว Real-Time
              </button>
            )}
            {onNewBooking && (
              <button
                type="button"
                onClick={onNewBooking}
                className="px-6 py-4 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[18px] font-semibold hover:bg-[#F4F7FB] transition-colors cursor-pointer"
              >
                จองคิวใหม่
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
