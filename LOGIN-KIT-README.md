# Powerant login kit for module apps

Same login as the Portal: username sign-in, deactivated accounts blocked,
permissions loaded from the database, and the session rule below. **Copy these files unchanged.** If something needs to change,
it changes in the Portal first and is copied again, so every app stays identical.

| File | Copy to |
|---|---|
| `src/lib/supabase.ts` | `src/lib/supabase.ts` |
| `src/auth.ts` | `src/auth.ts` |
| `src/pages/LoginPage.tsx` + `LoginPage.css` | `src/pages/` |
| `.env.example` | project root, then copy it to `.env.local` and fill it in |

## Session rule (built in, nothing to do)

- Signed in once per app per computer; new tabs of the same app stay signed in.
- **Signed out automatically 12 hours after signing in**, whether tabs are
  open or closed. Checked every 30 seconds and whenever the tab comes back
  into view.
- "Sign out" ends it immediately, on this computer only.
- Your app must listen for `SIGNED_OUT` (as in the example) to show the login again.

## Requirements

- `npm install @supabase/supabase-js@^2`
- `public/powerant-logo.jpg` (the same logo the Portal uses)
- The shared styles the login card uses: `--brand`, `--border` etc. from
  `tokens.css`, plus the `.card`, `.page-title` and `.page-sub` classes from
  `global.css`. Every module already shares these with the Portal.
- Vercel → Settings → Environment Variables: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` (same values as the Portal), then redeploy.

## Gate the app (example `App.tsx`)

```tsx
import { useEffect, useState } from 'react';
import { canOpenModule, loadSessionUser, signOut, type SessionUser } from './auth';
import { supabase } from './lib/supabase';
import LoginPage from './pages/LoginPage';

const MODULE = 'inventory'; // 'sales' | 'customers' | 'suppliers' | 'production'
const PORTAL_URL = 'https://<your-portal>.vercel.app/';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUser(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginPage title="Inventory" onSuccess={setUser} />;

  if (!canOpenModule(user, MODULE)) {
    return (
      <div className="login-shell">
        <div className="card login-card">
          <h1 className="page-title">No access</h1>
          <p className="page-sub">You don't have access to this module. Ask the owner.</p>
          <a href={PORTAL_URL}>← Back to the Portal</a>
          <button type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return <YourModule user={user} />;
}
```

## Showing and hiding by permission

```ts
const can = (key: string) =>
  user.isOwner || user.permissions.some((p) => p.module === MODULE && p.permission_key === key);

{can('adjust_stock') && <button>Adjust stock</button>}
```

Hiding a button is only for convenience. The database refuses the action
anyway when the permission isn't ticked.

## Data calls

```ts
import { supabase } from './lib/supabase';

// read your own tables (RLS decides what comes back)
await supabase.schema('inventory').from('items').select('*');

// actions go through your module's entry functions
await supabase.schema('inventory').rpc('adjust_stock', { ... });
```

Remember to add your schema to **Supabase → Data API settings → Exposed schemas**.
