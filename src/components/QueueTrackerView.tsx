import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Maximize2, Minimize2, RefreshCw, Search, Volume2, VolumeX } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  formatThaiDateLong,
  getBangkokTodayISO,
} from '../lib/constants';

interface QueueTrackerData {
  date: string;
  currentServing: Array<{
    queueNo: string;
    bookingTime: string;
    isSpecial: boolean;
  }>;
  waitingCount: number;
  completedCount: number;
  totalActive: number;
  waitingList: Array<{
    position: number;
    queueNo: string;
    bookingTime: string;
    status: string;
    isSpecial: boolean;
  }>;
  trackedQueue: {
    bookingId: string;
    queueNo: string;
    fullName: string;
    bookingDate: string;
    bookingTime: string;
    status: string;
    queuesAhead: number;
    isSpecial: boolean;
  } | null;
}

interface QueueTrackerViewProps {
  initialQuery?: string;
}

export function QueueTrackerView({ initialQuery = '' }: QueueTrackerViewProps) {
  const [dateISO, setDateISO] = useState(getBangkokTodayISO());
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [data, setData] = useState<QueueTrackerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastSpokenRef = useRef<string>('');
  const boardRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async (d: string, q: string) => {
    try {
      const params = new URLSearchParams({ date: d });
      if (q.trim()) params.set('query', q.trim());
      const res = await fetch(`/api/public/queue-status?${params.toString()}`);
      if (res.ok) {
        const json: QueueTrackerData = await res.json();
        setData(json);

        const currentQ = json.currentServing.map((c) => c.queueNo).join(', ');
        if (voiceOn && currentQ && currentQ !== lastSpokenRef.current && 'speechSynthesis' in window) {
          lastSpokenRef.current = currentQ;
          const utter = new SpeechSynthesisUtterance(
            `ขอเชิญคิวหมายเลข ${currentQ.split('').join(' ')} เข้ารับบริการฝังเข็มค่ะ`
          );
          utter.lang = 'th-TH';
          utter.rate = 0.9;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStatus(dateISO, activeQuery);
  }, [dateISO, activeQuery]);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'queue_updated') {
          fetchStatus(dateISO, activeQuery);
        }
      } catch {
        // ignore heartbeat
      }
    };
    return () => es.close();
  }, [dateISO, activeQuery, voiceOn]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement && boardRef.current) {
      await boardRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const servingText =
    data && data.currentServing.length > 0
      ? data.currentServing.map((s) => s.queueNo).join(' / ')
      : 'ยังไม่มีคิวกำลังรับบริการ';

  return (
    <div ref={boardRef} className={`space-y-8 pb-16 ${isFullscreen ? 'bg-[#F4F7FB] p-8 overflow-y-auto' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0F294A]">
            ระบบติดตามสถานะคิว Real-Time
          </h1>
          <p className="text-[18px] text-slate-600 mt-1">
            {formatThaiDateLong(dateISO)} · อัปเดตอัตโนมัติทันทีเมื่อเจ้าหน้าที่เรียกคิว
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            aria-label="เลือกวันที่ตรวจสอบคิว"
            value={dateISO}
            onChange={(e) => setDateISO(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[17px] font-mono-num text-[#0F294A]"
          />

          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[16px] font-semibold cursor-pointer transition-colors ${
              voiceOn
                ? 'border-[#0F294A] bg-[#0F294A] text-white'
                : 'border-[#CBD5E1] bg-white text-[#0F294A] hover:bg-[#ECFDF5]'
            }`}
          >
            {voiceOn ? <Volume2 className="w-5 h-5 text-[#86EFAC]" /> : <VolumeX className="w-5 h-5" />}
            <span>{voiceOn ? 'เปิดเสียงเรียกคิว' : 'ปิดเสียงเรียกคิว'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[#0F294A] text-[16px] font-semibold hover:bg-[#ECFDF5] cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            <span>{isFullscreen ? 'ย่อหน้าจอ' : 'โหมดจอแสดงผล'}</span>
          </button>
        </div>
      </div>

      {/* Primary Live Queue Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 bg-[#0F294A] text-white rounded-2xl p-8 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xl font-bold text-[#A7F3D0]">กำลังเรียกคิว</p>
            <button
              type="button"
              onClick={() => fetchStatus(dateISO, activeQuery)}
              aria-label="รีเฟรชข้อมูลคิว"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          <div className="py-8">
            <p className="text-6xl sm:text-7xl font-bold font-mono-num tracking-tight text-[#86EFAC]">
              {loading ? '...' : servingText}
            </p>
          </div>

          <div className="pt-5 border-t border-white/20 flex flex-wrap gap-6 text-[18px] text-slate-200">
            <span>รอรับบริการ: <strong className="text-white font-mono-num">{data?.waitingCount ?? 0}</strong> คิว</span>
            <span>เสร็จสิ้นแล้ว: <strong className="text-[#86EFAC] font-mono-num">{data?.completedCount ?? 0}</strong> คิว</span>
          </div>
        </div>

        {/* Personal Queue Lookup Card */}
        <div className="lg:col-span-6 bg-white border border-[#CBD5E1] rounded-2xl p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-[#0F294A]">ตรวจสอบคิวของท่าน</h2>
            <p className="text-[17px] text-slate-600">
              กรอกเลขคิว (เช่น A007) หรือเบอร์โทรศัพท์ 10 หลัก เพื่อดูจำนวนคิวที่เหลือ
            </p>
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 pt-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="เลขคิว หรือ เบอร์โทรศัพท์"
                className="flex-1 px-4 py-3.5 text-[19px] font-mono-num rounded-xl border-2 border-[#CBD5E1] focus:border-[#0F294A] focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0F294A] text-white text-[18px] font-bold hover:bg-[#163A66] cursor-pointer whitespace-nowrap"
              >
                <Search className="w-5 h-5 text-[#86EFAC]" aria-hidden="true" />
                <span>ตรวจสอบ</span>
              </button>
            </form>
          </div>

          {activeQuery && (
            <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-xl p-6">
              {data?.trackedQueue ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  <div>
                    <p className="text-[15px] text-[#065F46] font-semibold">คิวของท่าน</p>
                    <p className="text-4xl font-bold font-mono-num text-[#0F294A]">
                      {data.trackedQueue.queueNo}
                    </p>
                  </div>
                  <div>
                    <p className="text-[15px] text-[#065F46] font-semibold">เหลืออีก</p>
                    <p className="text-3xl font-bold font-mono-num text-[#0F294A]">
                      {data.trackedQueue.status === 'InService'
                        ? 'ถึงคิวท่านแล้ว'
                        : data.trackedQueue.status === 'Completed'
                          ? 'เสร็จสิ้น'
                          : `${data.trackedQueue.queuesAhead} คิว`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[15px] text-[#065F46] font-semibold">สถานะปัจจุบัน</p>
                    <p className="text-[18px] font-bold text-[#0F294A]">
                      {BOOKING_STATUS_LABELS[data.trackedQueue.status as BookingStatus] ||
                        data.trackedQueue.status}
                    </p>
                    <p className="text-[15px] text-slate-700 font-mono-num">
                      {data.trackedQueue.bookingTime} น.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[18px] text-[#0F294A]">
                  ไม่พบคิวที่ตรงกับ &ldquo;{activeQuery}&rdquo; ในวันที่ {formatThaiDateLong(dateISO)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Waiting List */}
      <section className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-[#0F294A] mb-5">ลำดับคิวที่รอเข้ารับบริการ</h2>
        {!data || data.waitingList.length === 0 ? (
          <p className="text-[18px] text-slate-600 py-6">ไม่มีคิวที่รอเข้ารับบริการในขณะนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EFF4FA] text-[17px] text-[#0F294A]">
                  <th className="py-3.5 px-4 font-bold rounded-l-lg">ลำดับรอ</th>
                  <th className="py-3.5 px-4 font-bold">หมายเลขคิว</th>
                  <th className="py-3.5 px-4 font-bold">รอบเวลา</th>
                  <th className="py-3.5 px-4 font-bold text-right rounded-r-lg">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[19px]">
                {data.waitingList.map((row) => (
                  <tr key={row.queueNo} className="hover:bg-[#F4F7FB]">
                    <td className="py-4 px-4 font-mono-num text-slate-600">{row.position}</td>
                    <td className="py-4 px-4 font-mono-num font-bold text-2xl text-[#0F294A]">
                      {row.queueNo}
                      {row.isSpecial && (
                        <span className="ml-3 text-[15px] font-sans font-bold text-[#B91C1C]">
                          (คิวพิเศษ)
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono-num text-slate-800">{row.bookingTime} น.</td>
                    <td className="py-4 px-4 text-right font-semibold text-[#065F46]">
                      {BOOKING_STATUS_LABELS[row.status as BookingStatus] || row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
