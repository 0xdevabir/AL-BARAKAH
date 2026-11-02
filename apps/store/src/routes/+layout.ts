// The app build has no server, so every screen renders on the device.
export const ssr = !import.meta.env.VITE_MOBILE;
export const prerender = false;
