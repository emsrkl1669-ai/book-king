import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarCog,
  CheckCircle,
  Edit3,
  Lock,
  LogOut,
  Megaphone,
  PlusCircle,
  Settings,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  BOOKING_STATUS_LABELS,
  type BookingStatus,
  formatPhoneDisplay,
  formatThaiDate,
  FOUNDATION_INFO,
  getBangkokTodayISO,
  TIME_SLOTS,
} from '../lib/constants';
import { AdminAnalyticsTab } from './AdminAnalyticsTab';
import { AdminScheduleTab } from './AdminScheduleTab';

export interface StaffSession {
  id: string;
  username: string;
  fullName: string;
  role: 'Staff' | 'Admin';
  email?: string;
  authMethod: 'password' | 'firebase';
}

interface StaffBookingRow {
  bookingId: string;
  patientId: string;
  bookingDate: string;
  bookingTime: string;
  queueNo: string;
  status: BookingStatus;
  isSpecial: boolean;
  priorityOrder: number;
  notes: string;
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
}

interface AdminUserRow {
  adminId: string;
  username: string;
  fullName: string;
  role: 'Staff' | 'Admin';
  email: string;
  isActive: boolean;
  lastLogin: string | null;
}

interface AuditLogRow {
  logId: string;
  username: string;
  action: string;
  logDate: string;
  ipAddress: string;
}

interface StaffPortalViewProps {
  onConfigUpdated: () => void;
}

