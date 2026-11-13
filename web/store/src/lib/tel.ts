/** "+880 1700-000000" → "tel:+8801700000000"; plain module so server pages can use it too. */
export const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;
