export const ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderActor = 'CUSTOMER' | 'ADMIN' | 'RIDER';

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, readonly OrderActor[]>>> = {
  PLACED: { CONFIRMED: ['ADMIN'], CANCELLED: ['ADMIN', 'CUSTOMER'] },
  CONFIRMED: { PACKED: ['ADMIN'], CANCELLED: ['ADMIN'] },
  PACKED: { ASSIGNED: ['ADMIN'], CANCELLED: ['ADMIN'] },
  // A rider who declines a job hands it back: it returns to PACKED for the pharmacy to reassign.
  ASSIGNED: { ASSIGNED: ['ADMIN'], PACKED: ['RIDER'], OUT_FOR_DELIVERY: ['RIDER'], CANCELLED: ['ADMIN'] },
  OUT_FOR_DELIVERY: { DELIVERED: ['RIDER'], FAILED: ['RIDER', 'ADMIN'] },
  DELIVERED: {},
  CANCELLED: {},
  FAILED: { ASSIGNED: ['ADMIN'], CANCELLED: ['ADMIN'] },
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

/** Statuses where stock is returned, because the goods never reached the customer. */
export function restoresStock(to: OrderStatus): boolean {
  return to === 'CANCELLED';
}
