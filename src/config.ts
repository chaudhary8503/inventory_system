/** This app's module key in portal permissions. */
export const MODULE = 'inventory';

/**
 * The Portal's address, for the "Back to the Portal" link. The only place an
 * address may appear (contract A2). Set VITE_PORTAL_URL on Vercel once the
 * domain is connected; the fallback is the planned subdomain.
 */
export const PORTAL_URL: string =
  (import.meta.env.VITE_PORTAL_URL as string | undefined) ?? 'https://portal.powerantcables.com/';
