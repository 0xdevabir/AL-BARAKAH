import type { Rx } from './types';

export type Channel = 'GOOGLE_MEET' | 'WHATSAPP';
/** IN_APP is only used for instant calls; doctors never pick it as one of their call types. */
export type CallChannel = Channel | 'IN_APP';
export type Tier = 'SPECIALIST' | 'INTERN';
export interface Booking {
  id: string; code: string; startsAt: string; endsAt: string; status: 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW';
  channel: CallChannel; reason: string | null; patientPhone: string; notes: string | null; prescription: Rx | null;
  customerId: string; customer: { name: string }; kind?: 'SCHEDULED' | 'INSTANT'; videoLink?: string | null;
}
/** A paid consultation waiting for the doctor to accept or decline. */
export interface QueueItem {
  id: string; code: string; kind: 'SCHEDULED' | 'INSTANT'; startsAt: string; endsAt: string; channel: CallChannel;
  reason: string | null; patientPhone: string; customerId: string; customer: { name: string }; waitingSince: string; overdue: boolean;
}
export interface Window { weekday: number; startMinute: number; endMinute: number; slotMinutes: number }
export interface DoctorMe {
  id: string; bmdcNo: string; specialty: string; bio: string; feePoisha: number | null; channels: Channel[];
  meetLink: string | null; whatsapp: string | null; isActive: boolean; availability: (Window & { id: string })[];
  photoUrl: string; qualifications: string; experienceYears: number; workplace: string; languages: string[]; onboardedAt: string | null;
  tier: Tier; onDuty: boolean;
  user: { name: string; phone: string };
}
export interface DoctorSummary {
  today: number; completedMonth: number; noShowMonth: number; patients: number; earnedMonthPoisha: number; hasAvailability: boolean; pending: number;
  next: Pick<Booking, 'id' | 'code' | 'startsAt' | 'endsAt' | 'channel' | 'reason' | 'patientPhone' | 'customerId' | 'customer'> | null;
}
export interface PatientHistory {
  patient: { id: string; name: string; phone: string; since?: string };
  visits: Pick<Booking, 'id' | 'code' | 'startsAt' | 'status' | 'channel' | 'reason' | 'notes' | 'prescription'>[];
}

