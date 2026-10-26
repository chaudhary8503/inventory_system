/*
  Reads Manager.io item names (and the client's own spreadsheets) into
  Inventory items. Pure functions, no React, so they can be tested on their own
  (npm run test:parser).

  Rules (contract v6, section 5), case-insensitive:
    leading "<n>MM" / "<n>mm"          size mm² ("<n>M" too, flagged to check)
    "<n> CORE", "<n>CORE" (incl. 3.5)  cores
    FLEX / FLX / FLEXIBLE              Flexible
    STANDARD / HD                      Standard
    SILVER                             material Silver (otherwise Copper)
    CONTROL, SHIELD, FLAT, ARMOURED/ARMORED, WELDING   cable type (none = Round; >1 = Unclear)
    DOUBLE PVC                         double PVC
    "<a>/<b>" (e.g. 7/29)              wires a, thou b (flagged to check)
    COIL, ROLL, BUNDLE, CABLE/CABEL    ignored filler words
    PAKISTAN, POWERANT                 ignored for now (kept in the Manager.io name)
    CAT 6, FIRE ALARM, LUGS, WRAPPING  category "other"
    blank, or only "STANDARD"          skipped
    anything else without size + cores flagged Unclear
*/

export type ImportCategory = 'finished_cable' | 'other' | 'copper' | 'pvc' | 'semi_finished' | 'consumable' | 'scrap';
export type RowAction = 'keep' | 'merge' | 'skip';

export interface CableSpecs {
  material: string; // Copper | Silver
  size_mm2: string;
  cores: string;
  flex_standard: string; // Flexible | Standard | ''
  cable_type: string; // Round | Flat | Shielded | Control | Armoured | Welding
  double_pvc: boolean;
  wires: string;
  thou: string;
}

export interface ImportRow {
  /** 1-based row number shown to the person. */
  row: number;
  managerKey: string;
  managerName: string;
  action: RowAction;
  /** Row number this row is merged into (action = merge). */
  mergeInto: number | null;
  category: ImportCategory;
  baseUnit: string;
  /** Name for non-cable items (cable names are built from the specs). */
  name: string;
  description: string;
  source: 'made' | 'bought' | 'both';
  specs: CableSpecs;
  flags: string[];
}

export const FLAG = {
  unclear: 'Unclear',
  duplicate: 'Possible duplicate',
  missingFlex: 'Missing Flexible/Standard',
  checkWiresThou: 'Check wires/thou',
  checkSize: 'Check size',
  exists: 'Already in Inventory',
  skipped: 'Skipped',
} as const;

const OTHER_PATTERNS: { re: RegExp; unit: string }[] = [
  { re: /\bCAT\s*-?\s*6\b/, unit: 'roll' },
  { re: /\bFIRE\s+ALARM\b/, unit: 'roll' },
  { re: /\bLUGS?\b/, unit: 'pcs' },
  { re: /\bWRAPPING\b/, unit: 'roll' },
];

const TYPE_PATTERNS: { re: RegExp; type: string }[] = [
  { re: /\bCONTROL\b/, type: 'Control' },
  { re: /\bSHIELD(ED)?\b/, type: 'Shielded' },
  { re: /\bFLAT\b/, type: 'Flat' },
  { re: /\bARMOU?RED\b/, type: 'Armoured' },
  { re: /\bWELDING\b/, type: 'Welding' },
];

