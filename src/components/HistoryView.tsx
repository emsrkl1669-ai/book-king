import { useState, type FormEvent } from 'react';
import { FileText, Search, Ticket, XCircle } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  formatThaiDate,
} from '../lib/constants';
import { type TicketPayload } from '../lib/exportUtils';
import { DigitalTicketCard } from './DigitalTicketCard';

interface VisitRecord {
  visitId: string;
  visitDate: string;
  queueNo: string;
  diagnosis: string;
  note: string;
  providerName: string;
  fullName: string;
  maskedPhone: string;
}

interface BookingRecord {
  bookingId: string;
  queueNo: string;
  bookingDate: string;
  bookingTime: string;
  status: string;
  isSpecial: boolean;
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  maskedPhone: string;
}

interface HistoryViewProps {
  logoUrl?: string;
  foundationPhone?: string;
  onTrackQueue: (queueNo: string) => void;
}

export function HistoryView({
  logoUrl,
  foundationPhone,
  onTrackQueue,
}: HistoryViewProps) {
  const [query, setQuery] = useState('0812345678');
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketPayload | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string>('');

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setCancelStatus('');
    try {
      const res = await fetch(`/api/public/history?query=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setVisits(data.visits || []);
        setBookings(data.bookings || []);
        setSearched(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleCancelBooking = async (b: BookingRecord) => {
    const res = await fetch(`/api/public/bookings/${b.bookingId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: b.phoneNumber }),
    });
    const json = await res.json();
    if (res.ok) {
      setCancelStatus(`ยกเลิกคิว ${b.queueNo} เรียบร้อยแล้ว`);
      runSearch(query);
    } else {
      setCancelStatus(json.error || 'ไม่สามารถยกเลิกคิวได้');
    }
  };

  if (selectedTicket) {
    return (
      <div className="space-y-6 pb-16">
        <button
          type="button"
          onClick={() => setSelectedTicket(null)}
          className="px-5 py-3 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[18px] font-semibold hover:bg-[#F4F7FB] cursor-pointer"
        >
          ← กลับไปหน้าประวัติการรับบริการ
        </button>
        <DigitalTicketCard
          ticket={selectedTicket}
          logoUrl={logoUrl}
          foundationPhone={foundationPhone}
          onTrackQueue={() => onTrackQueue(selectedTicket.queueNo)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#0F294A]">
          ประวัติการรับบริการและใบนัดหมาย
        </h1>
        <p className="text-[18px] text-slate-600 mt-1">
          ค้นหาด้วยเบอร์โทรศัพท์ 10 หลัก ชื่อ-นามสกุล หรือเลขคิว (ตัวอย่าง: 0812345678)
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#CBD5E1] rounded-2xl p-6 flex flex-col sm:flex-row gap-4"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="กรอกเบอร์โทรศัพท์ ชื่อ-นามสกุล หรือเลขคิว"
          className="flex-1 px-4 py-3.5 text-[19px] rounded-xl border-2 border-[#CBD5E1] focus:border-[#0F294A] focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 min-h-[54px] rounded-xl bg-[#0F294A] text-white text-[19px] font-bold hover:bg-[#163A66] cursor-pointer whitespace-nowrap"
        >
          <Search className="w-5 h-5 text-[#86EFAC]" aria-hidden="true" />
          <span>{loading ? 'กำลังค้นหา...' : 'ค้นหาข้อมูล'}</span>
        </button>
      </form>

      {cancelStatus && (
        <div role="status" className="bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] rounded-xl px-5 py-4 text-[18px] font-semibold">
          {cancelStatus}
        </div>
      )}

      {searched && (
        <div className="space-y-8">
          <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-5">
            <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-3">
              <Ticket className="w-6 h-6 text-[#065F46]" aria-hidden="true" />
              <span>รายการนัดหมายจองคิว</span>
            </h2>

            {bookings.length === 0 ? (
              <p className="text-[18px] text-slate-600">ไม่พบรายการจองคิวที่ตรงกับคำค้นหา</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#EFF4FA] text-[16px] text-[#0F294A]">
                      <th className="py-3.5 px-4 font-bold rounded-l-lg">วันที่นัด</th>
                      <th className="py-3.5 px-4 font-bold">เวลา</th>
                      <th className="py-3.5 px-4 font-bold">เลขคิว</th>
                      <th className="py-3.5 px-4 font-bold">ชื่อผู้รับบริการ</th>
                      <th className="py-3.5 px-4 font-bold">สถานะ</th>
                      <th className="py-3.5 px-4 font-bold text-right rounded-r-lg">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[18px]">
                    {bookings.map((b) => (
                      <tr key={b.bookingId} className="hover:bg-[#F4F7FB]">
                        <td className="py-4 px-4 font-mono-num">{formatThaiDate(b.bookingDate)}</td>
                        <td className="py-4 px-4 font-mono-num">{b.bookingTime} น.</td>
                        <td className="py-4 px-4 font-mono-num font-bold text-[#0F294A]">
                          {b.queueNo}
                        </td>
                        <td className="py-4 px-4 font-semibold text-[#0F294A]">{b.fullName}</td>
                        <td className="py-4 px-4 font-medium text-[#065F46]">
                          {BOOKING_STATUS_LABELS[b.status as BookingStatus] || b.status}
                        </td>
                        <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                          {b.status !== 'Cancelled' && (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTicket({
                                  bookingId: b.bookingId,
                                  queueNo: b.queueNo,
                                  fullName: b.fullName,
                                  bookingDate: b.bookingDate,
                                  bookingTime: b.bookingTime,
                                  phoneNumber: b.phoneNumber,
                                  maskedPhone: b.maskedPhone,
                                  isSpecial: b.isSpecial,
                                })
                              }
                              className="px-4 py-2 rounded-lg bg-[#0F294A] text-white text-[15px] font-semibold hover:bg-[#163A66] cursor-pointer"
                            >
                              ดูบัตรคิว
                            </button>
                          )}
                          {['Booked', 'Confirmed'].includes(b.status) && (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b)}
                              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-300 text-[#B91C1C] text-[15px] font-semibold hover:bg-red-50 cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" aria-hidden="true" />
                              <span>ยกเลิก</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-5">
            <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-3">
              <FileText className="w-6 h-6 text-[#065F46]" aria-hidden="true" />
              <span>ประวัติการเข้ารับบริการฝังเข็ม</span>
            </h2>

            {visits.length === 0 ? (
              <p className="text-[18px] text-slate-600">ยังไม่มีประวัติการเข้ารับบริการย้อนหลัง</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#EFF4FA] text-[16px] text-[#0F294A]">
                      <th className="py-3.5 px-4 font-bold rounded-l-lg">วันที่เข้ารับบริการ</th>
                      <th className="py-3.5 px-4 font-bold">เลขคิว</th>
                      <th className="py-3.5 px-4 font-bold">ผู้ให้บริการ</th>
                      <th className="py-3.5 px-4 font-bold">อาการ</th>
                      <th className="py-3.5 px-4 font-bold rounded-r-lg">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[18px]">
                    {visits.map((v) => (
                      <tr key={v.visitId} className="hover:bg-[#F4F7FB]">
                        <td className="py-4 px-4 font-mono-num">{formatThaiDate(v.visitDate)}</td>
                        <td className="py-4 px-4 font-mono-num font-bold text-[#0F294A]">
                          {v.queueNo || '-'}
                        </td>
                        <td className="py-4 px-4 font-semibold text-[#0F294A]">{v.providerName}</td>
                        <td className="py-4 px-4 text-slate-800">{v.diagnosis}</td>
                        <td className="py-4 px-4 text-slate-600">{v.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
