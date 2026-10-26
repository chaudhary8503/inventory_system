/*
  Checks the Manager.io name parser against the client's real export.
    npm run test:parser                      (uses scripts/fixtures/manager-inventory-data.xlsx)
    npm run test:parser -- path/to/file.xlsx
  Prints every row and fails on any broken expectation.
*/
import readXlsxFile from 'read-excel-file/node';
import { FLAG, parseName, parseTable, type ImportRow } from '../src/import/managerParser.ts';

let failures = 0;
function expect(label: string, ok: boolean, info = ''): void {
  if (ok) console.log(`PASS: ${label}`);
  else {
    failures++;
    console.log(`FAIL: ${label} ${info}`);
  }
}

// ---- single names (spelling variants seen in the export)
const one = (name: string): ImportRow => parseName(name, 1);
const c = one('1.5MM 12 CORE FLEXIBLE / CONTROL');
expect('size, cores, Flexible, Control', c.specs.size_mm2 === '1.5' && c.specs.cores === '12' && c.specs.flex_standard === 'Flexible' && c.specs.cable_type === 'Control');
const hd = one('1.5mm 1Core HD Pakistan Coil');
expect('"1Core HD Pakistan Coil": 1 core, HD = Standard, Pakistan ignored, no flags',
  hd.specs.cores === '1' && hd.specs.flex_standard === 'Standard' && hd.flags.length === 0, JSON.stringify(hd));
const sv = one('10MM 2CORE HD SILVER BUNDLE CABEL');
expect('"2CORE HD SILVER BUNDLE CABEL": silver, standard, bought, filler words ignored',
  sv.specs.material === 'Silver' && sv.specs.cores === '2' && sv.specs.flex_standard === 'Standard' && sv.source === 'bought' && sv.flags.length === 0);
const flx = one('50MM 1CORE FLX');
expect('"FLX" = Flexible', flx.specs.flex_standard === 'Flexible' && flx.specs.size_mm2 === '50');
const m = one('50M 3CORE FLX');
expect('"50M" is read as 50 mm² and flagged to check', m.specs.size_mm2 === '50' && m.flags.includes(FLAG.checkSize));
const tc = one('120MM 3.5 CORE STANDARD');
expect('3.5 cores', tc.specs.cores === '3.5');
const wt = one('16MM 3 CORE STANDARD 7/54');
expect('7/54 -> wires 7, thou 54, flagged', wt.specs.wires === '7' && wt.specs.thou === '54' && wt.flags.includes(FLAG.checkWiresThou));
const dp = one('4MM 1 CORE FLEX DOUBLE PVC');
expect('DOUBLE PVC', dp.specs.double_pvc && dp.specs.flex_standard === 'Flexible');
const arm = one('16mm 4Core Silver HD Armoured');
expect('Silver HD Armoured', arm.specs.material === 'Silver' && arm.specs.cable_type === 'Armoured' && arm.specs.flex_standard === 'Standard');
const weld = one('70MM 1 CORE FLEXIBLE WELDING CABLE');
expect('Welding', weld.specs.cable_type === 'Welding');
const shield = one('2.5MM 2CORE SHIELD FLX');
expect('SHIELD = Shielded', shield.specs.cable_type === 'Shielded' && shield.specs.flex_standard === 'Flexible');
const noflex = one('16MM 4 CORE ARMOURED');
expect('no Flexible/Standard is flagged', noflex.flags.includes(FLAG.missingFlex));
const coil = one('Powerant Coil 7/29');
expect('"Powerant Coil 7/29": no size or cores -> Unclear', coil.flags.includes(FLAG.unclear) && coil.specs.wires === '7');
const cat = one('CAT 6');
expect('CAT 6 -> other, roll', cat.category === 'other' && cat.baseUnit === 'roll' && cat.name === 'CAT 6');
const fire = one('FIRE ALARM ROLL 1.5MM');
expect('FIRE ALARM -> other, tidy name', fire.category === 'other' && fire.name === 'Fire Alarm Roll 1.5 mm', fire.name);
const lugs = one('LUGS');
expect('LUGS -> other, pcs', lugs.category === 'other' && lugs.baseUnit === 'pcs');
expect('only "STANDARD" is skipped', one('STANDARD').action === 'skip');
expect('blank is skipped', one('').action === 'skip');
const two = one('1MM 2 CORE FLEXIBLE CONTROL FLAT');
expect('two cable types -> Unclear', two.flags.includes(FLAG.unclear));

