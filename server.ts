import dotenv from 'dotenv';
dotenv.config();

import express, { type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, asc, desc, eq, gte, ilike, lte, ne, or, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  adminUsers,
  auditLogs,
  bookings,
  patients,
  scheduleSettings,
  systemSettings,
  users,
  visits,
} from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import {
  clearSessionCookie,
  createSessionToken,
  getClientIp,
  hashPassword,
  requireAdmin,
  requireStaff,
  resolveAuthUser,
  setSessionCookie,
  verifyPassword,
  type AuthRequest,
} from './src/middleware/auth.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  DEFAULT_SLOT_CAPACITY,
  getBangkokTodayISO,
  isValidThaiPhone,
  maskPhoneNumber,
  TIME_SLOTS,
} from './src/lib/constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// Real-Time SSE clients registry
const sseClients = new Set<Response>();

function broadcastQueueUpdate(eventType: string, payload: Record<string, unknown> = {}): void {
  const data = JSON.stringify({
    type: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function logAudit(
  userId: string,
  username: string,
  action: string,
  req: Request
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: userId.slice(0, 128),
      username: username.slice(0, 100),
      action: action.slice(0, 255),
      ipAddress: getClientIp(req),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

async function getSystemSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

async function getEffectiveDayRule(dateISO: string) {
  const [override] = await db
    .select()
    .from(scheduleSettings)
    .where(eq(scheduleSettings.scheduleDate, dateISO))
    .limit(1);

  // 100% Admin-only schedule: only dates explicitly opened by an Admin are open.
  if (override && override.updatedBy !== 'system') {
    return {
      scheduleDate: dateISO,
      isOpen: override.isOpen,
      isPaused: override.isPaused,
      slotCapacity: override.slotCapacity,
      reason: override.reason,
      configuredByAdmin: true,
    };
  }

  return {
    scheduleDate: dateISO,
    isOpen: false,
    isPaused: false,
    slotCapacity: DEFAULT_SLOT_CAPACITY,
    reason: 'ยังไม่เปิดให้จอง (กำหนดวันจองคิวโดยผู้ดูแลระบบเท่านั้น)',
    configuredByAdmin: false,
  };
}

// Lazy seed middleware on API routes
app.use('/api', async (_req, res, next) => {
  try {
    await ensureSeeded();
    next();
  } catch (err) {
    console.error('Database initialization error:', err);
    res.status(500).json({ error: 'ระบบไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง' });
  }
});

// Real-Time SSE Endpoint (Section 9)
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ==================== PUBLIC ROUTES ====================

app.get('/api/public/config', async (_req: Request, res: Response) => {
  try {
    const settings = await getSystemSettingsMap();
    res.json({
      globalBookingPaused: settings.global_booking_paused === 'true',
      announcement: settings.announcement || '',
      foundationPhone: settings.foundation_phone || '02-175-8668',
      customLogoUrl: settings.custom_logo_url || '',
      facebookUrl:
        settings.facebook_url ||
        'https://www.facebook.com/profile.php?id=100068860846239&locale=th_TH',
      adminOnlySchedule: true,
    });
  } catch (err) {
    console.error('Error loading public config:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดการตั้งค่าระบบได้' });
  }
});

app.get('/api/public/calendar', async (req: Request, res: Response) => {
  try {
    const monthParam = String(req.query.month || getBangkokTodayISO().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return res.status(400).json({ error: 'รูปแบบเดือนไม่ถูกต้อง (YYYY-MM)' });
    }

    const [yearStr, monStr] = monthParam.split('-');
    const year = Number(yearStr);
    const month = Number(monStr);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startDate = `${monthParam}-01`;
    const endDate = `${monthParam}-${String(daysInMonth).padStart(2, '0')}`;

    const settings = await getSystemSettingsMap();
    const globalPaused = settings.global_booking_paused === 'true';

    const overrides = await db
      .select()
      .from(scheduleSettings)
      .where(
        and(
          gte(scheduleSettings.scheduleDate, startDate),
          lte(scheduleSettings.scheduleDate, endDate)
        )
      );

    const overrideMap = new Map(overrides.map((o) => [o.scheduleDate, o]));

    const monthBookings = await db
      .select({
        bookingDate: bookings.bookingDate,
        total: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          gte(bookings.bookingDate, startDate),
          lte(bookings.bookingDate, endDate),
          ne(bookings.status, 'Cancelled'),
          eq(bookings.isSpecial, false)
        )
      )
      .groupBy(bookings.bookingDate);

    const countMap = new Map(monthBookings.map((b) => [b.bookingDate, Number(b.total)]));
    const today = getBangkokTodayISO();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${monthParam}-${String(d).padStart(2, '0')}`;
      const ov = overrideMap.get(iso);
      const isAdminConfigured = Boolean(ov && ov.updatedBy !== 'system');
      // 100% Admin-only: closed unless an Admin explicitly set isOpen = true
      const isOpen = isAdminConfigured && Boolean(ov?.isOpen);
      const isPaused = globalPaused || (isAdminConfigured ? Boolean(ov?.isPaused) : false);
      const slotCapacity = isAdminConfigured && ov ? ov.slotCapacity : DEFAULT_SLOT_CAPACITY;
      const dailyCapacity = slotCapacity * TIME_SLOTS.length;
      const bookedCount = countMap.get(iso) || 0;
      const remaining = Math.max(0, dailyCapacity - bookedCount);
      const isPast = iso < today;

      let state: 'open' | 'closed' | 'full' | 'paused' = 'open';
      if (!isOpen || isPast) {
        state = 'closed';
      } else if (isPaused) {
        state = 'paused';
      } else if (remaining <= 0) {
        state = 'full';
      }

      days.push({
        date: iso,
        day: d,
        state,
        isOpen,
        isPaused,
        isPast,
        hasOverride: isAdminConfigured,
        updatedBy: isAdminConfigured ? ov?.updatedBy || 'admin' : '',
        bookedCount,
        dailyCapacity,
        remaining,
        slotCapacity,
        reason:
          (isAdminConfigured ? ov?.reason : '') ||
          (isOpen ? '' : 'ยังไม่เปิดให้จอง (กำหนดวันจองคิวโดยผู้ดูแลระบบเท่านั้น)'),
      });
    }

    res.json({ month: monthParam, globalPaused, adminOnlySchedule: true, days });
  } catch (err) {
    console.error('Error loading calendar:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลปฏิทินนัดหมายได้' });
  }
});

app.get('/api/public/slots', async (req: Request, res: Response) => {
  try {
    const dateISO = String(req.query.date || getBangkokTodayISO());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง' });
    }

    const settings = await getSystemSettingsMap();
    const globalPaused = settings.global_booking_paused === 'true';
    const dayRule = await getEffectiveDayRule(dateISO);

    const activeBookings = await db
      .select({
        bookingTime: bookings.bookingTime,
        total: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingDate, dateISO),
          ne(bookings.status, 'Cancelled'),
          eq(bookings.isSpecial, false)
        )
      )
      .groupBy(bookings.bookingTime);

    const slotCountMap = new Map(activeBookings.map((b) => [b.bookingTime, Number(b.total)]));

    const slots = TIME_SLOTS.map((slot) => {
      const booked = slotCountMap.get(slot) || 0;
      const capacity = dayRule.slotCapacity;
      const remaining = Math.max(0, capacity - booked);
      return {
        time: slot,
        booked,
        capacity,
        remaining,
        isFull: remaining <= 0,
      };
    });

    res.json({
      date: dateISO,
      isOpen: dayRule.isOpen && !globalPaused && !dayRule.isPaused,
      isPaused: globalPaused || dayRule.isPaused,
      reason: globalPaused
        ? 'ระบบปิดรับจองชั่วคราวโดยผู้ดูแลระบบ'
        : dayRule.reason,
      slots,
    });
  } catch (err) {
    console.error('Error loading slots:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลช่วงเวลาได้' });
  }
});

app.post('/api/public/bookings', async (req: Request, res: Response) => {
  try {
    const { bookingDate, bookingTime, fullName, age, disease, phoneNumber } = req.body || {};

    const cleanName = String(fullName || '').trim();
    const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
    const cleanDisease = String(disease || '').trim() || 'ไม่ได้ระบุ';
    const parsedAge = Number(age);
    const dateISO = String(bookingDate || '').trim();
    const timeSlot = String(bookingTime || '').trim();

    if (!cleanName || cleanName.length < 2 || cleanName.length > 140) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง' });
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      return res.status(400).json({ error: 'กรุณากรอกอายุเป็นตัวเลขที่ถูกต้อง (1-120 ปี)' });
    }
    if (!isValidThaiPhone(cleanPhone)) {
      return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์มือถือ 10 หลัก (ขึ้นต้นด้วย 0)' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || dateISO < getBangkokTodayISO()) {
      return res.status(400).json({ error: 'ไม่สามารถจองวันย้อนหลังหรือวันที่รูปแบบไม่ถูกต้องได้' });
    }
    if (!TIME_SLOTS.includes(timeSlot as (typeof TIME_SLOTS)[number])) {
      return res.status(400).json({ error: 'ช่วงเวลาที่เลือกไม่ถูกต้อง' });
    }

    const settings = await getSystemSettingsMap();
    if (settings.global_booking_paused === 'true') {
      return res.status(409).json({ error: 'ขณะนี้ระบบปิดรับจองชั่วคราว กรุณาติดต่อเจ้าหน้าที่ 02-175-8668' });
    }

    const dayRule = await getEffectiveDayRule(dateISO);
    if (!dayRule.isOpen || dayRule.isPaused) {
      return res.status(409).json({ error: dayRule.reason || 'วันที่เลือกปิดให้บริการจองคิว' });
    }

    const createdBooking = await db.transaction(async (tx) => {
      // Prevent duplicate booking on the same day by phone number
      const duplicateCheck = await tx
        .select({ bookingId: bookings.bookingId, queueNo: bookings.queueNo })
        .from(bookings)
        .innerJoin(patients, eq(bookings.patientId, patients.patientId))
        .where(
          and(
            eq(bookings.bookingDate, dateISO),
            eq(patients.phoneNumber, cleanPhone),
            ne(bookings.status, 'Cancelled')
          )
        )
        .limit(1);

      if (duplicateCheck.length > 0) {
        throw new Error(`DUPLICATE_BOOKING:${duplicateCheck[0].queueNo}`);
      }

      // Check slot capacity
      const slotRows = await tx
        .select({ bookingId: bookings.bookingId })
        .from(bookings)
        .where(
          and(
            eq(bookings.bookingDate, dateISO),
            eq(bookings.bookingTime, timeSlot),
            ne(bookings.status, 'Cancelled'),
            eq(bookings.isSpecial, false)
          )
        );

      if (slotRows.length >= dayRule.slotCapacity) {
        throw new Error('SLOT_FULL');
      }

      // Calculate sequential A001-A025 queue number for the date
      const allRegularDayRows = await tx
        .select({ queueNo: bookings.queueNo })
        .from(bookings)
        .where(and(eq(bookings.bookingDate, dateISO), eq(bookings.isSpecial, false)));

      let maxNum = 0;
      for (const row of allRegularDayRows) {
        const m = /^A(\d+)$/.exec(row.queueNo);
        if (m) {
          const n = Number(m[1]);
          if (n > maxNum) maxNum = n;
        }
      }
      const nextNum = maxNum + 1;
      const queueNo = `A${String(nextNum).padStart(3, '0')}`;

      // Upsert or insert patient by phone number + name match
      const existingPatient = await tx
        .select()
        .from(patients)
        .where(eq(patients.phoneNumber, cleanPhone))
        .limit(1);

      let patientRecord;
      if (existingPatient.length > 0) {
        const [updated] = await tx
          .update(patients)
          .set({
            fullName: cleanName,
            age: parsedAge,
            disease: cleanDisease,
          })
          .where(eq(patients.patientId, existingPatient[0].patientId))
          .returning();
        patientRecord = updated;
      } else {
        const [inserted] = await tx
          .insert(patients)
          .values({
            fullName: cleanName,
            age: parsedAge,
            disease: cleanDisease,
            phoneNumber: cleanPhone,
          })
          .returning();
        patientRecord = inserted;
      }

      const slotIndex = TIME_SLOTS.indexOf(timeSlot as (typeof TIME_SLOTS)[number]) + 1;
      const priorityOrder = slotIndex * 100 + slotRows.length + 1;

      const [newBooking] = await tx
        .insert(bookings)
        .values({
          patientId: patientRecord.patientId,
          bookingDate: dateISO,
          bookingTime: timeSlot,
          queueNo,
          status: 'Booked',
          isSpecial: false,
          priorityOrder,
        })
        .returning();

      return {
        ...newBooking,
        patient: patientRecord,
      };
    });

    await logAudit('patient', cleanPhone, `จองคิว ${createdBooking.queueNo} วันที่ ${dateISO}`, req);
    broadcastQueueUpdate('queue_updated', { date: dateISO, queueNo: createdBooking.queueNo });

    res.status(201).json({
      bookingId: createdBooking.bookingId,
      queueNo: createdBooking.queueNo,
      bookingDate: createdBooking.bookingDate,
      bookingTime: createdBooking.bookingTime,
      status: createdBooking.status,
      fullName: createdBooking.patient.fullName,
      age: createdBooking.patient.age,
      disease: createdBooking.patient.disease,
      phoneNumber: createdBooking.patient.phoneNumber,
      maskedPhone: maskPhoneNumber(createdBooking.patient.phoneNumber),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('DUPLICATE_BOOKING:')) {
      const existingQ = message.split(':')[1];
      return res.status(409).json({
        error: `หมายเลขโทรศัพท์นี้ได้จองคิวในวันที่เลือกไว้แล้ว (เลขคิว ${existingQ}) ห้ามจองซ้ำในวันเดียวกัน`,
      });
    }
    if (message === 'SLOT_FULL') {
      return res.status(409).json({
        error: 'ช่วงเวลานี้คิวเต็มแล้ว กรุณาเลือกช่วงเวลาอื่น',
      });
    }
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกการจอง กรุณาลองใหม่อีกครั้ง' });
  }
});

app.get('/api/public/queue-status', async (req: Request, res: Response) => {
  try {
    const dateISO = String(req.query.date || getBangkokTodayISO());
    const queryStr = String(req.query.query || '').trim();

    const rows = await db
      .select({
        bookingId: bookings.bookingId,
        queueNo: bookings.queueNo,
        bookingDate: bookings.bookingDate,
        bookingTime: bookings.bookingTime,
        status: bookings.status,
        isSpecial: bookings.isSpecial,
        priorityOrder: bookings.priorityOrder,
        fullName: patients.fullName,
        phoneNumber: patients.phoneNumber,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.patientId))
      .where(eq(bookings.bookingDate, dateISO))
      .orderBy(asc(bookings.priorityOrder), asc(bookings.createdAt));

    const inService = rows.filter((r) => r.status === 'InService');
    const waitingStatuses = new Set(['Booked', 'Confirmed', 'Arrived']);
    const waitingList = rows.filter((r) => waitingStatuses.has(r.status));
    const completedCount = rows.filter((r) => r.status === 'Completed').length;

    let trackedQueue: {
      bookingId: string;
      queueNo: string;
      fullName: string;
      bookingDate: string;
      bookingTime: string;
      status: string;
      queuesAhead: number;
      isSpecial: boolean;
    } | null = null;

    if (queryStr) {
      const normalizedDigits = queryStr.replace(/\D/g, '');
      const upperQ = queryStr.toUpperCase();
      const matched = rows.find(
        (r) =>
          r.status !== 'Cancelled' &&
          (r.queueNo.toUpperCase() === upperQ ||
            (normalizedDigits.length >= 9 && r.phoneNumber === normalizedDigits))
      );

      if (matched) {
        let queuesAhead = 0;
        if (waitingStatuses.has(matched.status)) {
          const idx = waitingList.findIndex((w) => w.bookingId === matched.bookingId);
          queuesAhead = idx >= 0 ? idx + (inService.length > 0 ? 1 : 0) : 0;
        }
        trackedQueue = {
          bookingId: matched.bookingId,
          queueNo: matched.queueNo,
          fullName: matched.fullName,
          bookingDate: matched.bookingDate,
          bookingTime: matched.bookingTime,
          status: matched.status,
          queuesAhead,
          isSpecial: matched.isSpecial,
        };
      }
    }

    res.json({
      date: dateISO,
      currentServing: inService.map((r) => ({
        queueNo: r.queueNo,
        bookingTime: r.bookingTime,
        isSpecial: r.isSpecial,
      })),
      waitingCount: waitingList.length,
      completedCount,
      totalActive: rows.filter((r) => r.status !== 'Cancelled').length,
      waitingList: waitingList.slice(0, 12).map((w, idx) => ({
        position: idx + 1,
        queueNo: w.queueNo,
        bookingTime: w.bookingTime,
        status: w.status,
        isSpecial: w.isSpecial,
      })),
      trackedQueue,
    });
  } catch (err) {
    console.error('Error fetching queue status:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดสถานะคิวได้' });
  }
});

app.get('/api/public/history', async (req: Request, res: Response) => {
  try {
    const queryStr = String(req.query.query || '').trim();
    if (!queryStr) {
      return res.json({ visits: [], bookings: [] });
    }

    const digits = queryStr.replace(/\D/g, '');
    const matchedPatients = await db
      .select()
      .from(patients)
      .where(
        digits.length >= 9
          ? eq(patients.phoneNumber, digits)
          : or(
              ilike(patients.fullName, `%${queryStr}%`),
              ilike(patients.phoneNumber, `%${digits || queryStr}%`)
            )
      )
      .limit(20);

    const patientIds = matchedPatients.map((p) => p.patientId);

    // Also allow searching directly by Queue No
    const byQueueRows = await db
      .select({
        bookingId: bookings.bookingId,
        queueNo: bookings.queueNo,
        bookingDate: bookings.bookingDate,
        bookingTime: bookings.bookingTime,
        status: bookings.status,
        isSpecial: bookings.isSpecial,
        patientId: patients.patientId,
        fullName: patients.fullName,
        age: patients.age,
        disease: patients.disease,
        phoneNumber: patients.phoneNumber,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.patientId))
      .where(
        patientIds.length > 0
          ? or(
              ilike(bookings.queueNo, queryStr),
              sql`${bookings.patientId} = ANY(ARRAY[${sql.join(
                patientIds.map((id) => sql`${id}::uuid`),
                sql`, `
              )}])`
            )
          : ilike(bookings.queueNo, queryStr)
      )
      .orderBy(desc(bookings.bookingDate), asc(bookings.priorityOrder))
      .limit(30);

    const visitRows =
      patientIds.length > 0
        ? await db
            .select({
              visitId: visits.visitId,
              visitDate: visits.visitDate,
              queueNo: visits.queueNo,
              diagnosis: visits.diagnosis,
              note: visits.note,
              providerName: visits.providerName,
              fullName: patients.fullName,
              phoneNumber: patients.phoneNumber,
            })
            .from(visits)
            .innerJoin(patients, eq(visits.patientId, patients.patientId))
            .where(
              sql`${visits.patientId} = ANY(ARRAY[${sql.join(
                patientIds.map((id) => sql`${id}::uuid`),
                sql`, `
              )}])`
            )
            .orderBy(desc(visits.visitDate))
            .limit(30)
        : await db
            .select({
              visitId: visits.visitId,
              visitDate: visits.visitDate,
              queueNo: visits.queueNo,
              diagnosis: visits.diagnosis,
              note: visits.note,
              providerName: visits.providerName,
              fullName: patients.fullName,
              phoneNumber: patients.phoneNumber,
            })
            .from(visits)
            .innerJoin(patients, eq(visits.patientId, patients.patientId))
            .where(ilike(visits.queueNo, queryStr))
            .orderBy(desc(visits.visitDate))
            .limit(30);

    res.json({
      visits: visitRows.map((v) => ({
        ...v,
        maskedPhone: maskPhoneNumber(v.phoneNumber),
        phoneNumber: undefined,
      })),
      bookings: byQueueRows.map((b) => ({
        ...b,
        maskedPhone: maskPhoneNumber(b.phoneNumber),
      })),
    });
  } catch (err) {
    console.error('Error searching patient history:', err);
    res.status(500).json({ error: 'ไม่สามารถค้นหาประวัติการรับบริการได้' });
  }
});

app.post('/api/public/bookings/:id/cancel', async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.params.id);
    const phoneDigits = String(req.body?.phoneNumber || '').replace(/\D/g, '');

    const rows = await db
      .select({
        bookingId: bookings.bookingId,
        bookingDate: bookings.bookingDate,
        queueNo: bookings.queueNo,
        status: bookings.status,
        phoneNumber: patients.phoneNumber,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.patientId))
      .where(eq(bookings.bookingId, bookingId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการจองคิว' });
    }
    const target = rows[0];
    if (target.phoneNumber !== phoneDigits) {
      return res.status(403).json({ error: 'เบอร์โทรศัพท์ไม่ตรงกับผู้จองคิว' });
    }
    if (target.status === 'Completed' || target.status === 'InService') {
      return res.status(400).json({ error: 'ไม่สามารถยกเลิกคิวที่กำลังให้บริการหรือเสร็จสิ้นแล้วได้' });
    }

    await db
      .update(bookings)
      .set({ status: 'Cancelled', updatedAt: new Date() })
      .where(eq(bookings.bookingId, bookingId));

    await logAudit('patient', phoneDigits, `ผู้รับบริการยกเลิกคิว ${target.queueNo}`, req);
    broadcastQueueUpdate('queue_updated', { date: target.bookingDate, queueNo: target.queueNo });

    res.json({ success: true });
  } catch (err) {
    console.error('Error cancelling booking:', err);
    res.status(500).json({ error: 'ไม่สามารถยกเลิกการจองได้' });
  }
});

// ==================== AUTH ROUTES ====================

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);

    if (rows.length === 0 || !rows[0].isActive) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = rows[0];
    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    await db
      .update(adminUsers)
      .set({ lastLogin: new Date() })
      .where(eq(adminUsers.adminId, user.adminId));

    const sessionUser = {
      id: user.adminId,
      username: user.username,
      fullName: user.fullName || user.username,
      role: (user.role === 'Admin' ? 'Admin' : 'Staff') as 'Admin' | 'Staff',
      email: user.email,
      authMethod: 'password' as const,
    };

    const token = createSessionToken(sessionUser);
    setSessionCookie(res, token);
    await logAudit(user.adminId, user.username, `เข้าสู่ระบบด้วย Username (${user.role})`, req);

    res.json({ user: sessionUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

app.post('/api/auth/firebase', async (req: Request, res: Response) => {
  try {
    const idToken = String(req.body?.idToken || '');
    if (!idToken) {
      return res.status(400).json({ error: 'ไม่พบ Firebase ID Token' });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = (decoded.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'บัญชี Google ไม่มีอีเมล' });
    }

    // Check adminUsers table for authorization
    const matchedAdmins = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);

    if (matchedAdmins.length === 0 || !matchedAdmins[0].isActive) {
      return res.status(403).json({
        error: `อีเมล ${email} ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบเจ้าหน้าที่ กรุณาติดต่อผู้ดูแลระบบ`,
      });
    }

    const adminRow = matchedAdmins[0];

    // Upsert Firebase user link in 'users' table per cloudsql-setup 4.5
    await db
      .insert(users)
      .values({
        uid: decoded.uid,
        email,
        displayName: decoded.name || adminRow.fullName || email,
        role: adminRow.role,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: decoded.name || adminRow.fullName || email,
          role: adminRow.role,
        },
      });

    await db
      .update(adminUsers)
      .set({ lastLogin: new Date() })
      .where(eq(adminUsers.adminId, adminRow.adminId));

    const sessionUser = {
      id: adminRow.adminId,
      username: adminRow.username,
      fullName: adminRow.fullName || decoded.name || email,
      role: (adminRow.role === 'Admin' ? 'Admin' : 'Staff') as 'Admin' | 'Staff',
      email,
      authMethod: 'firebase' as const,
    };

    const token = createSessionToken(sessionUser);
    setSessionCookie(res, token);
    await logAudit(adminRow.adminId, adminRow.username, `เข้าสู่ระบบด้วย Google (${email})`, req);

    res.json({ user: sessionUser });
  } catch (err) {
    console.error('Firebase auth error:', err);
    res.status(401).json({ error: 'การยืนยันตัวตนผ่าน Google ไม่สำเร็จ' });
  }
});

app.post('/api/auth/logout', async (req: Request, res: Response) => {
  const user = await resolveAuthUser(req);
  if (user) {
    await logAudit(user.id, user.username, 'ออกจากระบบ', req);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  const user = await resolveAuthUser(req);
  res.json({ user });
});

// ==================== STAFF ROUTES ====================

app.get('/api/staff/bookings', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const dateISO = String(req.query.date || getBangkokTodayISO());
    const rows = await db
      .select({
        bookingId: bookings.bookingId,
        patientId: bookings.patientId,
        bookingDate: bookings.bookingDate,
        bookingTime: bookings.bookingTime,
        queueNo: bookings.queueNo,
        status: bookings.status,
        isSpecial: bookings.isSpecial,
        priorityOrder: bookings.priorityOrder,
        notes: bookings.notes,
        createdAt: bookings.createdAt,
        fullName: patients.fullName,
        age: patients.age,
        disease: patients.disease,
        phoneNumber: patients.phoneNumber,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.patientId))
      .where(eq(bookings.bookingDate, dateISO))
      .orderBy(asc(bookings.priorityOrder), asc(bookings.createdAt));

    const summary = {
      total: rows.length,
      completed: rows.filter((r) => r.status === 'Completed').length,
      waiting: rows.filter((r) => ['Booked', 'Confirmed', 'Arrived'].includes(r.status)).length,
      inService: rows.filter((r) => r.status === 'InService').length,
      cancelled: rows.filter((r) => r.status === 'Cancelled' || r.status === 'NoShow').length,
      special: rows.filter((r) => r.isSpecial).length,
    };

    res.json({ date: dateISO, summary, bookings: rows });
  } catch (err) {
    console.error('Error loading staff bookings:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดรายการคิวได้' });
  }
});

app.patch('/api/staff/bookings/:id/status', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = String(req.params.id);
    const { status, diagnosis, note, providerName } = req.body || {};
    const validStatuses = [
      'Booked',
      'Confirmed',
      'Arrived',
      'InService',
      'Completed',
      'Cancelled',
      'NoShow',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'สถานะคิวไม่ถูกต้อง' });
    }

    const existing = await db
      .select()
      .from(bookings)
      .where(eq(bookings.bookingId, bookingId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคิว' });
    }
    const current = existing[0];

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status, updatedAt: new Date() })
        .where(eq(bookings.bookingId, bookingId));

      if (status === 'Completed') {
        const existingVisit = await tx
          .select({ visitId: visits.visitId })
          .from(visits)
          .where(eq(visits.bookingId, bookingId))
          .limit(1);

        if (existingVisit.length === 0) {
          const [patient] = await tx
            .select()
            .from(patients)
            .where(eq(patients.patientId, current.patientId))
            .limit(1);

          await tx.insert(visits).values({
            patientId: current.patientId,
            bookingId: current.bookingId,
            queueNo: current.queueNo,
            diagnosis: String(diagnosis || patient?.disease || 'ฝังเข็มฟื้นฟูอาการ'),
            note: String(note || 'เข้ารับบริการฝังเข็มเรียบร้อย'),
            providerName: String(providerName || req.staffUser?.fullName || 'แพทย์/ผู้ฝังเข็ม'),
          });
        }
      }
    });

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `เปลี่ยนสถานะคิว ${current.queueNo} (${current.bookingDate}) เป็น ${status}`,
      req
    );
    broadcastQueueUpdate('queue_updated', { date: current.bookingDate, queueNo: current.queueNo });

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating queue status:', err);
    res.status(500).json({ error: 'ไม่สามารถอัปเดตสถานะคิวได้' });
  }
});

app.patch('/api/staff/bookings/:id', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = String(req.params.id);
    const { fullName, age, disease, phoneNumber, bookingTime, bookingDate, notes } = req.body || {};

    const existing = await db
      .select()
      .from(bookings)
      .where(eq(bookings.bookingId, bookingId))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคิว' });
    }
    const target = existing[0];

    await db.transaction(async (tx) => {
      if (fullName || age !== undefined || disease !== undefined || phoneNumber) {
        const cleanPhone = phoneNumber ? String(phoneNumber).replace(/\D/g, '') : undefined;
        await tx
          .update(patients)
          .set({
            ...(fullName ? { fullName: String(fullName).trim() } : {}),
            ...(age !== undefined && Number(age) > 0 ? { age: Number(age) } : {}),
            ...(disease !== undefined ? { disease: String(disease).trim() } : {}),
            ...(cleanPhone && isValidThaiPhone(cleanPhone) ? { phoneNumber: cleanPhone } : {}),
          })
          .where(eq(patients.patientId, target.patientId));
      }

      await tx
        .update(bookings)
        .set({
          ...(bookingTime ? { bookingTime: String(bookingTime) } : {}),
          ...(bookingDate ? { bookingDate: String(bookingDate) } : {}),
          ...(notes !== undefined ? { notes: String(notes) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(bookings.bookingId, bookingId));
    });

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `แก้ไขข้อมูลผู้รับบริการ/นัดหมายคิว ${target.queueNo}`,
      req
    );
    broadcastQueueUpdate('queue_updated', { date: bookingDate || target.bookingDate });

    res.json({ success: true });
  } catch (err) {
    console.error('Error editing booking:', err);
    res.status(500).json({ error: 'ไม่สามารถแก้ไขข้อมูลคิวได้' });
  }
});

app.post('/api/staff/bookings/:id/reorder', requireStaff, async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = String(req.params.id);
    const direction = String(req.body?.direction || 'up'); // 'up' | 'down' | 'front'

    const [target] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.bookingId, bookingId))
      .limit(1);

    if (!target) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคิว' });
    }

    const dayRows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.bookingDate, target.bookingDate))
      .orderBy(asc(bookings.priorityOrder), asc(bookings.createdAt));

    if (direction === 'front') {
      const minOrder = dayRows.reduce((m, r) => Math.min(m, r.priorityOrder), target.priorityOrder);
      await db
        .update(bookings)
        .set({ priorityOrder: minOrder - 1, updatedAt: new Date() })
        .where(eq(bookings.bookingId, bookingId));
    } else {
      const idx = dayRows.findIndex((r) => r.bookingId === bookingId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (idx >= 0 && swapIdx >= 0 && swapIdx < dayRows.length) {
        const other = dayRows[swapIdx];
        await db.transaction(async (tx) => {
          await tx
            .update(bookings)
            .set({ priorityOrder: other.priorityOrder, updatedAt: new Date() })
            .where(eq(bookings.bookingId, target.bookingId));
          await tx
            .update(bookings)
            .set({ priorityOrder: target.priorityOrder, updatedAt: new Date() })
            .where(eq(bookings.bookingId, other.bookingId));
        });
      }
    }

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `ย้ายลำดับคิว ${target.queueNo} (${direction})`,
      req
    );
    broadcastQueueUpdate('queue_updated', { date: target.bookingDate });

    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering queue:', err);
    res.status(500).json({ error: 'ไม่สามารถย้ายลำดับคิวได้' });
  }
});

// ==================== ADMIN ROUTES ====================

app.post('/api/admin/special-queue', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      bookingDate,
      bookingTime,
      fullName,
      age,
      disease,
      phoneNumber,
      notes,
      insertFront,
    } = req.body || {};

    const cleanName = String(fullName || '').trim();
    const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
    const parsedAge = Number(age);
    const dateISO = String(bookingDate || getBangkokTodayISO());
    const timeSlot = String(bookingTime || TIME_SLOTS[0]);

    if (!cleanName || !Number.isInteger(parsedAge) || parsedAge < 1 || !isValidThaiPhone(cleanPhone)) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลผู้รับบริการให้ครบถ้วนและถูกต้อง' });
    }

    const created = await db.transaction(async (tx) => {
      const specialRows = await tx
        .select({ queueNo: bookings.queueNo })
        .from(bookings)
        .where(and(eq(bookings.bookingDate, dateISO), eq(bookings.isSpecial, true)));

      let maxS = 0;
      for (const r of specialRows) {
        const m = /^S(\d+)$/.exec(r.queueNo);
        if (m && Number(m[1]) > maxS) maxS = Number(m[1]);
      }
      const queueNo = `S${String(maxS + 1).padStart(3, '0')}`;

      const [patient] = await tx
        .insert(patients)
        .values({
          fullName: cleanName,
          age: parsedAge,
          disease: String(disease || 'กรณีเร่งด่วน/คิวพิเศษ'),
          phoneNumber: cleanPhone,
        })
        .returning();

      let priorityOrder = 100;
      if (insertFront) {
        const waitingRows = await tx
          .select({ priorityOrder: bookings.priorityOrder })
          .from(bookings)
          .where(
            and(
              eq(bookings.bookingDate, dateISO),
              or(
                eq(bookings.status, 'Booked'),
                eq(bookings.status, 'Confirmed'),
                eq(bookings.status, 'Arrived')
              )
            )
          );
        const minWait = waitingRows.reduce((m, r) => Math.min(m, r.priorityOrder), 100);
        priorityOrder = minWait - 1;
      }

      const [inserted] = await tx
        .insert(bookings)
        .values({
          patientId: patient.patientId,
          bookingDate: dateISO,
          bookingTime: timeSlot,
          queueNo,
          status: 'Confirmed',
          isSpecial: true,
          priorityOrder,
          notes: String(notes || 'คิวพิเศษโดยผู้ดูแลระบบ'),
        })
        .returning();

      return inserted;
    });

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `เพิ่มคิวพิเศษ ${created.queueNo} วันที่ ${dateISO}`,
      req
    );
    broadcastQueueUpdate('queue_updated', { date: dateISO, queueNo: created.queueNo });

    res.status(201).json(created);
  } catch (err) {
    console.error('Error adding special queue:', err);
    res.status(500).json({ error: 'ไม่สามารถเพิ่มคิวพิเศษได้' });
  }
});

app.put('/api/admin/schedule', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { scheduleDate, isOpen, isPaused, slotCapacity, reason } = req.body || {};
    if (!scheduleDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(scheduleDate))) {
      return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
    }

    const cap = Math.max(1, Math.min(20, Number(slotCapacity || DEFAULT_SLOT_CAPACITY)));

    await db
      .insert(scheduleSettings)
      .values({
        scheduleDate: String(scheduleDate),
        isOpen: Boolean(isOpen),
        isPaused: Boolean(isPaused),
        slotCapacity: cap,
        reason: String(reason || '').slice(0, 200),
        updatedBy: req.staffUser!.username,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: scheduleSettings.scheduleDate,
        set: {
          isOpen: Boolean(isOpen),
          isPaused: Boolean(isPaused),
          slotCapacity: cap,
          reason: String(reason || '').slice(0, 200),
          updatedBy: req.staffUser!.username,
          updatedAt: new Date(),
        },
      });

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `ตั้งค่าวันให้บริการ ${scheduleDate}: ${isOpen ? 'เปิด' : 'ปิด'}${isPaused ? ' (ระงับชั่วคราว)' : ''}`,
      req
    );
    broadcastQueueUpdate('schedule_updated', { date: scheduleDate });

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าวันเปิดจองได้' });
  }
});

app.delete('/api/admin/schedule', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const scheduleDate = String(req.query.date || req.body?.scheduleDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
      return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
    }

    await db.delete(scheduleSettings).where(eq(scheduleSettings.scheduleDate, scheduleDate));
    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `ยกเลิกการกำหนดวันเปิดจอง ${scheduleDate} (กลับเป็นปิดจอง)`,
      req
    );
    broadcastQueueUpdate('schedule_updated', { date: scheduleDate });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ error: 'ไม่สามารถยกเลิกการกำหนดวันเปิดจองได้' });
  }
});

app.post('/api/admin/schedule/batch', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { dates, isOpen, isPaused, slotCapacity, reason } = req.body || {};
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: 'กรุณาเลือกวันที่อย่างน้อย 1 วัน' });
    }
    const cap = Math.max(1, Math.min(20, Number(slotCapacity || DEFAULT_SLOT_CAPACITY)));
    const validDates = dates
      .map((d) => String(d))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

    for (const dateISO of validDates) {
      await db
        .insert(scheduleSettings)
        .values({
          scheduleDate: dateISO,
          isOpen: Boolean(isOpen),
          isPaused: Boolean(isPaused),
          slotCapacity: cap,
          reason: String(reason || '').slice(0, 200),
          updatedBy: req.staffUser!.username,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: scheduleSettings.scheduleDate,
          set: {
            isOpen: Boolean(isOpen),
            isPaused: Boolean(isPaused),
            slotCapacity: cap,
            reason: String(reason || '').slice(0, 200),
            updatedBy: req.staffUser!.username,
            updatedAt: new Date(),
          },
        });
    }

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `ตั้งค่าวันให้บริการแบบกลุ่ม ${validDates.length} วัน (${isOpen ? 'เปิด' : 'ปิด'})`,
      req
    );
    broadcastQueueUpdate('schedule_updated', { count: validDates.length });
    res.json({ success: true, count: validDates.length });
  } catch (err) {
    console.error('Error batch updating schedule:', err);
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าวันเปิดจองแบบกลุ่มได้' });
  }
});

app.put('/api/admin/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const {
      globalBookingPaused,
      announcement,
      foundationPhone,
      customLogoUrl,
      openWeekdays,
      facebookUrl,
    } = req.body || {};
    const updates: Array<{ key: string; value: string }> = [];

    if (globalBookingPaused !== undefined) {
      updates.push({ key: 'global_booking_paused', value: String(Boolean(globalBookingPaused)) });
    }
    if (announcement !== undefined) {
      updates.push({ key: 'announcement', value: String(announcement).slice(0, 500) });
    }
    if (foundationPhone !== undefined) {
      updates.push({ key: 'foundation_phone', value: String(foundationPhone).slice(0, 30) });
    }
    if (customLogoUrl !== undefined) {
      updates.push({ key: 'custom_logo_url', value: String(customLogoUrl) });
    }
    if (Array.isArray(openWeekdays)) {
      const clean = openWeekdays
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      updates.push({ key: 'open_weekdays', value: JSON.stringify(clean) });
    }
    if (facebookUrl !== undefined) {
      updates.push({ key: 'facebook_url', value: String(facebookUrl).slice(0, 300) });
    }

    for (const item of updates) {
      await db
        .insert(systemSettings)
        .values({ key: item.key, value: item.value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: item.value, updatedAt: new Date() },
        });
    }

    await logAudit(req.staffUser!.id, req.staffUser!.username, 'อัปเดตการตั้งค่าระบบ', req);
    broadcastQueueUpdate('settings_updated', {});
    broadcastQueueUpdate('schedule_updated', {});

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating system settings:', err);
    res.status(500).json({ error: 'ไม่สามารถบันทึกการตั้งค่าระบบได้' });
  }
});

app.get('/api/admin/analytics', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const range = String(req.query.range || 'monthly'); // 'daily' | 'monthly' | 'yearly'
    const refDate = String(req.query.date || getBangkokTodayISO());

    const allBookings = await db
      .select({
        bookingId: bookings.bookingId,
        patientId: bookings.patientId,
        bookingDate: bookings.bookingDate,
        bookingTime: bookings.bookingTime,
        queueNo: bookings.queueNo,
        status: bookings.status,
        isSpecial: bookings.isSpecial,
        createdAt: bookings.createdAt,
        fullName: patients.fullName,
        age: patients.age,
        disease: patients.disease,
        phoneNumber: patients.phoneNumber,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.patientId))
      .orderBy(desc(bookings.bookingDate), asc(bookings.priorityOrder));

    // Filter by range for report rows
    const filtered = allBookings.filter((b) => {
      if (range === 'daily') return b.bookingDate === refDate;
      if (range === 'monthly') return b.bookingDate.slice(0, 7) === refDate.slice(0, 7);
      if (range === 'yearly') return b.bookingDate.slice(0, 4) === refDate.slice(0, 4);
      return true;
    });

    const totalCount = filtered.length;
    const completedCount = filtered.filter((b) => b.status === 'Completed').length;
    const cancelledCount = filtered.filter((b) => b.status === 'Cancelled').length;
    const noShowCount = filtered.filter((b) => b.status === 'NoShow').length;
    const specialCount = filtered.filter((b) => b.isSpecial).length;

    const avgAge =
      filtered.length > 0
        ? Math.round((filtered.reduce((acc, b) => acc + b.age, 0) / filtered.length) * 10) / 10
        : 0;

    // Disease frequency
    const diseaseCounts = new Map<string, number>();
    for (const b of filtered) {
      const d = b.disease || 'ไม่ได้ระบุ';
      diseaseCounts.set(d, (diseaseCounts.get(d) || 0) + 1);
    }
    const topDiseases = Array.from(diseaseCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Popular hour / slot
    const slotCounts = new Map<string, number>();
    for (const slot of TIME_SLOTS) slotCounts.set(slot, 0);
    for (const b of filtered) {
      slotCounts.set(b.bookingTime, (slotCounts.get(b.bookingTime) || 0) + 1);
    }
    const byTimeSlot = Array.from(slotCounts.entries()).map(([slot, value]) => ({ slot, value }));
    const popularHour =
      byTimeSlot.slice().sort((a, b) => b.value - a.value)[0]?.slot || TIME_SLOTS[0];

    // Popular day of week
    const thaiDayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const dayCounts = new Map<string, number>();
    for (const b of filtered) {
      const [y, m, d] = b.bookingDate.split('-').map(Number);
      const dayName = thaiDayNames[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
    }
    const popularDay =
      Array.from(dayCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'จันทร์';

    // New vs Returning patients across entire dataset
    const patientVisitCount = new Map<string, number>();
    for (const b of allBookings) {
      if (b.status !== 'Cancelled') {
        patientVisitCount.set(b.patientId, (patientVisitCount.get(b.patientId) || 0) + 1);
      }
    }
    const uniqueFilteredPatients = new Set(filtered.map((b) => b.patientId));
    let newPatients = 0;
    let returningPatients = 0;
    for (const pid of uniqueFilteredPatients) {
      if ((patientVisitCount.get(pid) || 0) > 1) returningPatients++;
      else newPatients++;
    }

    // Daily, Monthly, Yearly trend series (Section 13)
    const dailyMap = new Map<string, number>();
    const monthlyMap = new Map<string, number>();
    const yearlyMap = new Map<string, number>();

    for (const b of allBookings) {
      if (b.status === 'Cancelled') continue;
      dailyMap.set(b.bookingDate, (dailyMap.get(b.bookingDate) || 0) + 1);
      const ym = b.bookingDate.slice(0, 7);
      monthlyMap.set(ym, (monthlyMap.get(ym) || 0) + 1);
      const yr = b.bookingDate.slice(0, 4);
      yearlyMap.set(yr, (yearlyMap.get(yr) || 0) + 1);
    }

    const dailySeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([label, value]) => ({ label, value }));

    const monthlySeries = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([label, value]) => ({ label, value }));

    const yearlySeries = Array.from(yearlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: String(Number(label) + 543), value }));

    res.json({
      range,
      refDate,
      metrics: {
        totalCount,
        completedCount,
        cancelledCount,
        noShowCount,
        specialCount,
        avgAge,
        popularDay,
        popularHour,
        noShowRate: totalCount > 0 ? Math.round((noShowCount / totalCount) * 1000) / 10 : 0,
        cancelRate: totalCount > 0 ? Math.round((cancelledCount / totalCount) * 1000) / 10 : 0,
        newPatients,
        returningPatients,
      },
      topDiseases,
      byTimeSlot,
      dailySeries,
      monthlySeries,
      yearlySeries,
      rows: filtered,
    });
  } catch (err) {
    console.error('Error building analytics:', err);
    res.status(500).json({ error: 'ไม่สามารถคำนวณรายงานสถิติได้' });
  }
});

app.get('/api/admin/users', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        adminId: adminUsers.adminId,
        username: adminUsers.username,
        fullName: adminUsers.fullName,
        role: adminUsers.role,
        email: adminUsers.email,
        isActive: adminUsers.isActive,
        lastLogin: adminUsers.lastLogin,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .orderBy(asc(adminUsers.createdAt));

    res.json({ users: rows });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดรายชื่อผู้ใช้งานได้' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, fullName, role, email } = req.body || {};
    const cleanUser = String(username || '').trim();
    const cleanPass = String(password || '');
    const cleanRole = role === 'Admin' ? 'Admin' : 'Staff';

    if (!cleanUser || cleanUser.length < 3 || !cleanPass || cleanPass.length < 6) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร และรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    }

    const [created] = await db
      .insert(adminUsers)
      .values({
        username: cleanUser,
        passwordHash: hashPassword(cleanPass),
        fullName: String(fullName || cleanUser).trim(),
        role: cleanRole,
        email: String(email || '').trim().toLowerCase(),
        isActive: true,
      })
      .returning({
        adminId: adminUsers.adminId,
        username: adminUsers.username,
        fullName: adminUsers.fullName,
        role: adminUsers.role,
        email: adminUsers.email,
        isActive: adminUsers.isActive,
      });

    await logAudit(
      req.staffUser!.id,
      req.staffUser!.username,
      `เพิ่มผู้ใช้งาน ${cleanUser} (${cleanRole})`,
      req
    );

    res.status(201).json(created);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique')) {
      return res.status(409).json({ error: 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว' });
    }
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'ไม่สามารถเพิ่มผู้ใช้งานได้' });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const adminId = String(req.params.id);
    const { role, isActive, fullName, email } = req.body || {};

    await db
      .update(adminUsers)
      .set({
        ...(role ? { role: role === 'Admin' ? 'Admin' : 'Staff' } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(fullName !== undefined ? { fullName: String(fullName).trim() } : {}),
        ...(email !== undefined ? { email: String(email).trim().toLowerCase() } : {}),
      })
      .where(eq(adminUsers.adminId, adminId));

    await logAudit(req.staffUser!.id, req.staffUser!.username, `แก้ไขสิทธิ์/สถานะผู้ใช้งาน ${adminId}`, req);

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'ไม่สามารถแก้ไขข้อมูลผู้ใช้งานได้' });
  }
});

app.get('/api/admin/audit-logs', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.logDate))
      .limit(50);

    res.json({ logs });
  } catch (err) {
    console.error('Error loading audit logs:', err);
    res.status(500).json({ error: 'ไม่สามารถโหลดบันทึกการตรวจสอบได้' });
  }
});

// ==================== SERVER STARTUP (VITE / STATIC) ====================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
