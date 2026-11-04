import type { OrderStatus } from '@albarakah/domain';

export interface AddressSnap { label?: string; line: string; phone?: string; notes?: string | null; zone?: string; lat?: number | null; lng?: number | null }

export interface AdminOrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  type: 'NORMAL' | 'EMERGENCY';
  promisedBy: string;
  slotStart: string | null;
  slotEnd: string | null;
  createdAt: string;
  updatedAt: string;
  totalPoisha: number;
  paymentMethod: 'COD' | 'BKASH';
  paymentStatus: string;
  prescriptionKey: string | null;
  notes: string | null;
  addressSnapshot: AddressSnap;
  items: { id: string; nameSnapshot: string; qty: number; unitPricePoisha: number }[];
  customer: { name: string; phone: string };
  rider: { id: string; name: string } | null;
  payments: { id: string }[];
}

export interface AdminOrderDetail extends Omit<AdminOrderRow, 'items' | 'customer' | 'rider' | 'payments'> {
  subtotalPoisha: number;
  deliveryFeePoisha: number;
  emergencyFeePoisha: number;
  riderPayoutPoisha: number;
  rating: number | null;
  feedback: string | null;
  deliveredAt: string | null;
  items: {
    id: string;
    nameSnapshot: string;
    qty: number;
    unitPricePoisha: number;
    allocations: { id: string; qty: number; batch: { batchNo: string; expiresAt: string } }[];
  }[];
  events: { id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; actorId: string | null; note: string | null; createdAt: string }[];
  customer: { id: string; name: string; phone: string; createdAt: string; _count: { orders: number } };
  rider: { id: string; name: string; phone: string } | null;
  payments: { id: string; status: string; amountPoisha: number; trxId: string | null; createdAt: string }[];
  actors: { id: string; name: string; role: string }[];
}

export interface RiderOption { id: string; name: string; phone: string; activeJobs: number; online: boolean }

export interface Counts { counts: Record<string, number>; late: number; active: number }

export interface Dashboard {
  kpis: {
    revenuePoisha: number; revenueChange: number | null; orders: number; ordersChange: number | null; avgOrderPoisha: number;
    todayOrders: number; todayRevenuePoisha: number; newCustomers: number; newCustomersChange: number | null; cancelRate: number;
    rating: number | null; ratingCount: number; lateNow: number; pendingRx: number; cashWithRidersPoisha: number; refundsNeeded: number;
  };
  series: { date: string; orders: number; revenuePoisha: number; delivered: number }[];
  byStatus: Record<string, number>;
  topMedicines: { medicineId: string; name: string; qty: number; revenuePoisha: number }[];
  late: { id: string; code: string; status: OrderStatus; promisedBy: string; type: string; customer: { name: string }; rider: { name: string } | null }[];
  lowStock: { id: string; name: string; strength: string; stock: number; reorderLevel: number }[];
  expiring: { id: string; batchNo: string; expiresAt: string; qtyRemaining: number; medicine: { id: string; name: string } }[];
  consultations: Record<string, { count: number; feePoisha: number }>;
  generatedAt: string;
}

export interface LedgerEntry { id: string; type: 'EARNING' | 'COD_COLLECTED' | 'SETTLEMENT'; amountPoisha: number; note: string | null; createdAt: string; order: { code: string } | null }
export interface Ledger { earnedPoisha: number; codCollectedPoisha: number; settledPoisha: number; cashHeldPoisha: number; entries: LedgerEntry[] }

export interface RxItem { medicine: string; dose: string; frequency: string; days: number; instructions: string }
export interface Rx { diagnosis: string; items: RxItem[]; advice: string; followUpDays: number }