// ---- the real export
const file = process.argv[2] ?? new URL('./fixtures/manager-inventory-data.xlsx', import.meta.url).pathname;
const sheet = await readXlsxFile(file);
const table = sheet.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v))));
const { rows, error } = parseTable(table);
expect('header found', error === null, error ?? '');
console.log(`\n${rows.length} rows read from ${file}\n`);
for (const r of rows) {
  const s = r.specs;
  const what =
    r.action === 'skip'
      ? 'SKIP'
      : r.category === 'other'
        ? `other: ${r.name} (${r.baseUnit})`
        : `${s.material === 'Silver' ? 'Silver ' : ''}${s.size_mm2 || '?'} mm² ${s.cores || '?'} core ${s.flex_standard || '?'} ${s.cable_type}${s.double_pvc ? ' DoublePVC' : ''}${s.wires ? ` ${s.wires}/${s.thou}` : ''}`;
  console.log(`${String(r.row).padStart(3)}  ${r.managerName.padEnd(42)} -> ${what}${r.flags.length ? `   [${r.flags.join('; ')}]` : ''}${r.action === 'merge' ? ` MERGE->${r.mergeInto}` : ''}`);
}
const live = rows.filter((r) => r.action !== 'skip');
const cables = live.filter((r) => r.category === 'finished_cable');
const count = (f: (r: ImportRow) => boolean) => rows.filter(f).length;
console.log('');
expect('175 item rows', rows.length === 175, String(rows.length));
expect('2 skipped (blank, "STANDARD")', count((r) => r.action === 'skip') === 2, String(count((r) => r.action === 'skip')));
expect('5 "other" items (CAT 6, LUGS, 2 fire alarm, wrapping)', count((r) => r.category === 'other' && r.action !== 'skip') === 5);
expect('Silver in 15 names', cables.filter((r) => r.specs.material === 'Silver').length === 15, String(cables.filter((r) => r.specs.material === 'Silver').length));
expect('Armoured 4', cables.filter((r) => r.specs.cable_type === 'Armoured').length === 4, String(cables.filter((r) => r.specs.cable_type === 'Armoured').length));
expect('Welding 5', cables.filter((r) => r.specs.cable_type === 'Welding').length === 5, String(cables.filter((r) => r.specs.cable_type === 'Welding').length));
expect('Flat 8', cables.filter((r) => r.specs.cable_type === 'Flat').length === 8, String(cables.filter((r) => r.specs.cable_type === 'Flat').length));
expect('Shielded 14', cables.filter((r) => r.specs.cable_type === 'Shielded').length === 14, String(cables.filter((r) => r.specs.cable_type === 'Shielded').length));
expect('Control 7', cables.filter((r) => r.specs.cable_type === 'Control').length === 7, String(cables.filter((r) => r.specs.cable_type === 'Control').length));
expect('Double PVC 2', cables.filter((r) => r.specs.double_pvc).length === 2);
expect('3.5-core cables found', cables.some((r) => r.specs.cores === '3.5'));
console.log(
  `\nFlags: Unclear ${count((r) => r.flags.includes(FLAG.unclear))}, Missing Flexible/Standard ${count((r) => r.flags.includes(FLAG.missingFlex))}, ` +
    `Check wires/thou ${count((r) => r.flags.includes(FLAG.checkWiresThou))}, Check size ${count((r) => r.flags.includes(FLAG.checkSize))}, ` +
    `Possible duplicate ${count((r) => r.flags.some((f) => f.startsWith(FLAG.duplicate)))}`,
);
console.log(failures ? `\n${failures} FAILED` : '\nALL PARSER CHECKS PASSED');
process.exit(failures ? 1 : 0);
