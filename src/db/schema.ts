import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Firebase Auth linked users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  role: varchar('role', { length: 50 }).notNull().default('Staff'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Patients table (Section 17)
export const patients = pgTable('patients', {
  patientId: uuid('patient_id').defaultRandom().primaryKey(),
  fullName: varchar('full_name', { length: 150 }).notNull(),
  age: integer('age').notNull(),
  disease: text('disease').notNull().default(''),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  createdDate: timestamp('created_date').defaultNow().notNull(),
});

// Bookings table (Section 17)
export const bookings = pgTable('bookings', {
  bookingId: uuid('booking_id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id')
    .references(() => patients.patientId)
    .notNull(),
  bookingDate: date('booking_date').notNull(),
  bookingTime: varchar('booking_time', { length: 50 }).notNull(),
  queueNo: varchar('queue_no', { length: 10 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('Booked'),
  isSpecial: boolean('is_special').notNull().default(false),
  priorityOrder: integer('priority_order').notNull().default(0),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Visits table (Section 17)
export const visits = pgTable('visits', {
  visitId: uuid('visit_id').defaultRandom().primaryKey(),
  patientId: uuid('patient_id')
    .references(() => patients.patientId)
    .notNull(),
  bookingId: uuid('booking_id').references(() => bookings.bookingId),
  queueNo: varchar('queue_no', { length: 10 }).notNull().default(''),
  visitDate: timestamp('visit_date').defaultNow().notNull(),
  diagnosis: text('diagnosis').notNull(),
  note: text('note').notNull().default(''),
  providerName: varchar('provider_name', { length: 150 }).notNull(),
});

// AdminUsers table (Section 17)
export const adminUsers = pgTable('admin_users', {
  adminId: uuid('admin_id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 150 }).notNull().default(''),
  role: varchar('role', { length: 50 }).notNull().default('Staff'),
  email: varchar('email', { length: 150 }).notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// AuditLogs table (Section 17)
export const auditLogs = pgTable('audit_logs', {
  logId: uuid('log_id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  username: varchar('username', { length: 100 }).notNull().default(''),
  action: varchar('action', { length: 255 }).notNull(),
  logDate: timestamp('log_date').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 50 }).notNull().default(''),
});

// Daily schedule configuration (open/closed/paused days & capacity)
export const scheduleSettings = pgTable('schedule_settings', {
  scheduleDate: date('schedule_date').primaryKey(),
  isOpen: boolean('is_open').notNull().default(true),
  isPaused: boolean('is_paused').notNull().default(false),
  slotCapacity: integer('slot_capacity').notNull().default(5),
  reason: varchar('reason', { length: 200 }).notNull().default(''),
  updatedBy: varchar('updated_by', { length: 100 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// System-wide settings (pause flag, announcement, official logo data)
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const patientsRelations = relations(patients, ({ many }) => ({
  bookings: many(bookings),
  visits: many(visits),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  patient: one(patients, {
    fields: [bookings.patientId],
    references: [patients.patientId],
  }),
}));

export const visitsRelations = relations(visits, ({ one }) => ({
  patient: one(patients, {
    fields: [visits.patientId],
    references: [patients.patientId],
  }),
  booking: one(bookings, {
    fields: [visits.bookingId],
    references: [bookings.bookingId],
  }),
}));
