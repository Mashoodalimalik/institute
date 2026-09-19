# Okasha Institute — Management System

A full-featured, production-ready **Next.js 14** application with **Tailwind CSS** and **Supabase** for comprehensive institute management.

## Features

### ✅ Authentication & RBAC
- Email/password login with Supabase Auth
- 4 roles: `super_admin`, `staff`, `student`, `parent`
- Row-Level Security (RLS) policies for all tables
- Demo mode (works without Supabase credentials)

### ✅ Student Management Dashboard
- Search by name, RFID, biometric ID, phone
- Filter by class and fee status (paid/unpaid/overdue)
- Clickable rows opening full **Student Profile Modal**
- Edit student & parent details inline

### ✅ Fee Collection & PDF Receipts
- Collect fee with amount, discount, payment method
- Auto-generates branded PDF receipt (`@react-pdf/renderer`)
- Unique receipt number (OKI-YYYY-NNNN)
- Instant download link in modal
- Ledger income entry auto-created
- Student fee_status auto-updated to 'paid'

### ✅ Financial Ledger
- Monthly Income / Expenses / Net Balance KPIs
- Itemized transaction table (filter by month + type)
- Log operational expenses (Rent, Salaries, Utilities, etc.)
- Receipt attachment upload

### ✅ Fee Settings
- Universal fee due day (1–31)
- Grace period days before marking overdue
- Late fee (fixed PKR or percentage)
- Reminder interval configuration
- SMS & WhatsApp toggle switches (Twilio)

### ✅ Biometric Webhook — ZKTeco ADMS/WDMS
- `POST /api/attendance/push`
- Device token/secret authentication
- Student lookup by `biometric_id` or `rfid_tag`
- Auto-toggle check_in/check_out
- Instant parent notification (SMS/WhatsApp)

### ✅ Automated Fee Reminder Cron
- `POST /api/cron/fee-reminders`
- Daily at 09:00 AM PKT (configurable via vercel.json)
- Marks overdue, applies late fees to ledger
- Sends SMS/WhatsApp to student + linked parent
- `Authorization: Bearer <CRON_SECRET>` required

### ✅ Attendance Page
- All attendance records table
- Today's check-in/check-out stats
- Biometric device punch log

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

### 3. Run development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

> **Demo Mode:** Without Supabase credentials, the app uses built-in demo data and is fully interactive.

---

## Database Setup (Supabase)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → New Query
3. Paste & run contents of `supabase/schema.sql`
4. Add your credentials to `.env.local`

---

## API Reference

### POST `/api/attendance/push`
ZKTeco biometric webhook.
```json
{
  "user_id": "BIO-001",
  "timestamp": "2026-09-20T09:05:00+05:00",
  "device_id": "GATE-1",
  "secret": "your_device_webhook_secret"
}
```

### POST `/api/cron/fee-reminders`
Trigger fee reminder processing.
```
Authorization: Bearer your_cron_secret
```

### POST `/api/receipts/pdf`
Generate fee receipt PDF (returns binary PDF).
```json
{
  "student_id": "...",
  "amount": 5000,
  "discount": 0,
  "payment_method": "Cash",
  "notes": "September 2026"
}
```

### POST `/api/notifications/send-whatsapp`
Send a WhatsApp message.
```json
{
  "phone": "+923001234567",
  "custom_message": "Hello from Okasha Institute!"
}
```

---

## Deployment (Vercel)

```bash
npx vercel --prod
```

Set all env vars from `.env.example` in Vercel project settings.  
The cron job is auto-registered via `vercel.json` (requires Vercel Pro+).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS 3 |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| PDF | @react-pdf/renderer |
| SMS/WhatsApp | Twilio |
| Icons | Lucide React |
| Deployment | Vercel |
