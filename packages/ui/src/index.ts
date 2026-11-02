export { ApiClient, ApiError, type SessionUser, type TokenVault } from './api.svelte.js';
export { default as Sheet } from './Sheet.svelte';
export { default as Segmented } from './Segmented.svelte';
export { default as OtpLogin } from './OtpLogin.svelte';

const dhaka = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', ...opts });
const timeFmt = dhaka({ hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = dhaka({ weekday: 'short', day: 'numeric', month: 'short' });

/** Always Bangladesh time, whatever timezone the device is set to. */
export const fmtTime = (d: string | Date) => timeFmt.format(new Date(d));
export const fmtDay = (d: string | Date) => dayFmt.format(new Date(d));
export const fmtWhen = (d: string | Date) => `${fmtDay(d)}, ${fmtTime(d)}`;
export const fmtWindow = (a: string | Date, b: string | Date) => `${fmtDay(a)}, ${fmtTime(a)} – ${fmtTime(b)}`;