/** "FIRE ALARM ROLL 1.5MM" -> "Fire Alarm Roll 1.5 mm"; "CAT 6" stays "CAT 6". */
export function tidyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => {
      if (/^(CAT|PVC|HD)$/i.test(w)) return w.toUpperCase();
      const mm = w.match(/^(\d+(?:\.\d+)?)MM$/i);
      if (mm) return `${mm[1]} mm`;
      if (/\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function emptySpecs(): CableSpecs {
  return { material: 'Copper', size_mm2: '', cores: '', flex_standard: '', cable_type: 'Round', double_pvc: false, wires: '', thou: '' };
}

/** Normalises a number written in a name: "1.50" -> "1.5", "05" -> "5". */
function num(s: string): string {
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : s;
}

/** Parses one Manager.io item name. */
export function parseName(rawName: string, row: number, managerKey?: string): ImportRow {
  const managerName = (rawName ?? '').trim().replace(/\s+/g, ' ');
  const result: ImportRow = {
    row,
    managerKey: (managerKey ?? '').trim() || managerName,
    managerName,
    action: 'keep',
    mergeInto: null,
    category: 'finished_cable',
    baseUnit: 'ft',
    name: '',
    description: '',
    source: 'made',
    specs: emptySpecs(),
    flags: [],
  };

  const upper = managerName.toUpperCase();
  if (!upper || /^STANDARD$/.test(upper)) {
    result.action = 'skip';
    result.flags.push(FLAG.skipped);
    return result;
  }

  const other = OTHER_PATTERNS.find((p) => p.re.test(upper));
  if (other) {
    result.category = 'other';
    result.baseUnit = other.unit;
    result.name = tidyName(managerName);
    return result;
  }

  const s = result.specs;
  const size = upper.match(/^\s*(\d+(?:\.\d+)?)\s*(MM|M)(?![A-Z])/);
  if (size) {
    s.size_mm2 = num(size[1]);
    if (size[2] === 'M') result.flags.push(FLAG.checkSize);
  }
  const cores = upper.match(/(\d+(?:\.\d+)?)\s*CORE/);
  if (cores) s.cores = num(cores[1]);

  const flex = /\b(FLEXIBLE|FLEX|FLX)\b/.test(upper);
  const standard = /\b(STANDARD|HD)\b/.test(upper);
  if (flex && standard) result.flags.push(FLAG.unclear);
  else if (flex) s.flex_standard = 'Flexible';
  else if (standard) s.flex_standard = 'Standard';
  else result.flags.push(FLAG.missingFlex);

  if (/\bSILVER\b/.test(upper)) {
    s.material = 'Silver';
    result.source = 'bought';
  }

  const types = TYPE_PATTERNS.filter((t) => t.re.test(upper)).map((t) => t.type);
  if (types.length === 1) s.cable_type = types[0];
  else if (types.length > 1) {
    s.cable_type = types[0];
    if (!result.flags.includes(FLAG.unclear)) result.flags.push(FLAG.unclear);
  }

  if (/\bDOUBLE\s+PVC\b/.test(upper)) s.double_pvc = true;

  const wt = upper.match(/(\d+)\s*\/\s*(\d+)/);
  if (wt) {
    s.wires = num(wt[1]);
    s.thou = num(wt[2]);
    result.flags.push(FLAG.checkWiresThou);
  }

  if ((!s.size_mm2 || !s.cores) && !result.flags.includes(FLAG.unclear)) result.flags.push(FLAG.unclear);
  return result;
}

/** Same specs = same item. Blank wires/thou count as a value. */
export function specKey(r: ImportRow): string {
  if (r.category !== 'finished_cable') return `${r.category}|${r.name.trim().toLowerCase()}`;
  const s = r.specs;
  return [s.material, s.size_mm2, s.cores, s.flex_standard, s.cable_type, s.double_pvc ? 'dpvc' : '', s.wires, s.thou]
    .map((v) => String(v).trim().toLowerCase())
    .join('|');
}

/** Flags rows with the same specs; later ones default to "merge into" the first. */
export function markDuplicates(rows: ImportRow[]): ImportRow[] {
  const first = new Map<string, number>();
  return rows.map((r) => {
    const flags = r.flags.filter((f) => !f.startsWith(FLAG.duplicate));
    let next: ImportRow = { ...r, flags };
    if (r.action !== 'skip') {
      const key = specKey(r);
      const seen = first.get(key);
      if (seen !== undefined) {
        next = { ...next, flags: [...flags, `${FLAG.duplicate} of row ${seen}`] };
        if (r.action === 'keep' && r.mergeInto === null) next = { ...next, action: 'merge', mergeInto: seen };
      } else if (r.action === 'keep') {
        first.set(key, r.row);
      }
    }
    return next;
  });
}

// ---------------------------------------------------------------- reading the sheet

/** Finds the header row and the Key / Name columns by header text. */
export function findColumns(table: string[][]): { headerRow: number; keyCol: number | null; nameCol: number } | null {
  for (let r = 0; r < Math.min(table.length, 10); r++) {
    const cells = table[r].map((c) => String(c ?? '').trim().toLowerCase());
    const nameCol = cells.findIndex((c) => c === 'item name' || c === 'name' || c === 'item');
    if (nameCol >= 0) {
      const keyCol = cells.findIndex((c) => c === 'key' || c === 'item key' || c === 'code' || c === 'item code');
      return { headerRow: r, keyCol: keyCol >= 0 ? keyCol : null, nameCol };
    }
  }
  return null;
}

/** Tab-separated text pasted from Excel (or a CSV file) -> table of strings. */
export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  return lines
    .filter((l) => l.trim() !== '')
    .map((line) => (sep === '\t' ? line.split('\t') : splitCsvLine(line)).map((c) => c.trim()));
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Whole table -> parsed rows with duplicate flags. Rows after the header; blank names are kept as "skip". */
export function parseTable(table: string[][]): { rows: ImportRow[]; error: string | null } {
  const cols = findColumns(table);
  if (!cols) return { rows: [], error: 'No "Name" (or "Item name") column header found in the first rows.' };
  const rows = table
    .slice(cols.headerRow + 1)
    .map((cells, i) => parseName(String(cells[cols.nameCol] ?? ''), i + 1, cols.keyCol === null ? undefined : String(cells[cols.keyCol] ?? '')));
  return { rows: markDuplicates(rows), error: null };
}
