// Where the app is served from: "/" on its own, "/interschool/" when it runs
// inside the Rafiki Games server. Set at build time by Vite's `base`.
export const BASE = import.meta.env.BASE_URL;

/** A file from web/public, e.g. asset("logo.jpg"). */
export const asset = (file: string) => `${BASE}${file}`;
