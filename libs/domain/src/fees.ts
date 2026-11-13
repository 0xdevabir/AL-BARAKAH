/** All money is integer poisha (1 tk = 100 poisha), so totals can never drift from float rounding. */
export interface FeeConfig {
  emergencyFeePoisha: number;
  riderPayoutPoisha: number;
  riderEmergencyBonusPoisha: number;
  doctorBookingFeePoisha: number;
}

export const DEFAULT_FEES: FeeConfig = {
  emergencyFeePoisha: 10_000,
  riderPayoutPoisha: 3_000,
  riderEmergencyBonusPoisha: 2_000,
  doctorBookingFeePoisha: 10_000,
};

export interface TotalsInput {
  lines: { unitPricePoisha: number; qty: number }[];
  zoneDeliveryFeePoisha: number;
  emergency: boolean;
  fees: FeeConfig;
}

/** Urgent delivery replaces the regular delivery charge: the customer pays the urgent fee instead, never both. */
export function computeTotals({ lines, zoneDeliveryFeePoisha, emergency, fees }: TotalsInput) {
  const subtotalPoisha = lines.reduce((sum, l) => sum + l.unitPricePoisha * l.qty, 0);
  const emergencyFeePoisha = emergency ? fees.emergencyFeePoisha : 0;
  const deliveryFeePoisha = emergency ? 0 : zoneDeliveryFeePoisha;
  return {
    subtotalPoisha,
    deliveryFeePoisha,
    emergencyFeePoisha,
    totalPoisha: subtotalPoisha + deliveryFeePoisha + emergencyFeePoisha,
    riderPayoutPoisha: fees.riderPayoutPoisha + (emergency ? fees.riderEmergencyBonusPoisha : 0),
  };
}

/** The platform's share of a doctor's fee. `pct` is a whole percentage (0-100). */
export function commissionPoisha(feePoisha: number, pct: number): number {
  return Math.round((feePoisha * Math.min(Math.max(pct, 0), 100)) / 100);
}

export function formatTk(poisha: number): string {
  const tk = poisha / 100;
  const text = Number.isInteger(tk)
    ? tk.toLocaleString('en-US')
    : tk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `৳${text}`;
}