export const CHANNEL: Record<CallChannel, string> = { GOOGLE_MEET: 'Google Meet', WHATSAPP: 'WhatsApp', IN_APP: 'Instant video' };
export const TIER: Record<Tier, string> = { SPECIALIST: 'Specialist', INTERN: 'Duty doctor (intern)' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A booking can be closed from 15 minutes before it starts. */
export const canClose = (b: Pick<Booking, 'status' | 'startsAt'>, now = Date.now()) =>
  b.status === 'CONFIRMED' && new Date(b.startsAt).getTime() - 15 * 60_000 <= now;

/** Where the doctor taps to start the call. WhatsApp calls go to the patient's number; instant calls use the in-app room. */
export function joinLink(channel: CallChannel, me: Pick<DoctorMe, 'meetLink'> | undefined, patientPhone: string, videoLink?: string | null) {
  if (channel === 'IN_APP') return videoLink ?? null;
  if (channel === 'GOOGLE_MEET') return me?.meetLink ?? null;
  return `https://wa.me/${patientPhone.replace(/\D/g, '')}`;
}

export type RxDoctor = Pick<DoctorMe, 'bmdcNo' | 'specialty'> & { user: { name: string } };
export function rxText(rx: Rx, patient: string, doctor?: RxDoctor) {
  const lines = [
    doctor ? `${doctor.user.name} · ${doctor.specialty} · BMDC ${doctor.bmdcNo}` : '',
    `Patient: ${patient}`,
    rx.diagnosis ? `Diagnosis: ${rx.diagnosis}` : '',
    '',
    ...rx.items.map((i, n) => `${n + 1}. ${i.medicine}${i.dose ? ` ${i.dose}` : ''}${i.frequency ? ` — ${i.frequency}` : ''}${i.days ? ` × ${i.days} days` : ''}${i.instructions ? ` (${i.instructions})` : ''}`),
    rx.advice ? `\nAdvice: ${rx.advice}` : '',
    rx.followUpDays ? `Follow up in ${rx.followUpDays} days` : '',
  ];
  return lines.filter((l, i) => l || i === 3).join('\n').trim();
}

/** Dose patterns doctors in Bangladesh write, with plain words for the patient. */
export const FREQ: { code: string; label: string }[] = [
  { code: '1+0+1', label: 'Morning & night' },
  { code: '1+1+1', label: '3 times a day' },
  { code: '1+0+0', label: 'Morning' },
  { code: '0+0+1', label: 'Night' },
  { code: '0+1+0', label: 'Noon' },
  { code: '1+1+1+1', label: '4 times a day' },
  { code: 'As needed', label: 'When needed' },
];
export const freqLabel = (code: string) => FREQ.find((f) => f.code === code)?.label ?? '';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Opens a clean letterhead prescription in a new window and starts printing (or Save as PDF). */
export function printRx(rx: Rx, patient: string, doctor?: RxDoctor, when: string | Date = new Date()) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return false;
  const date = new Date(when).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' });
  const items = rx.items
    .map(
      (i, n) => `<tr><td class="n">${n + 1}</td><td><b>${esc(i.medicine)}</b> ${esc(i.dose)}<div class="sub">${esc([i.instructions, i.days ? `${i.days} days` : ''].filter(Boolean).join(' · '))}</div></td><td class="f">${esc(i.frequency)}<div class="sub">${esc(freqLabel(i.frequency))}</div></td></tr>`,
    )
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Prescription · ${esc(patient)}</title><style>
    body{font:15px/1.45 system-ui,sans-serif;color:#1d241f;margin:40px;max-width:640px}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #1f5c45;padding-bottom:12px}
    h1{font-size:20px;margin:0} .muted{color:#667} .rx{font:700 34px Georgia,serif;color:#1f5c45;margin:18px 0 6px}
    table{width:100%;border-collapse:collapse} td{padding:10px 6px;border-bottom:1px solid #e3e6e1;vertical-align:top}
    .n{width:22px;color:#667} .f{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums} .sub{color:#667;font-size:13px}
    footer{margin-top:60px;display:flex;justify-content:flex-end} .sign{border-top:1px solid #1d241f;padding-top:6px;min-width:200px;text-align:center}
  </style></head><body>
    <header><div><h1>${esc(doctor?.user.name ?? 'Doctor')}</h1><div class="muted">${esc(doctor?.specialty ?? '')}${doctor ? ` · BMDC ${esc(doctor.bmdcNo)}` : ''}</div></div>
    <div style="text-align:right"><div><b>${esc(patient || 'Patient')}</b></div><div class="muted">${date}</div></div></header>
    ${rx.diagnosis ? `<p><span class="muted">Diagnosis</span><br><b>${esc(rx.diagnosis)}</b></p>` : ''}
    <div class="rx">℞</div><table>${items}</table>
    ${rx.advice ? `<p><span class="muted">Advice</span><br>${esc(rx.advice).replace(/\n/g, '<br>')}</p>` : ''}
    ${rx.followUpDays ? `<p><b>Follow up in ${rx.followUpDays} days</b></p>` : ''}
    <footer><div class="sign">${esc(doctor?.user.name ?? '')}</div></footer>
    <script>onload=()=>{print()}</script></body></html>`);
  w.document.close();
  return true;
}

export interface RxTemplate { name: string; rx: Rx }
const TPL_KEY = 'rx-templates:v1';
export function loadTemplates(): RxTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(TPL_KEY) ?? '[]') as RxTemplate[];
  } catch {
    return [];
  }
}
export function saveTemplates(t: RxTemplate[]) {
  try {
    localStorage.setItem(TPL_KEY, JSON.stringify(t.slice(0, 30)));
  } catch {
    /* storage blocked */
  }
}

/** Ordinal visit label: "First visit", "2nd visit"… */
export function visitLabel(n: number) {
  if (n <= 1) return 'First visit';
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s} visit`;
}
