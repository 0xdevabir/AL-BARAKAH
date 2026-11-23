# E-medicine: doctors first, over-the-counter pharmacy

From 2026-11 the product leads with doctor consultations. The pharmacy sells **only medicines
anyone may buy without a prescription**. Prescription-only, controlled and sensitive products are
not stocked, listed or sold.

## 1. OTC-only catalogue

| Piece | Where |
| --- | --- |
| Policy (allowlist of actives, topical-only actives, deny list, banned forms, eye-drop gate) | `libs/domain/src/otc.ts`, tests in `otc.test.ts` |
| Import refuses restricted rows | `libs/database/scripts/load-catalog.mjs`, `import-dims.mjs` |
| One-off clean-up of an existing DB | `pnpm catalog:purge` (dry run) → `pnpm catalog:purge -- --apply` |
| Admin create/edit refuses restricted products (`RESTRICTED_MEDICINE`) | `apps/core-service/src/catalog/catalog.module.ts` |
| Public search, product page, alternatives and categories hide anything flagged `isRx` | same |
| Orders refuse restricted items (`RX_NOT_SOLD`) | `apps/core-service/src/orders/orders.service.ts` |
| Doctor's ℞ only links pharmacy items that are OTC; other lines say "show this at a licensed pharmacy" | `consultations/rx.ts`, store booking page |

Purge rules: a medicine never ordered is deleted with its batches. One that appears on a past order
is kept for history but hidden, flagged `isRx`, and its stock is zeroed. Every step runs in one
transaction. A report is written to `libs/database/data/purge-report.tsv`.

> The allowlist is a pharmacist-style judgement, not a legal list. Check it against the current
> DGDA OTC list before going live, and edit `otc.ts`. Every import path and the admin form pick the
> change up automatically.

Against the bundled source data, the policy keeps 4,167 of 22,769 rows.

## 2. Consultation flows

| # | Flow | Patient | Doctor | Admin |
| --- | --- | --- | --- | --- |
| 1 | Find a doctor | `/doctors`: specialty, next free slot, consult count, **★ rating** | — | Invite and onboard |
| 2 | Book a slot / instant call | Slot, channel, reason → bKash; 10-minute hold | Queue → accept | — |
| 3 | **Health profile** | `/account/health`: DOB, sex, weight, blood group, allergies, conditions, current medicines; nudged on the booking review step | Shown at the top of the visit; allergies in red | — |
| 4 | **Reports & photos** | Up to 10 JPEG/PNG/WebP/PDF files per booking, private bucket, signed links | Listed in the visit panel | — |
| 5 | **Reschedule** | Same doctor, a free slot, up to 2 times, until the cancel window closes | Notified with the old and new times | — |
| 6 | **Cancel** | HOLD any time; CONFIRMED until `consultCancelHours` (default 2 h) before; an instant call until a doctor picks it up | Notified | Paid → "Refund due" in Consultations → Refunds, one-tap bKash refund |
| 7 | Call | Meet / WhatsApp / in-app video (Jitsi) | Join | — |
| 8 | e-Prescription | Order the OTC lines in one tap; Rx-only lines printed for a pharmacy | Composer warns the pharmacy is OTC only | Copy in Prescriptions |
| 9 | **Rate** | 1–5 stars and an optional note, once, after COMPLETED | Average shown in the dashboard stats | Shown in the consultation list |
| 10 | **Book again** | After a visit, "Book this doctor again" deep-links `/doctors?doctor=<id>` | — | — |

### API added

```
GET  /me/health                          PUT /me/health
GET  /consultations/:id/options          → canCancel, canReschedule, reschedulesLeft, canRate, reason, paid
POST /consultations/:id/cancel           { reason? }
POST /consultations/:id/reschedule       { startsAt }
POST /consultations/:id/rate             { rating 1-5, review? }
POST /consultations/:id/files/upload-url { contentType, name } → { key, url }
POST /consultations/:id/files            { key, name, contentType }
GET  /consultations/:id/files
GET  /doctor/bookings/:id/context        → health, files, previousVisits
```

Code: `apps/core-service/src/consultations/care.controller.ts` (`CareModule`).

### Schema (migration `20261123090000_emedicine`)

- `PatientProfile`: one row per user.
- `ConsultationFile`: key `consult/<consultationId>/<uuid>.<ext>`.
- `Consultation` gains `rescheduledCount`, `cancelledBy`, `cancelReason`, `rating` (CHECK 1–5), `review` and `ratedAt`.
- Setting `consultCancelHours`.

## 3. Rollout

1. `pnpm --filter @albarakah/database migrate:deploy`
2. `pnpm catalog:purge`, then read `libs/database/data/purge-report.tsv`
3. `pnpm catalog:purge -- --apply`
4. Deploy core-service, store and staff.

## 4. Next

- Follow-up reminders from `followUpDays` (worker job and notification).
- Automatic refunds on patient cancel, once bKash refunds are trusted unattended.
- Doctors replying to reviews; hiding abusive reviews.
- Medicine reminders from the ℞ schedule.
