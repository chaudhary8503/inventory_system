/*
  Real authentication via Supabase Auth.

  Staff log in with a USERNAME. Supabase needs an email, so a username is
  mapped to a hidden internal address (ali → ali@staff.powerant.local).
  Nobody ever receives email at that address. Anyone who types a full email
  (e.g. the developer's owner account) signs in with that email directly.

  Who may do what is decided in the database (portal.profiles,
  portal.user_permissions + row-level security). The checks here only decide
  what to SHOW; the database enforces access regardless.
*/
import { clearSignedIn, errorMessage, markSignedIn, portal, sessionLimitReached, supabase } from './lib/supabase';

export const STAFF_EMAIL_DOMAIN = 'staff.powerant.local';

export type Role = 'owner' | 'employee';

export interface Profile {
  user_id: string;
  full_name: string;
  username: string | null;
  role: Role;
  active: boolean;
}

export interface Permission {
  module: string;
  permission_key: string;
}

export interface SessionUser {
  profile: Profile;
  permissions: Permission[];
  isOwner: boolean;
  /** Display name for header and welcome screen. */
  displayName: string;
}

export function usernameToEmail(input: string): string {
  const value = input.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${STAFF_EMAIL_DOMAIN}`;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect username or password.';
  if (m.includes('banned')) return 'This account has been deactivated. Contact the owner.';
  if (m.includes('fetch') || m.includes('network')) return 'Cannot reach the server. Check the internet connection.';
  return message;
}

/** Signs in and returns the loaded user, or throws an Error with a readable message. */
export async function signIn(username: string, password: string): Promise<SessionUser> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  markSignedIn();

  const user = await loadSessionUser();
  if (!user) {
    await signOut();
    throw new Error('This account has been deactivated. Contact the owner.');
  }
  return user;
}

/**
 * Signs out on THIS computer only ('local'), so signing out at the shop
 * doesn't also sign the same person out on their phone.
 * Does nothing when there is no session, so a freshly opened signed-out
 * tab can't sign out the user's other open tabs.
 */
export async function signOut(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  clearSignedIn();
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Loads the signed-in user's profile and permissions.
 * Returns null when there is no session, or the profile is inactive.
 */
export async function loadSessionUser(): Promise<SessionUser | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) return null;
  if (sessionLimitReached()) {
    await signOut();
    return null;
  }

  const [profileRes, permsRes] = await Promise.all([
    portal().from('profiles').select('user_id, full_name, username, role, active').eq('user_id', uid).maybeSingle(),
    portal().rpc('my_permissions'),
  ]);

  if (profileRes.error) throw new Error(errorMessage(profileRes.error));
  if (permsRes.error) throw new Error(errorMessage(permsRes.error));

  const profile = profileRes.data as Profile | null;
  if (!profile || !profile.active) return null;

  return {
    profile,
    permissions: (permsRes.data ?? []) as Permission[],
    isOwner: profile.role === 'owner',
    displayName: profile.full_name || profile.username || 'there',
  };
}

/** True when the user may open this module (owner, or at least one ticked box). */
export function canOpenModule(user: SessionUser, module: string): boolean {
  return user.isOwner || user.permissions.some((p) => p.module === module);
}

/*
  12-hour limit while the app stays open: checked every 30 seconds and
  whenever the tab comes back into view (e.g. a laptop waking up).
  Signing out triggers the app's SIGNED_OUT handler, which shows the login.
  Runs automatically for every app that uses this file.
*/
async function enforceSessionLimit(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session && sessionLimitReached()) await signOut();
}

if (typeof window !== 'undefined') {
  window.setInterval(() => void enforceSessionLimit(), 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void enforceSessionLimit();
  });
}
