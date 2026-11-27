import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminUsers,
  auditLogs,
  bookings,
  patients,
  scheduleSettings,
  systemSettings,
  visits,
} from './schema.ts';
import { hashPassword } from '../middleware/auth.ts';
import {
  addDaysISO,
  FOUNDATION_INFO,
  getBangkokTodayISO,
  TIME_SLOTS,
} from '../lib/constants.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = runSeed().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

async function runSeed(): Promise<void> {
  // 1. Seed AdminUsers if empty
  const [{ totalAdmins }] = await db
    .select({ totalAdmins: count() })
    .from(adminUsers);

  if (Number(totalAdmins) === 0) {
    await db
      .insert(adminUsers)
      .values([
        {
          username: 'admin',
          passwordHash: hashPassword('admin1234'),
          fullName: 'ผู้ดูแลระบบ มูลนิธิร่วมกุศลสมุทรปราการ',
          role: 'Admin',
          email: 'emsrkl1669@gmail.com',
          isActive: true,
        },
        {
          username: 'staff',
          passwordHash: hashPassword('staff1234'),
          fullName: 'เจ้าหน้าที่เวชระเบียน จุดบริการฝังเข็ม',
          role: 'Staff',
          email: 'staff@ruamkusol.org',
          isActive: true,
        },
      ])
      .onConflictDoNothing();
  }

  // 2. Seed SystemSettings & ensure new Sunday/Facebook keys exist
  await db
    .insert(systemSettings)
    .values([
      { key: 'global_booking_paused', value: 'false' },
      { key: 'announcement', value: FOUNDATION_INFO.defaultAnnouncement },
      { key: 'foundation_phone', value: '02-175-8668' },
      { key: 'custom_logo_url', value: '' },
      { key: 'open_weekdays', value: '[]' },
      { key: 'facebook_url', value: FOUNDATION_INFO.facebookUrl },
    ])
    .onConflictDoNothing();

  // Upgrade legacy default announcement text & ensure open_weekdays stays empty (100% Admin-only schedule)
  const [annRow] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'announcement'))
    .limit(1);
  if (annRow && annRow.value.includes('วันจันทร์–เสาร์')) {
    await db
      .update(systemSettings)
      .set({ value: FOUNDATION_INFO.defaultAnnouncement, updatedAt: new Date() })
      .where(eq(systemSettings.key, 'announcement'));
  }

  await db
    .update(systemSettings)
    .set({ value: '[]', updatedAt: new Date() })
    .where(eq(systemSettings.key, 'open_weekdays'));

  // Remove any auto-seeded 'system' schedule dates so 100% of open dates come strictly from Admin
  await db
    .delete(scheduleSettings)
    .where(eq(scheduleSettings.updatedBy, 'system'));

  // 3. Seed sample schedule & clinic bookings/visits if patients empty
  const [{ totalPatients }] = await db
    .select({ totalPatients: count() })
    .from(patients);

  if (Number(totalPatients) === 0) {
    const today = getBangkokTodayISO();
    const yesterday = addDaysISO(today, -1);
    const lastWeek = addDaysISO(today, -7);
    const lastMonth = addDaysISO(today, -32);
    const twoMonthsAgo = addDaysISO(today, -65);

    const samplePatients = await db
      .insert(patients)
      .values([
        { fullName: 'นายสมชาย ใจดี', age: 64, disease: 'ปวดหลังเรื้อรัง', phoneNumber: '0812345678' },
        { fullName: 'นางสาววิมล ศรีสุข', age: 58, disease: 'ออฟฟิศซินโดรม', phoneNumber: '0898765432' },
        { fullName: 'นายประเสริฐ มั่งมี', age: 71, disease: 'ข้อเข่าเสื่อม', phoneNumber: '0861112233' },
        { fullName: 'นางสุภาพร รัตนชัย', age: 67, disease: 'อัมพฤกษ์/ฟื้นฟูระบบประสาท', phoneNumber: '0823334455' },
        { fullName: 'นายวิชัย พูลสวัสดิ์', age: 62, disease: 'ไมเกรน/ปวดศีรษะ', phoneNumber: '0854445566' },
        { fullName: 'นางมาลี แสงทอง', age: 69, disease: 'ปวดหลังเรื้อรัง', phoneNumber: '0875556677' },
        { fullName: 'นายอำนาจ เจริญสุข', age: 73, disease: 'ข้อเข่าเสื่อม', phoneNumber: '0836667788' },
        { fullName: 'นางนงลักษณ์ บุญมา', age: 55, disease: 'นอนไม่หลับ', phoneNumber: '0847778899' },
        { fullName: 'นายเกียรติศักดิ์ ทองดี', age: 60, disease: 'ปวดไหล่ติด', phoneNumber: '0888889900' },
        { fullName: 'นางประนอม วงศ์สุวรรณ', age: 76, disease: 'ปวดหลังเรื้อรัง', phoneNumber: '0819990011' },
      ])
      .returning();

    // Schedule dates are 100% controlled by Admin only — do not pre-open any dates automatically.

    // Today's live queue (A001 - A008 + S001 special queue)
    const todayBookings = await db
      .insert(bookings)
      .values([
        {
          patientId: samplePatients[0].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[0],
          queueNo: 'A001',
          status: 'Completed',
          isSpecial: false,
          priorityOrder: 101,
          notes: 'มาตรงเวลา',
        },
        {
          patientId: samplePatients[1].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[0],
          queueNo: 'A002',
          status: 'Completed',
          isSpecial: false,
          priorityOrder: 102,
        },
        {
          patientId: samplePatients[2].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[0],
          queueNo: 'A003',
          status: 'Completed',
          isSpecial: false,
          priorityOrder: 103,
        },
        {
          patientId: samplePatients[3].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[0],
          queueNo: 'A004',
          status: 'InService',
          isSpecial: false,
          priorityOrder: 104,
          notes: 'กำลังรับการฝังเข็มเตียง 1',
        },
        {
          patientId: samplePatients[9].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[1],
          queueNo: 'S001',
          status: 'Arrived',
          isSpecial: true,
          priorityOrder: 105,
          notes: 'ผู้สูงอายุ 76 ปี อาการปวดเฉียบพลัน (คิวพิเศษ)',
        },
        {
          patientId: samplePatients[4].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[1],
          queueNo: 'A005',
          status: 'Arrived',
          isSpecial: false,
          priorityOrder: 201,
        },
        {
          patientId: samplePatients[5].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[1],
          queueNo: 'A006',
          status: 'Confirmed',
          isSpecial: false,
          priorityOrder: 202,
        },
        {
          patientId: samplePatients[6].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[2],
          queueNo: 'A007',
          status: 'Booked',
          isSpecial: false,
          priorityOrder: 301,
        },
        {
          patientId: samplePatients[7].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[2],
          queueNo: 'A008',
          status: 'Booked',
          isSpecial: false,
          priorityOrder: 302,
        },
        {
          patientId: samplePatients[8].patientId,
          bookingDate: today,
          bookingTime: TIME_SLOTS[3],
          queueNo: 'A009',
          status: 'Cancelled',
          isSpecial: false,
          priorityOrder: 401,
          notes: 'ผู้ป่วยขอเลื่อนนัด',
        },
      ])
      .returning();

    // Historical bookings for analytics & reports
    await db.insert(bookings).values([
      {
        patientId: samplePatients[0].patientId,
        bookingDate: yesterday,
        bookingTime: TIME_SLOTS[0],
        queueNo: 'A001',
        status: 'Completed',
        priorityOrder: 101,
      },
      {
        patientId: samplePatients[2].patientId,
        bookingDate: yesterday,
        bookingTime: TIME_SLOTS[1],
        queueNo: 'A002',
        status: 'Completed',
        priorityOrder: 201,
      },
      {
        patientId: samplePatients[3].patientId,
        bookingDate: yesterday,
        bookingTime: TIME_SLOTS[2],
        queueNo: 'A003',
        status: 'NoShow',
        priorityOrder: 301,
      },
      {
        patientId: samplePatients[0].patientId,
        bookingDate: lastWeek,
        bookingTime: TIME_SLOTS[0],
        queueNo: 'A008',
        status: 'Completed',
        priorityOrder: 108,
      },
      {
        patientId: samplePatients[5].patientId,
        bookingDate: lastMonth,
        bookingTime: TIME_SLOTS[1],
        queueNo: 'A004',
        status: 'Completed',
        priorityOrder: 204,
      },
      {
        patientId: samplePatients[6].patientId,
        bookingDate: twoMonthsAgo,
        bookingTime: TIME_SLOTS[0],
        queueNo: 'A002',
        status: 'Completed',
        priorityOrder: 102,
      },
    ]);

    // Visits records (for Section 10 Visit History search)
    await db.insert(visits).values([
      {
        patientId: samplePatients[0].patientId,
        bookingId: todayBookings[0].bookingId,
        queueNo: 'A001',
        visitDate: new Date(),
        diagnosis: 'ปวดหลังเรื้อรัง',
        note: 'ฝังเข็มคลายกล้ามเนื้อหลังส่วนล่าง ติดตามผลสัปดาห์หน้า',
        providerName: 'พจ.ธนากร วัฒนไชย',
      },
      {
        patientId: samplePatients[0].patientId,
        queueNo: 'A008',
        visitDate: new Date(Date.now() - 7 * 86400000),
        diagnosis: 'ปวดหลัง',
        note: 'ติดตามผล อาการทุเลาลง 50%',
        providerName: 'พจ.ธนากร วัฒนไชย',
      },
      {
        patientId: samplePatients[1].patientId,
        bookingId: todayBookings[1].bookingId,
        queueNo: 'A002',
        visitDate: new Date(),
        diagnosis: 'ออฟฟิศซินโดรม คอ บ่า ไหล่ตึง',
        note: 'กระตุ้นไฟฟ้าเบา แนะนำยืดเหยียดกล้ามเนื้อ',
        providerName: 'พจ.สุนิสา เจริญพร',
      },
      {
        patientId: samplePatients[2].patientId,
        bookingId: todayBookings[2].bookingId,
        queueNo: 'A003',
        visitDate: new Date(),
        diagnosis: 'ข้อเข่าเสื่อม',
        note: 'ฝังเข็มรอบข้อเข่าทั้ง 2 ข้าง นัดติดตาม 7 วัน',
        providerName: 'พจ.ธนากร วัฒนไชย',
      },
      {
        patientId: samplePatients[5].patientId,
        queueNo: 'A004',
        visitDate: new Date(Date.now() - 32 * 86400000),
        diagnosis: 'ปวดหลังและสะโพกร้าวลงขา',
        note: 'อาการปวดร้าวลดลง เดินได้คล่องขึ้น',
        providerName: 'พจ.สุนิสา เจริญพร',
      },
    ]);

    await db.insert(auditLogs).values([
      {
        userId: 'system',
        username: 'system',
        action: 'เริ่มต้นฐานข้อมูลระบบนัดหมายฝังเข็ม มูลนิธิร่วมกุศลสมุทรปราการ',
        ipAddress: '127.0.0.1',
      },
    ]);
  }
}
