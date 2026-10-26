# Inventory (Powerant)

Stock per location, bundles of finished cable, movements, delivery challans, adjustments, opening stock, item master
(with the Manager.io item import), group minimum levels and stock value. Contract v6. React 19 + Vite + TypeScript, data from the shared Supabase project (schema `inventory`).

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
| Bundles `#/bundles`, bundle history `#/bundle/<id>` | `view_bundles` |
| Movements `#/movements` (and `#/movements/<id>` from Portal alerts) | `view_movements`; Reverse needs `reverse_movements` |
| Adjust `#/adjust` | `adjust_stock` + the location assigned to the person |
| Transfer `#/transfer` (multi-line, prints a challan) | `record_transfer` + the sending location assigned |
| Challans `#/challans`, printable challan `#/challan/<id>` | `record_transfer` or `view_movements` |
| Opening stock `#/opening` | `record_opening_stock` + the location assigned |
| Trends `#/trends` | `view_trends` |
| Stock value `#/value` | `view_costs` |
| Items `#/items`, Spec lists `#/specs`, Import `#/import` | `manage_items` (standard cost: `edit_standard_cost`) |
| Minimum levels `#/minimums` | view: `view_stock`; edit: `manage_items` |
| Locations `#/locations` | `manage_locations`; Location access section: owner only |
| Settings `#/settings` (thresholds, adjustment reasons) | `manage_settings` |

Reorder levels are set on the item page (`set_reorder_levels`).

## Feet or metres

Each person's length unit comes from the Portal (`portal.get_my_settings()` → `{"length_unit": "ft" | "m"}`), read
once after login. Every length of a feet item is shown and entered in that unit; the database always stores feet.
If the Portal function doesn't exist yet, the app uses feet.

## Manager.io item import

Items → Import from Manager.io. Paste the Batch Update export from Excel or upload the .xlsx/.csv; every name is
parsed (`src/import/managerParser.ts`), reviewed in a grid, then created in one batch that can be undone until any of
its items has stock. Stock quantities are never imported. Check the parser against the client's real export:

```bash
npm run test:parser
```

## Code map

| File | What |
|---|---|
| `src/api.ts` | Every database call (reads through RLS, writes through Inventory's functions) |
| `src/App.tsx` | Login gate, navigation, routes |
| `src/router.ts` | Hash routes (no router library) |
| `src/session.ts` | Signed-in user, permission check, shared item and location lists |
| `src/pages/*` | One file per screen |
| `src/components/*` | Header, searchable item picker, shared form pieces |
| `src/import/managerParser.ts` | Manager.io name parser (tested by `scripts/test-parser.ts`) |
| `src/format.ts` | Number, money, date formatting and the feet/metres conversion |
