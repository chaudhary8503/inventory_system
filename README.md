# Inventory (Powerant)

Stock per location, bobbins of finished cable, movements, transfers, adjustments, opening stock, item master and
stock value. React 19 + Vite + TypeScript, data from the shared Supabase project (schema `inventory`).

## Run locally

```bash
npm install
cp .env.example .env.local      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Same as the Portal |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same as the Portal (publishable key, never the secret key) |
| `VITE_PORTAL_URL` | Optional. The Portal's address for the "Portal" button. Defaults to `https://portal.powerantcables.com/`. |

## Deploy (Vercel)

1. Vercel → this project → Settings → Environment Variables: add the variables above, then redeploy.
2. Supabase → Project Settings → Data API → Exposed schemas: `inventory` must be listed (and `portal`).

## Login

`src/lib/supabase.ts`, `src/auth.ts` and `src/pages/LoginPage.*` are the shared **login kit, copied unchanged**
(see `LOGIN-KIT-README.md`). Don't edit them; updates come from the Portal as a file swap.

## Screens and the permission that shows them

The database enforces every rule; hiding tabs is only convenience.

| Tab (hash route) | Permission |
|---|---|
| Stock `#/stock`, item detail `#/item/<id>` | `view_stock` |
| Bobbins `#/bobbins`, bobbin history `#/bobbin/<id>` | `view_bobbins` |
| Movements `#/movements` (and `#/movements/<id>` from Portal alerts) | `view_movements`; Reverse button needs `reverse_movements` |
| Adjust `#/adjust` | `adjust_stock` + the location assigned to the person |
| Transfer `#/transfer` | `record_transfer` + the sending location assigned |
| Opening stock `#/opening` | `record_opening_stock` + the location assigned |
| Trends `#/trends` | `view_trends` |
| Stock value `#/value` | `view_costs` |
| Items `#/items`, Spec lists `#/specs` | `manage_items` (standard cost: `edit_standard_cost`) |
| Locations `#/locations` | `manage_locations`; Location access section: owner only |
| Settings `#/settings` | `manage_settings` |

Reorder levels are set on the item page (`set_reorder_levels`).

## Code map

| File | What |
|---|---|
| `src/api.ts` | Every database call (reads through RLS, writes through Inventory's functions) |
| `src/App.tsx` | Login gate, navigation, routes |
| `src/router.ts` | Hash routes (no router library) |
| `src/session.ts` | Signed-in user, permission check, shared item and location lists |
| `src/pages/*` | One file per screen |
| `src/components/*` | Header, searchable item picker, shared form pieces |
