export interface Doctor { id: string; name: string; specialty: string; bio: string; bmdcNo: string; feePoisha: number | null; channels: ('GOOGLE_MEET' | 'WHATSAPP')[] }

export async function load({ fetch }) {
  const base = import.meta.env.VITE_API_BASE;
  const [doctors, settings] = await Promise.all([
    fetch(`${base}/doctors`).then((r) => r.json() as Promise<Doctor[]>),
    fetch(`${base}/settings/public`).then((r) => r.json() as Promise<{ doctorBookingFeePoisha: number }>),
  ]);
  return { doctors, defaultFee: settings.doctorBookingFeePoisha };
}
