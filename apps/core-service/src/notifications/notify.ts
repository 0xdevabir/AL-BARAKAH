import type { EPrescription } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import type { MailService } from '@albarakah/nest-common';

export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
}

/** Inbox rows are best-effort: a failed notification must never undo the change that caused it. */
export async function notify(prisma: PrismaClient, rows: NotificationInput[]) {
  if (!rows.length) return;
  await prisma.notification.createMany({ data: rows.map((r) => ({ ...r, body: r.body ?? '' })) }).catch(() => undefined);
}

export async function activeAdminIds(prisma: PrismaClient) {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true } });
  return admins;
}

/** A plain-text prescription, laid out the same way every time, for emails and the inbox. */
export function rxText(rx: EPrescription, meta: { code: string; patient: string; doctor: string; bmdcNo: string; at: Date }) {
  const date = meta.at.toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' });
  const lines = [
    `Prescription ${meta.code} — ${date}`,
    `Doctor: ${meta.doctor} (BMDC ${meta.bmdcNo})`,
    `Patient: ${meta.patient}`,
    '',
    ...(rx.diagnosis ? [`Diagnosis: ${rx.diagnosis}`, ''] : []),
    'Rx',
    ...rx.items.map((i, n) => {
      const parts = [i.dose, i.frequency, i.days ? `${i.days} days` : '', i.instructions].filter(Boolean).join(' · ');
      return `${n + 1}. ${i.medicine}${parts ? ` — ${parts}` : ''}`;
    }),
    ...(rx.advice ? ['', `Advice: ${rx.advice}`] : []),
    ...(rx.followUpDays ? [`Follow up in ${rx.followUpDays} days`] : []),
  ];
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Emails are sent one by one and never throw: an outage only loses the email, not the prescription. */
export async function emailRx(mail: MailService, to: string[], subject: string, text: string) {
  const html = `<pre style="font:14px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#0f2a3d">${esc(text)}</pre>`;
  await Promise.all(to.filter(Boolean).map((addr) => mail.send(addr, subject, text, html).catch(() => undefined)));
}
