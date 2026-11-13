'use client';

import { useGet } from '@/lib/api';

export interface PublicSettings {
  emergencyFeePoisha: number;
  doctorBookingFeePoisha: number;
  instantConsultFeePoisha: number;
  instantResponseMinutes: number;
  hotlines: string[];
  requireRxUpload: boolean;
}

/** The store-facing settings, cached for ten minutes across every screen. */
export function usePublicSettings() {
  return useGet<PublicSettings>('/settings/public', { staleMs: 600_000 }).data;
}


export { telHref } from '@/lib/tel';
