import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Settings,
  UserCheck,
} from 'lucide-react';
import {
  formatThaiDateLong,
  getBangkokTodayISO,
  isValidThaiPhone,
  THAI_DAYS_SHORT,
  THAI_MONTHS,
} from '../lib/constants';
import { type TicketPayload } from '../lib/exportUtils';
import { DigitalTicketCard } from './DigitalTicketCard';

interface CalendarDay {
  date: string;
  day: number;
  state: 'open' | 'closed' | 'full' | 'paused';
  isOpen: boolean;
  isPaused: boolean;
  isPast: boolean;
  bookedCount: number;
  dailyCapacity: number;
  remaining: number;
  reason: string;
}

interface TimeSlotInfo {
  time: string;
  booked: number;
  capacity: number;
  remaining: number;
  isFull: boolean;
}

interface BookingFlowViewProps {
  logoUrl?: string;
  foundationPhone?: string;
  onTrackQueue: (queueNo: string) => void;
  onOpenStaff?: () => void;
}

export function BookingFlowView({
  logoUrl,
  foundationPhone,
  onTrackQueue,
  onOpenStaff,
}: BookingFlowViewProps) {
  const todayISO = getBangkokTodayISO();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [currentMonth, setCurrentMonth] = useState<string>(todayISO.slice(0, 7));
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [globalPaused, setGlobalPaused] = useState(false);
  const [loadingCal, setLoadingCal] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<TimeSlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>('');

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [disease, setDisease] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmedTicket, setConfirmedTicket] = useState<TicketPayload | null>(null);

  const loadCalendar = async (monthStr: string) => {
    setLoadingCal(true);
    try {
      const res = await fetch(`/api/public/calendar?month=${encodeURIComponent(monthStr)}`);
      const data = await res.json();
      if (res.ok) {
        setDays(data.days || []);
        setGlobalPaused(Boolean(data.globalPaused));
      }
    } finally {
      setLoadingCal(false);
    }
  };

  useEffect(() => {
    loadCalendar(currentMonth);
  }, [currentMonth]);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (
          parsed.type === 'queue_updated' ||
          parsed.type === 'schedule_updated' ||
          parsed.type === 'settings_updated'
        ) {
          loadCalendar(currentMonth);
          if (selectedDate) {
            fetchSlots(selectedDate);
          }
        }
      } catch {
        // ignore heartbeat
      }
    };
    return () => es.close();
  }, [currentMonth, selectedDate]);

  const fetchSlots = async (dateISO: string) => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/public/slots?date=${encodeURIComponent(dateISO)}`);
      const data = await res.json();
      if (res.ok) {
        setSlots(data.slots || []);
      }
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSelectDate = async (d: CalendarDay) => {
    if (d.state !== 'open') return;
    setSelectedDate(d.date);
    setSelectedTime('');
    setFormError('');
    await fetchSlots(d.date);
    setStep(2);
  };

  const handleSelectTime = (slot: TimeSlotInfo) => {
    if (slot.isFull) return;
    setSelectedTime(slot.time);
    setFormError('');
    setStep(3);
  };

  const changeMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCurrentMonth(dt.toISOString().slice(0, 7));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanName = fullName.trim();
    const ageNum = Number(age);
    const digits = phoneNumber.replace(/\D/g, '');

    if (!cleanName || cleanName.length < 2) {
      setFormError('กรุณากรอกชื่อ-นามสกุลผู้รับบริการ');
      return;
    }
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      setFormError('กรุณากรอกอายุเป็นตัวเลขที่ถูกต้อง (1 - 120 ปี)');
      return;
    }
    if (!isValidThaiPhone(digits)) {
      setFormError('กรุณากรอกเบอร์โทรศัพท์มือถือ 10 หลัก (ตัวอย่าง 0812345678)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingDate: selectedDate,
          bookingTime: selectedTime,
          fullName: cleanName,
          age: ageNum,
          disease: disease.trim(),
          phoneNumber: digits,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'ไม่สามารถบันทึกการจองได้');
        return;
      }
      setConfirmedTicket(data);
      setStep(4);
    } catch {
      setFormError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setSelectedDate('');
    setSelectedTime('');
    setFullName('');
    setAge('');
    setDisease('');
    setPhoneNumber('');
    setFormError('');
    setConfirmedTicket(null);
    loadCalendar(currentMonth);
  };

  if (step === 4 && confirmedTicket) {
    return (
      <DigitalTicketCard
        ticket={confirmedTicket}
        logoUrl={logoUrl}
        foundationPhone={foundationPhone}
        onTrackQueue={() => onTrackQueue(confirmedTicket.queueNo)}
        onNewBooking={resetFlow}
      />
    );
  }

  const [yr, mn] = currentMonth.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(yr, mn - 1, 1)).getUTCDay();
  const thaiMonthTitle = `${THAI_MONTHS[mn - 1]} พ.ศ. ${yr + 543}`;

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0F294A]">
            จองคิวเข้ารับบริการฝังเข็ม
          </h1>
          <p className="text-[18px] text-slate-600 mt-1">
            ทำตาม 3 ขั้นตอนง่ายๆ ไม่ต้องเข้าสู่ระบบ · วันเปิดจองกำหนดโดยผู้ดูแลระบบเท่านั้น
          </p>
        </div>
        {onOpenStaff && (
          <button
            type="button"
            onClick={onOpenStaff}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[15px] font-semibold hover:bg-[#ECFDF5] cursor-pointer self-start md:self-auto"
          >
            <Settings className="w-4 h-4 text-[#065F46]" />
            <span>ผู้ดูแลระบบ: กำหนดวันเปิดจอง</span>
          </button>
        )}
      </div>

      {/* 3-Step Progress Indicator */}
      <nav aria-label="ขั้นตอนการจองคิว" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { num: 1, label: '1. เลือกวันนัดหมาย' },
          { num: 2, label: '2. เลือกช่วงเวลา' },
          { num: 3, label: '3. กรอกข้อมูลผู้รับบริการ' },
        ].map((item) => {
          const isCurrent = step === item.num;
          const isDone = step > item.num;
          return (
            <button
              key={item.num}
              type="button"
              disabled={item.num > step}
              onClick={() => {
                if (item.num < step) setStep(item.num as 1 | 2 | 3);
              }}
              className={`text-left px-5 py-4 rounded-xl border transition-colors text-[18px] font-bold flex items-center gap-3 ${
                isCurrent
                  ? 'border-[#0F294A] bg-[#0F294A] text-white'
                  : isDone
                    ? 'border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] cursor-pointer'
                    : 'border-[#CBD5E1] bg-white text-slate-400 cursor-not-allowed'
              }`}
            >
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono-num shrink-0 ${
                  isCurrent
                    ? 'bg-[#86EFAC] text-[#0F294A]'
                    : isDone
                      ? 'bg-[#0F294A] text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? <Check className="w-5 h-5" /> : item.num}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {globalPaused && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-5 flex items-center gap-4 text-red-950">
          <Lock className="w-6 h-6 shrink-0" aria-hidden="true" />
          <p className="text-[18px] font-semibold">
            ขณะนี้ผู้ดูแลระบบปิดรับการจองคิวออนไลน์ชั่วคราว กรุณาติดต่อเจ้าหน้าที่ โทร. {foundationPhone || '02-175-8668'}
          </p>
        </div>
      )}

      {/* STEP 1: CALENDAR */}
      {step === 1 && (
        <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-3">
              <Calendar className="w-7 h-7 text-[#065F46]" aria-hidden="true" />
              <span>เลือกวันนัดหมาย</span>
            </h2>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="เดือนก่อนหน้า"
                className="p-3 rounded-xl border border-[#CBD5E1] text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <span className="text-xl font-bold text-[#0F294A] min-w-[210px] text-center">
                {thaiMonthTitle}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="เดือนถัดไป"
                className="p-3 rounded-xl border border-[#CBD5E1] text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Color + Text Legend */}
          <div className="flex flex-wrap gap-6 py-3.5 px-5 bg-[#F4F7FB] border border-[#CBD5E1] rounded-xl text-[17px]">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded bg-[#DCFCE7] border-2 border-[#4ADE80] inline-block" aria-hidden="true" />
              <span className="font-bold text-[#0F294A]">สีเขียวอ่อน = วันเปิดให้จอง (โดยผู้ดูแลระบบ)</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded bg-slate-200 border border-slate-300 inline-block" aria-hidden="true" />
              <span className="font-semibold text-slate-600">สีเทา = ยังไม่เปิดจอง / ผ่านมาแล้ว</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded bg-red-100 border-2 border-[#EF4444] inline-block" aria-hidden="true" />
              <span className="font-bold text-[#B91C1C]">สีแดง = วันเต็มแล้ว (0 คิว)</span>
            </div>
          </div>

          {!loadingCal && days.length > 0 && !days.some((d) => d.state === 'open') && (
            <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[#0F294A]">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-[#065F46] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[18px] font-bold">
                    ขณะนี้ยังไม่มีวันที่เปิดให้จองในเดือน {thaiMonthTitle}
                  </p>
                  <p className="text-[16px] text-slate-700">
                    วันเปิดรับจองคิวกำหนดโดยผู้ดูแลระบบเท่านั้น ท่านสามารถดูเดือนถัดไป หรือติดต่อสอบถาม โทร.{' '}
                    {foundationPhone || '02-175-8668'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-[16px] font-bold hover:bg-[#163A66] whitespace-nowrap cursor-pointer shrink-0"
              >
                ดูเดือนถัดไป
              </button>
            </div>
          )}

          {loadingCal ? (
            <div className="grid grid-cols-7 gap-2.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2 sm:gap-3">
              {THAI_DAYS_SHORT.map((dayName) => (
                <div
                  key={dayName}
                  className="text-center py-2 text-[17px] font-bold text-[#0F294A]"
                >
                  {dayName}
                </div>
              ))}

              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[84px]" />
              ))}

              {days.map((d) => {
                const isOpen = d.state === 'open';
                const isFull = d.state === 'full';
                const isSelected = selectedDate === d.date;

                let styleClass =
                  'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed';
                let statusText = 'ปิดจอง';

                if (isOpen) {
                  styleClass = isSelected
                    ? 'border-[#0F294A] bg-[#0F294A] text-white cursor-pointer'
                    : 'border-[#4ADE80] bg-[#ECFDF5] text-[#0F294A] hover:bg-[#DCFCE7] hover:border-[#0F294A] cursor-pointer';
                  statusText = `ว่าง ${d.remaining}`;
                } else if (isFull) {
                  styleClass =
                    'border-red-300 bg-red-50 text-[#B91C1C] cursor-not-allowed';
                  statusText = 'เต็ม';
                } else if (d.state === 'paused') {
                  statusText = 'ระงับ';
                }

                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={!isOpen}
                    onClick={() => handleSelectDate(d)}
                    aria-label={`${formatThaiDateLong(d.date)} ${statusText}`}
                    className={`min-h-[84px] sm:min-h-[96px] rounded-xl border-2 p-2 sm:p-3 flex flex-col items-center justify-between transition-colors focus-visible:outline-3 focus-visible:outline-[#0F294A] ${styleClass}`}
                  >
                    <span className="text-xl sm:text-2xl font-bold font-mono-num">
                      {d.day}
                    </span>
                    <span className="text-[13px] sm:text-[14px] font-bold font-mono-num whitespace-nowrap">
                      {statusText}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* STEP 2: TIME SLOTS */}
      {step === 2 && (
        <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-3">
                <Clock className="w-7 h-7 text-[#065F46]" aria-hidden="true" />
                <span>เลือกช่วงเวลา</span>
              </h2>
              <p className="text-[18px] text-[#065F46] font-bold mt-1">
                วันที่เลือก: {formatThaiDateLong(selectedDate)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[18px] font-semibold hover:bg-[#F4F7FB] cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              <span>เปลี่ยนวัน</span>
            </button>
          </div>

          {loadingSlots ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={slot.isFull}
                  onClick={() => handleSelectTime(slot)}
                  className={`text-left rounded-xl border-2 p-6 flex items-center justify-between gap-4 transition-colors focus-visible:outline-3 focus-visible:outline-[#0F294A] ${
                    slot.isFull
                      ? 'border-red-300 bg-red-50 text-red-900 cursor-not-allowed'
                      : selectedTime === slot.time
                        ? 'border-[#0F294A] bg-[#0F294A] text-white cursor-pointer'
                        : 'border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] hover:bg-[#DCFCE7] hover:border-[#0F294A] cursor-pointer'
                  }`}
                >
                  <div>
                    <p className="text-2xl font-bold font-mono-num">{slot.time} น.</p>
                    <p
                      className={`text-[17px] mt-1 font-semibold ${
                        slot.isFull
                          ? 'text-[#B91C1C]'
                          : selectedTime === slot.time
                            ? 'text-[#A7F3D0]'
                            : 'text-[#065F46]'
                      }`}
                    >
                      {slot.isFull
                        ? 'คิวเต็มแล้ว'
                        : `ว่าง ${slot.remaining} จาก ${slot.capacity} คิว`}
                    </p>
                  </div>

                  {slot.isFull ? (
                    <span className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white text-[16px] font-bold whitespace-nowrap">
                      คิวเต็มแล้ว
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[18px] font-bold whitespace-nowrap">
                      <span>เลือกเวลานี้</span>
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* STEP 3: PATIENT FORM */}
      {step === 3 && (
        <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-3">
                <UserCheck className="w-7 h-7 text-[#065F46]" aria-hidden="true" />
                <span>กรอกข้อมูลผู้รับบริการ (ไม่ต้องเข้าสู่ระบบ)</span>
              </h2>
              <p className="text-[18px] text-[#065F46] font-bold mt-1">
                นัดหมาย: {formatThaiDateLong(selectedDate)} · เวลา {selectedTime} น.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[18px] font-semibold hover:bg-[#F4F7FB] cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              <span>เปลี่ยนเวลา</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl" noValidate>
            <div>
              <label htmlFor="patient-fullname" className="block text-[19px] font-bold text-[#0F294A] mb-2">
                ชื่อ-นามสกุล <span className="text-[#B91C1C]">*</span>
              </label>
              <input
                id="patient-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="เช่น นายสมชาย ใจดี"
                className="w-full px-4 py-3.5 text-[19px] rounded-xl border-2 border-[#CBD5E1] bg-white text-[#0F294A] focus:border-[#0F294A] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="patient-age" className="block text-[19px] font-bold text-[#0F294A] mb-2">
                  อายุ (ปี) <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  id="patient-age"
                  type="number"
                  min={1}
                  max={120}
                  required
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="เช่น 65"
                  className="w-full px-4 py-3.5 text-[19px] font-mono-num rounded-xl border-2 border-[#CBD5E1] bg-white text-[#0F294A] focus:border-[#0F294A] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="patient-phone" className="block text-[19px] font-bold text-[#0F294A] mb-2">
                  เบอร์โทรศัพท์ (10 หลัก) <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  id="patient-phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="0812345678"
                  className="w-full px-4 py-3.5 text-[19px] font-mono-num rounded-xl border-2 border-[#CBD5E1] bg-white text-[#0F294A] focus:border-[#0F294A] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="patient-disease" className="block text-[19px] font-bold text-[#0F294A] mb-2">
                โรคประจำตัว / อาการที่ต้องการรับบริการฝังเข็ม
              </label>
              <input
                id="patient-disease"
                type="text"
                value={disease}
                onChange={(e) => setDisease(e.target.value)}
                placeholder="เช่น ปวดหลังเรื้อรัง ข้อเข่าเสื่อม ความดันโลหิตสูง"
                className="w-full px-4 py-3.5 text-[19px] rounded-xl border-2 border-[#CBD5E1] bg-white text-[#0F294A] focus:border-[#0F294A] focus:outline-none"
              />
            </div>

            {formError && (
              <div
                role="alert"
                className="bg-red-50 border border-red-300 text-red-900 rounded-xl p-4 flex items-start gap-3 text-[18px]"
              >
                <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-[#B91C1C]" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 min-h-[58px] rounded-xl bg-[#0F294A] text-white text-[20px] font-bold hover:bg-[#163A66] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Check className="w-6 h-6 text-[#86EFAC]" aria-hidden="true" />
                <span>{submitting ? 'กำลังบันทึกการจอง...' : 'บันทึกการจอง'}</span>
              </button>

              <p className="text-[16px] text-slate-600">
                ระบบจำกัดการจอง 1 ท่านต่อ 1 คิวในวันเดียวกัน เพื่อความทั่วถึงของผู้รับบริการ
              </p>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
