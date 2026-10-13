import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readPlanningFile } from '../src/lib/planningImport.js';
import { excelSerialToDate } from '../src/lib/xlsx.js';

// Fichier d'exemple fourni par PlanningPME (données de démonstration, nov. 2020).
const fixture = () => {
  const buf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/exemple-planningpme.xlsx'));
  return { name: 'exemple.xlsx', arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const sum = (list, f) => Math.round(list.reduce((s, e) => s + f(e), 0) * 1000) / 1000;

describe('excelSerialToDate', () => {
  it('convertit les dates Excel', () => {
    expect(new Date(excelSerialToDate(44137))).toEqual(new Date(2020, 10, 2));
  });
});

describe('readPlanningFile', () => {
  it("lit l'onglet _All et fusionne les doublons dus aux départements multiples", async () => {
    const { entries, duplicates, sheet, from, to } = await readPlanningFile(fixture());
    expect(sheet).toBe('_All');
    expect(duplicates).toBe(11);
    expect(entries).toHaveLength(46 - 11);
    expect(new Date(from)).toEqual(new Date(2020, 10, 2));
    expect(new Date(to)).toEqual(new Date(2020, 10, 8));
    const adam = entries.filter(e => e.resource === 'Adam');
    // Le tableau croisé de l'export affiche 53 h pour Adam : chaque ligne y est comptée 2 fois.
    expect(sum(adam, e => e.hours)).toBe(26.5);
    expect(adam[0].departments).toEqual(['Administration > Accountability', 'Commercial']);
  });

  it('extrait client, projet, statut et type de ressource', async () => {
    const { entries } = await readPlanningFile(fixture());
    const e = entries.find(x => x.eventKey === '361' && x.resource === 'Hugh');
    expect(e).toMatchObject({ task: 'Maintenance', project: 'ProjectRA-963', status: '2 - Confirmé', resourceType: 'Humaine', start: '08:00', end: '10:00', hours: 2 });
    expect(entries.find(x => x.eventKey === '18').client).toBe('Target Skills');
    expect(entries.find(x => x.resource === 'To plan').unplanned).toBe(true);
    // Week-end : 0 h normale + 7 h supplémentaires = 1 jour.
    const sat = entries.find(x => x.eventKey === '9' && new Date(x.date).getDay() === 6);
    expect(sat).toMatchObject({ days: 0, daysExtra: 1, totalDays: 1, totalHours: 7 });
  });

  it('refuse un fichier qui ne vient pas de PlanningPME', async () => {
    await expect(readPlanningFile({ name: 'a.csv', arrayBuffer: async () => new ArrayBuffer(0) })).rejects.toThrow(/xlsx/);
  });
});
