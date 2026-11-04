import type { Rx } from './types';

export type Channel = 'GOOGLE_MEET' | 'WHATSAPP';
export interface Booking {
  id: string; code: string; startsAt: string; endsAt: string; status: 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW';
  channel: Channel; reason: string | null; patientPhone: string; notes: string | null; prescription: Rx | null;
  customerId: string; customer: { name: string };
}
export interface Window { weekday: number; startMinute: number; endMinute: number; slotMinutes: number }
export interface DoctorMe {
  id: string; bmdcNo: string; specialty: string; bio: string; feePoisha: number | null; channels: Channel[];
  meetLink: string | null; whatsapp: string | null; isActive: boolean; availability: (Window & { id: string })[];
  user: { name: string; phone: string };
}
export interface DoctorSummary {
  today: number; completedMonth: number; noShowMonth: number; patients: number; earnedMonthPoisha: number; hasAvailability: boolean;
  next: Pick<Booking, 'id' | 'code' | 'startsAt' | 'endsAt' | 'channel' | 'reason' | 'patientPhone' | 'customerId' | 'customer'> | null;
}
export interface PatientHistory {
  patient: { id: string; name: string; phone: string; since?: string };
  visits: Pick<Booking, 'id' | 'code' | 'startsAt' | 'status' | 'channel' | 'reason' | 'notes' | 'prescription'>[];
}

export const CHANNEL: Record<Channel, string> = { GOOGLE_MEET: 'Google Meet', WHATSAPP: 'WhatsApp' };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A booking can be closed from 15 minutes before it starts. */
export const canClose = (b: Pick<Booking, 'status' | 'startsAt'>, now = Date.now()) =>
  b.status === 'CONFIRMED' && new Date(b.startsAt).getTime() - 15 * 60_000 <= now;

/** Where the doctor taps to start the call. WhatsApp calls go to the patient's number. */
export function joinLink(channel: Channel, me: Pick<DoctorMe, 'meetLink'> | undefined, patientPhone: string) {
  if (channel === 'GOOGLE_MEET') return me?.meetLink ?? null;
  return `https://wa.me/${patientPhone.replace(/\D/g, '')}`;
}

export function rxText(rx: Rx, patient: string, doctor?: DoctorMe) {
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