export function StaffPortalView({ onConfigUpdated }: StaffPortalViewProps) {
  const [user, setUser] = useState<StaffSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<'queues' | 'schedule' | 'special' | 'analytics' | 'settings'>('queues');

  // Staff Queue Dashboard state
  const [selectedDate, setSelectedDate] = useState(getBangkokTodayISO());
  const [bookings, setBookings] = useState<StaffBookingRow[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    completed: 0,
    waiting: 0,
    inService: 0,
    cancelled: 0,
    special: 0,
  });
  const [actionMsg, setActionMsg] = useState('');

  // Complete visit modal
  const [completingBooking, setCompletingBooking] = useState<StaffBookingRow | null>(null);
  const [visitDiagnosis, setVisitDiagnosis] = useState('');
  const [visitNote, setVisitNote] = useState('');
  const [visitProvider, setVisitProvider] = useState('พจ.ธนากร วัฒนไชย');

  // Edit booking modal
  const [editingBooking, setEditingBooking] = useState<StaffBookingRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDisease, setEditDisease] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTime, setEditTime] = useState('');

  // Admin: Special Queue state
  const [spName, setSpName] = useState('');
  const [spAge, setSpAge] = useState('');
  const [spPhone, setSpPhone] = useState('');
  const [spDisease, setSpDisease] = useState('');
  const [spTime, setSpTime] = useState<string>(TIME_SLOTS[0]);
  const [spNotes, setSpNotes] = useState('');
  const [spInsertFront, setSpInsertFront] = useState(true);

  // Admin: Users, Settings, Audit Logs
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'Staff' | 'Admin'>('Staff');
  const [newEmail, setNewEmail] = useState('');

  const [globalPaused, setGlobalPaused] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [foundationPhone, setFoundationPhone] = useState<string>(FOUNDATION_INFO.phone);
  const [facebookUrl, setFacebookUrl] = useState<string>(FOUNDATION_INFO.facebookUrl);
  const [customLogoUrl, setCustomLogoUrl] = useState('');

  const checkMe = async () => {
    setCheckingAuth(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      }
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkMe();
  }, []);

  const loadBookings = async (dateISO: string) => {
    const res = await fetch(`/api/staff/bookings?date=${encodeURIComponent(dateISO)}`);
    if (res.ok) {
      const data = await res.json();
      setBookings(data.bookings || []);
      setSummary(data.summary);
    }
  };

  const loadAdminExtras = async () => {
    const [uRes, lRes, cRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/audit-logs'),
      fetch('/api/public/config'),
    ]);
    if (uRes.ok) setAdminUsers((await uRes.json()).users || []);
    if (lRes.ok) setAuditLogs((await lRes.json()).logs || []);
    if (cRes.ok) {
      const cfg = await cRes.json();
      setGlobalPaused(Boolean(cfg.globalBookingPaused));
      setAnnouncement(cfg.announcement || '');
      setFoundationPhone(cfg.foundationPhone || FOUNDATION_INFO.phone);
      setFacebookUrl(cfg.facebookUrl || FOUNDATION_INFO.facebookUrl);
      setCustomLogoUrl(cfg.customLogoUrl || '');
    }
  };

  useEffect(() => {
    if (!user) return;
    loadBookings(selectedDate);
    if (user.role === 'Admin') {
      loadAdminExtras();
    }
  }, [user, selectedDate]);

  useEffect(() => {
    if (!user) return;
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'queue_updated') {
          loadBookings(selectedDate);
        }
      } catch {
        // ignore heartbeat
      }
    };
    return () => es.close();
  }, [user, selectedDate]);

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      setUser(data.user);
    } catch {
      setLoginError('ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoginError('');
    setLoggingIn(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
        return;
      }
      setUser(data.user);
    } catch {
      setLoginError('การเข้าสู่ระบบด้วย Google ถูกยกเลิกหรือไม่สำเร็จ');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setActiveTab('queues');
  };

  const updateStatus = async (
    bookingId: string,
    status: BookingStatus,
    extra?: { diagnosis?: string; note?: string; providerName?: string }
  ) => {
    const res = await fetch(`/api/staff/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    });
    if (res.ok) {
      setActionMsg(`อัปเดตสถานะเป็น "${BOOKING_STATUS_LABELS[status]}" แล้ว`);
      await loadBookings(selectedDate);
    }
  };

  const reorderQueue = async (bookingId: string, direction: 'up' | 'down' | 'front') => {
    const res = await fetch(`/api/staff/bookings/${bookingId}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      setActionMsg('ปรับลำดับคิวเรียบร้อยแล้ว');
      await loadBookings(selectedDate);
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    const res = await fetch(`/api/staff/bookings/${editingBooking.bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: editName,
        age: Number(editAge),
        disease: editDisease,
        phoneNumber: editPhone,
        bookingTime: editTime,
      }),
    });
    if (res.ok) {
      setActionMsg(`บันทึกการแก้ไขคิว ${editingBooking.queueNo} เรียบร้อยแล้ว`);
      setEditingBooking(null);
      await loadBookings(selectedDate);
    }
  };

  const handleCompleteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!completingBooking) return;
    await updateStatus(completingBooking.bookingId, 'Completed', {
      diagnosis: visitDiagnosis,
      note: visitNote,
      providerName: visitProvider,
    });
    setCompletingBooking(null);
  };

  const handleAddSpecialQueue = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/special-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingDate: selectedDate,
        bookingTime: spTime,
        fullName: spName,
        age: Number(spAge),
        disease: spDisease,
        phoneNumber: spPhone,
        notes: spNotes,
        insertFront: spInsertFront,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setActionMsg(`เพิ่มคิวพิเศษ ${data.queueNo} เรียบร้อยแล้ว`);
      setSpName('');
      setSpAge('');
      setSpPhone('');
      setSpDisease('');
      setSpNotes('');
      await loadBookings(selectedDate);
    } else {
      setActionMsg(data.error || 'ไม่สามารถเพิ่มคิวพิเศษได้');
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        globalBookingPaused: globalPaused,
        announcement,
        foundationPhone,
        facebookUrl,
        customLogoUrl,
      }),
    });
    if (res.ok) {
      setActionMsg('บันทึกการตั้งค่าระบบและโลโก้เรียบร้อยแล้ว');
      onConfigUpdated();
    }
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setActionMsg('ไฟล์โลโก้ต้องมีขนาดไม่เกิน 1 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername,
        password: newPassword,
        fullName: newFullName,
        role: newRole,
        email: newEmail,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setActionMsg(`เพิ่มผู้ใช้งาน ${data.username} เรียบร้อยแล้ว`);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewEmail('');
      loadAdminExtras();
    } else {
      setActionMsg(data.error || 'ไม่สามารถเพิ่มผู้ใช้งานได้');
    }
  };

  const toggleUserActive = async (u: AdminUserRow) => {
    const res = await fetch(`/api/admin/users/${u.adminId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (res.ok) {
      loadAdminExtras();
    }
  };

  if (checkingAuth) {
    return (
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-10 text-center text-[18px] text-slate-600">
        กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-8 pb-16">
        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-xl bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] flex items-center justify-center">
              <Lock className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F294A]">
              เข้าสู่ระบบเจ้าหน้าที่ / ผู้ดูแลระบบ
            </h1>
            <p className="text-[17px] text-slate-600">
              สำหรับเจ้าหน้าที่จุดลงทะเบียนและผู้ดูแลระบบ มูลนิธิร่วมกุศลสมุทรปราการ
            </p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor="staff-username" className="block text-[17px] font-bold text-[#0F294A] mb-1.5">
                Username
              </label>
              <input
                id="staff-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="staff หรือ admin"
                className="w-full px-4 py-3 text-[18px] rounded-xl border border-[#CBD5E1] focus:border-[#0F294A] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="staff-password" className="block text-[17px] font-bold text-[#0F294A] mb-1.5">
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 text-[18px] rounded-xl border border-[#CBD5E1] focus:border-[#0F294A] focus:outline-none"
              />
            </div>

            {loginError && (
              <p role="alert" className="bg-red-50 border border-red-300 text-red-900 rounded-xl px-4 py-3 text-[16px]">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 rounded-xl bg-[#0F294A] text-white text-[18px] font-bold hover:bg-[#163A66] cursor-pointer"
            >
              {loggingIn ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200" />
            <span className="px-3 text-[14px] text-slate-500">หรือ</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loggingIn}
            className="w-full py-3.5 rounded-xl border border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] text-[17px] font-bold hover:bg-[#DCFCE7] cursor-pointer"
          >
            เข้าสู่ระบบด้วยบัญชี Google (เจ้าหน้าที่ที่ได้รับสิทธิ์)
          </button>

          <div className="bg-[#F4F7FB] border border-[#CBD5E1] rounded-xl p-4 text-[15px] text-slate-700 space-y-1">
            <p className="font-bold text-[#0F294A]">บัญชีทดสอบระบบ (Demo Credentials):</p>
            <p className="font-mono-num">เจ้าหน้าที่ (Staff): staff / staff1234</p>
            <p className="font-mono-num">ผู้ดูแลระบบ (Admin): admin / admin1234</p>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user.role === 'Admin';

  return (
    <div className="space-y-8 pb-16">
      {/* Staff Portal Header */}
      <div className="bg-[#0F294A] text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[15px] text-[#A7F3D0] font-semibold">
            {isAdmin ? 'ผู้ดูแลระบบ (Administrator)' : 'เจ้าหน้าที่จุดบริการ (Staff)'} · {user.username}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5">
            ระบบบริหารจัดการคิวและวันเปิดให้บริการ
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            aria-label="เลือกวันที่จัดการคิว"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-white/20 bg-white text-[16px] font-mono-num text-[#0F294A]"
          />
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[16px] font-semibold cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white border border-[#CBD5E1] rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('queues')}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold cursor-pointer transition-colors ${
            activeTab === 'queues' ? 'bg-[#0F294A] text-white' : 'text-[#0F294A] hover:bg-[#F4F7FB]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>จัดการคิวประจำวัน</span>
        </button>

        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold cursor-pointer transition-colors ${
                activeTab === 'schedule' ? 'bg-[#0F294A] text-white' : 'text-[#0F294A] hover:bg-[#ECFDF5]'
              }`}
            >
              <CalendarCog className="w-4 h-4" />
              <span>กำหนดวันเปิดจอง</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('special')}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold cursor-pointer transition-colors ${
                activeTab === 'special' ? 'bg-[#0F294A] text-white' : 'text-[#0F294A] hover:bg-[#F4F7FB]'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>เพิ่มคิวพิเศษ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold cursor-pointer transition-colors ${
                activeTab === 'analytics' ? 'bg-[#0F294A] text-white' : 'text-[#0F294A] hover:bg-[#F4F7FB]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>รายงาน & สถิติ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold cursor-pointer transition-colors ${
                activeTab === 'settings' ? 'bg-[#0F294A] text-white' : 'text-[#0F294A] hover:bg-[#F4F7FB]'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>ผู้ใช้งาน & ตั้งค่าระบบ</span>
            </button>
          </>
        )}
      </div>

      {actionMsg && (
        <div role="status" className="bg-[#ECFDF5] border border-[#86EFAC] text-[#0F294A] rounded-xl px-5 py-3.5 text-[17px] font-semibold">
          {actionMsg}
        </div>
      )}

      {/* TAB 1: DAILY QUEUE MANAGEMENT */}
      {activeTab === 'queues' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
              <p className="text-[15px] text-slate-600">จำนวนคิวทั้งหมด</p>
              <p className="text-3xl font-bold font-mono-num text-[#0F294A] mt-1">{summary.total}</p>
            </div>
            <div className="bg-[#ECFDF5] border border-[#86EFAC] rounded-2xl p-5">
              <p className="text-[15px] text-[#065F46] font-semibold">เข้ารับบริการแล้ว</p>
              <p className="text-3xl font-bold font-mono-num text-[#0F294A] mt-1">{summary.completed}</p>
            </div>
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
              <p className="text-[15px] text-slate-600">รอรับบริการ</p>
              <p className="text-3xl font-bold font-mono-num text-[#0F294A] mt-1">{summary.waiting}</p>
            </div>
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
              <p className="text-[15px] text-slate-600">ยกเลิก / ไม่มา</p>
              <p className="text-3xl font-bold font-mono-num text-[#B91C1C] mt-1">{summary.cancelled}</p>
            </div>
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5">
              <p className="text-[15px] text-slate-600">คิวพิเศษ</p>
              <p className="text-3xl font-bold font-mono-num text-[#0F294A] mt-1">{summary.special}</p>
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-[#0F294A]">
              รายชื่อคิววันที่ {formatThaiDate(selectedDate)}
            </h2>

            {bookings.length === 0 ? (
              <p className="text-[17px] text-slate-500 py-6">ยังไม่มีรายการจองคิวในวันที่เลือก</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#EFF4FA] text-[15px] text-[#0F294A]">
                      <th className="py-3 px-3 font-bold rounded-l-lg">เลขคิว</th>
                      <th className="py-3 px-3 font-bold">ช่วงเวลา</th>
                      <th className="py-3 px-3 font-bold">ผู้รับบริการ</th>
                      <th className="py-3 px-3 font-bold">โรค/อาการ</th>
                      <th className="py-3 px-3 font-bold">โทรศัพท์</th>
                      <th className="py-3 px-3 font-bold">สถานะ</th>
                      <th className="py-3 px-3 font-bold text-right rounded-r-lg">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[16px]">
                    {bookings.map((b) => (
                      <tr key={b.bookingId} className="hover:bg-[#F4F7FB]">
                        <td className="py-3.5 px-3 font-mono-num font-bold text-lg text-[#0F294A] whitespace-nowrap">
                          {b.queueNo}
                          {b.isSpecial && (
                            <span className="ml-1.5 text-[13px] font-sans text-[#B91C1C]">พิเศษ</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-mono-num whitespace-nowrap">{b.bookingTime}</td>
                        <td className="py-3.5 px-3">
                          <p className="font-bold text-[#0F294A]">{b.fullName}</p>
                          <p className="text-[14px] text-slate-500 font-mono-num">อายุ {b.age} ปี</p>
                        </td>
                        <td className="py-3.5 px-3 text-slate-700">{b.disease}</td>
                        <td className="py-3.5 px-3 font-mono-num whitespace-nowrap">
                          {formatPhoneDisplay(b.phoneNumber)}
                        </td>
                        <td className="py-3.5 px-3 font-semibold whitespace-nowrap">
                          <span
                            className={
                              b.status === 'InService'
                                ? 'text-[#065F46] font-bold'
                                : b.status === 'Cancelled' || b.status === 'NoShow'
                                  ? 'text-[#B91C1C]'
                                  : 'text-[#0F294A]'
                            }
                          >
                            {BOOKING_STATUS_LABELS[b.status] || b.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right whitespace-nowrap space-x-1.5">
                          {['Booked', 'Confirmed', 'Arrived'].includes(b.status) && (
                            <button
                              type="button"
                              onClick={() => updateStatus(b.bookingId, 'InService')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F294A] text-white text-[14px] font-bold hover:bg-[#163A66] cursor-pointer"
                            >
                              <Megaphone className="w-3.5 h-3.5 text-[#86EFAC]" />
                              <span>เรียกคิว</span>
                            </button>
                          )}

                          {['Booked', 'Confirmed'].includes(b.status) && (
                            <button
                              type="button"
                              onClick={() => updateStatus(b.bookingId, 'Arrived')}
                              className="px-2.5 py-1.5 rounded-lg border border-[#86EFAC] bg-[#ECFDF5] text-[#0F294A] text-[14px] font-semibold hover:bg-[#DCFCE7] cursor-pointer"
                            >
                              มาถึงแล้ว
                            </button>
                          )}

                          {['Arrived', 'InService', 'Confirmed'].includes(b.status) && (
                            <button
                              type="button"
                              onClick={() => {
                                setCompletingBooking(b);
                                setVisitDiagnosis(b.disease || '');
                                setVisitNote('');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#065F46] text-white text-[14px] font-bold hover:bg-[#047857] cursor-pointer"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>เสร็จสิ้น</span>
                            </button>
                          )}

                          <button
                            type="button"
                            title="แก้ไขข้อมูล"
                            onClick={() => {
                              setEditingBooking(b);
                              setEditName(b.fullName);
                              setEditAge(String(b.age));
                              setEditDisease(b.disease);
                              setEditPhone(b.phoneNumber);
                              setEditTime(b.bookingTime);
                            }}
                            className="p-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            title="เลื่อนคิวขึ้น"
                            onClick={() => reorderQueue(b.bookingId, 'up')}
                            className="p-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            title="เลื่อนคิวลง"
                            onClick={() => reorderQueue(b.bookingId, 'down')}
                            className="p-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[#0F294A] hover:bg-[#F4F7FB] cursor-pointer"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>

                          {['Booked', 'Confirmed'].includes(b.status) && (
                            <button
                              type="button"
                              onClick={() => updateStatus(b.bookingId, 'NoShow')}
                              className="px-2.5 py-1.5 rounded-lg border border-red-200 text-[#B91C1C] text-[14px] hover:bg-red-50 cursor-pointer"
                            >
                              ไม่มา
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ADMIN SCHEDULE CALENDAR (ADMIN ONLY) */}
      {activeTab === 'schedule' && isAdmin && (
        <AdminScheduleTab onScheduleChanged={onConfigUpdated} />
      )}

      {/* TAB 3: SPECIAL QUEUE (ADMIN ONLY) */}
      {activeTab === 'special' && isAdmin && (
        <form
          onSubmit={handleAddSpecialQueue}
          className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-4 max-w-2xl"
        >
          <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-2.5">
            <PlusCircle className="w-6 h-6 text-[#065F46]" />
            <span>เพิ่มคิวพิเศษ / คิวเร่งด่วน (วันที่ {formatThaiDate(selectedDate)})</span>
          </h2>

          <div>
            <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ชื่อ-นามสกุล</label>
            <input
              type="text"
              required
              value={spName}
              onChange={(e) => setSpName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">อายุ</label>
              <input
                type="number"
                required
                min={1}
                max={120}
                value={spAge}
                onChange={(e) => setSpAge(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
              />
            </div>
            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">เบอร์โทรศัพท์</label>
              <input
                type="tel"
                required
                value={spPhone}
                onChange={(e) => setSpPhone(e.target.value)}
                placeholder="0812345678"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ช่วงเวลา</label>
              <select
                value={spTime}
                onChange={(e) => setSpTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
              >
                {TIME_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s} น.
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">อาการ / โรค</label>
              <input
                type="text"
                value={spDisease}
                onChange={(e) => setSpDisease(e.target.value)}
                placeholder="ระบุอาการเร่งด่วน"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[16px] font-bold text-[#0F294A] mb-1">หมายเหตุ</label>
            <input
              type="text"
              value={spNotes}
              onChange={(e) => setSpNotes(e.target.value)}
              placeholder="เช่น ผู้สูงอายุวิงเวียน / เคสฉุกเฉิน"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
            />
          </div>

          <label className="flex items-center gap-3 text-[17px] font-semibold text-[#0F294A] cursor-pointer">
            <input
              type="checkbox"
              checked={spInsertFront}
              onChange={(e) => setSpInsertFront(e.target.checked)}
              className="w-5 h-5 accent-[#0F294A]"
            />
            <span>แทรกคิวไว้ลำดับต้นของคิวที่รอ</span>
          </label>

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-[#0F294A] text-white text-[18px] font-bold hover:bg-[#163A66] cursor-pointer"
          >
            เพิ่มคิวพิเศษทันที
          </button>
        </form>
      )}

      {/* TAB 4: ANALYTICS & REPORTS */}
      {activeTab === 'analytics' && isAdmin && <AdminAnalyticsTab />}

      {/* TAB 5: USERS, AUDIT LOGS & SYSTEM SETTINGS */}
      {activeTab === 'settings' && isAdmin && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <form
              onSubmit={handleSaveSettings}
              className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-5"
            >
              <h2 className="text-2xl font-bold text-[#0F294A]">ตั้งค่าระบบและตราสัญลักษณ์มูลนิธิ</h2>

              <label className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={globalPaused}
                  onChange={(e) => setGlobalPaused(e.target.checked)}
                  className="w-5 h-5 accent-[#B91C1C]"
                />
                <span className="text-[17px] font-semibold text-red-900">
                  ปิดรับจองคิวออนไลน์ชั่วคราวทั้งระบบ (Global Pause)
                </span>
              </label>

              <div>
                <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ข้อความประกาศหน้าแรก</label>
                <textarea
                  rows={3}
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                />
              </div>

              <div>
                <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ลิงก์เพจ Facebook</label>
                <input
                  type="url"
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[15px]"
                />
              </div>

              <div>
                <label className="block text-[16px] font-bold text-[#0F294A] mb-1">เบอร์โทรศัพท์ติดต่อเจ้าหน้าที่</label>
                <input
                  type="text"
                  value={foundationPhone}
                  onChange={(e) => setFoundationPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
                />
              </div>

              <div className="border border-[#CBD5E1] rounded-xl p-4 space-y-3 bg-[#F4F7FB]">
                <p className="text-[16px] font-bold text-[#0F294A]">
                  ไฟล์โลโก้ต้นฉบับมูลนิธิร่วมกุศลสมุทรปราการ (Logo Policy)
                </p>
                <p className="text-[14px] text-slate-600">
                  ระบบแสดงผลไฟล์ต้นฉบับโดยคงสี รูปแบบ และสัดส่วนเดิมทั้งหมด ไม่มีการปรับแก้หรือยืดหด
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white border border-[#CBD5E1] rounded-xl p-1 flex items-center justify-center shrink-0">
                    <img
                      src={customLogoUrl || FOUNDATION_INFO.defaultLogoPath}
                      alt={FOUNDATION_INFO.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="text-[15px]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-[#0F294A] text-white text-[18px] font-bold hover:bg-[#163A66] cursor-pointer"
              >
                บันทึกการตั้งค่าระบบ
              </button>
            </form>

            {/* User Management */}
            <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 sm:p-8 space-y-6">
              <h2 className="text-2xl font-bold text-[#0F294A] flex items-center gap-2.5">
                <UserPlus className="w-6 h-6 text-[#065F46]" />
                <span>จัดการผู้ใช้งานและสิทธิ์ (RBAC)</span>
              </h2>

              <form onSubmit={handleCreateUser} className="space-y-3 pb-5 border-b border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Username ใหม่"
                    className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                  />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Password (6+ ตัว)"
                    className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="ชื่อ-นามสกุล"
                    className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'Staff' | 'Admin')}
                    className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                  >
                    <option value="Staff">เจ้าหน้าที่ (Staff)</option>
                    <option value="Admin">ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="อีเมล Google (ถ้ามี สำหรับ Google Sign-In)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[16px]"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#0F294A] text-white text-[16px] font-bold hover:bg-[#163A66] cursor-pointer"
                >
                  เพิ่มผู้ใช้งานใหม่
                </button>
              </form>

              <div className="space-y-2.5">
                {adminUsers.map((u) => (
                  <div
                    key={u.adminId}
                    className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-[#F4F7FB] border border-[#CBD5E1]"
                  >
                    <div>
                      <p className="font-bold text-[#0F294A]">
                        {u.username} · <span className="text-[#065F46]">{u.role}</span>
                      </p>
                      <p className="text-[14px] text-slate-600">{u.fullName || u.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleUserActive(u)}
                      className={`px-3 py-1.5 rounded-lg text-[14px] font-bold cursor-pointer ${
                        u.isActive
                          ? 'bg-[#ECFDF5] text-[#065F46] border border-[#86EFAC]'
                          : 'bg-red-50 text-[#B91C1C] border border-red-200'
                      }`}
                    >
                      {u.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-[#0F294A] flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-[#065F46]" />
              <span>บันทึกการตรวจสอบความปลอดภัย (Audit Logs)</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[15px]">
                <thead>
                  <tr className="bg-[#EFF4FA] text-[#0F294A]">
                    <th className="py-2.5 px-3 font-bold rounded-l-lg">วันเวลา</th>
                    <th className="py-2.5 px-3 font-bold">ผู้ใช้งาน</th>
                    <th className="py-2.5 px-3 font-bold">กิจกรรม</th>
                    <th className="py-2.5 px-3 font-bold text-right rounded-r-lg">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.logId}>
                      <td className="py-2.5 px-3 font-mono-num text-slate-600 whitespace-nowrap">
                        {new Date(log.logDate).toLocaleString('th-TH')}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#0F294A]">{log.username}</td>
                      <td className="py-2.5 px-3 text-slate-800">{log.action}</td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-slate-600">{log.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Complete Visit & Record Medical Note */}
      {completingBooking && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCompleteSubmit}
            className="bg-white border border-[#CBD5E1] rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-4"
          >
            <h3 className="text-2xl font-bold text-[#0F294A]">
              บันทึกผลการรับบริการ · คิว {completingBooking.queueNo}
            </h3>
            <p className="text-[17px] text-slate-600">{completingBooking.fullName}</p>

            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">อาการ / การวินิจฉัย</label>
              <input
                type="text"
                required
                value={visitDiagnosis}
                onChange={(e) => setVisitDiagnosis(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
              />
            </div>

            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ผู้ให้บริการ (แพทย์/ผู้ฝังเข็ม)</label>
              <input
                type="text"
                required
                value={visitProvider}
                onChange={(e) => setVisitProvider(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
              />
            </div>

            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">หมายเหตุ / แผนติดตามผล</label>
              <textarea
                rows={3}
                value={visitNote}
                onChange={(e) => setVisitNote(e.target.value)}
                placeholder="เช่น ติดตามผลสัปดาห์หน้า"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCompletingBooking(null)}
                className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-slate-700 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0F294A] text-white font-bold hover:bg-[#163A66] cursor-pointer"
              >
                บันทึกและปิดคิว
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Patient/Booking Info */}
      {editingBooking && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-[#CBD5E1] rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-4"
          >
            <h3 className="text-2xl font-bold text-[#0F294A]">
              แก้ไขข้อมูลผู้รับบริการ · คิว {editingBooking.queueNo}
            </h3>

            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ชื่อ-นามสกุล</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[16px] font-bold text-[#0F294A] mb-1">อายุ</label>
                <input
                  type="number"
                  required
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[16px] font-bold text-[#0F294A] mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px] font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">ช่วงเวลา</label>
              <select
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
              >
                {TIME_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s} น.
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[16px] font-bold text-[#0F294A] mb-1">โรคประจำตัว / อาการ</label>
              <input
                type="text"
                value={editDisease}
                onChange={(e) => setEditDisease(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[17px]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingBooking(null)}
                className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-slate-700 font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0F294A] text-white font-bold hover:bg-[#163A66] cursor-pointer"
              >
                บันทึกการแก้ไข
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
