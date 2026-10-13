import { describe, it, expect } from 'vitest';
import { computeDashboard, pivot, budgetRows, budgetKey, businessDays, applyDimensionFilters, dataRange } from '../src/lib/stats.js';

const d = (m, day) => new Date(2026, m - 1, day).getTime();
const e = (o) => ({
  resource: 'Alice', client: 'C1', project: 'P1', order: 'CMD-1', task: 'Conseil', departments: ['Conseil'],
  resourceType: 'Humaine', status: '', unplanned: false, totalDays: 1, totalHours: 7, days: 1, daysExtra: 0, ...o
});
const entries = [
  e({ date: d(10, 5) }),
  e({ date: d(10, 6), totalDays: 0.5, totalHours: 3.5 }),
  e({ date: d(10, 20), resource: 'Bob', client: 'C2', order: 'CMD-2', departments: ['Conseil', 'Technique'] }),
  e({ date: d(10, 21), resource: 'À planifier', unplanned: true, resourceType: 'À planifier', order: 'CMD-2', client: 'C2' })
];
const ref = d(10, 13);

describe('stats', () => {
  it('jours ouvrés', () => {
    expect(businessDays(d(10, 5), d(10, 11))).toBe(5);
  });

  it('indicateurs : réalisé / à venir / à planifier / occupation', () => {
    const k = computeDashboard(entries, { period: 'all' }, ref, dataRange(entries)).kpis;
    expect(k).toMatchObject({ total: 3.5, done: 1.5, planned: 2, unplanned: 1, consultants: 2 });
    // 13 jours ouvrés du 5 au 21/10 × 2 consultants ; 2,5 j de consultants.
    expect(k.capacity).toBe(26);
    expect(k.occupancy).toBeCloseTo(2.5 / 26);
  });

  it('filtre multi-valeurs, y compris sur un champ liste (départements)', () => {
    expect(applyDimensionFilters(entries, { departments: ['Technique'] })).toHaveLength(1);
    expect(applyDimensionFilters(entries, { resource: ['Alice', 'Bob'] })).toHaveLength(3);
  });

  it('tableau croisé consultant × mois avec sous-lignes', () => {
    const t = pivot(entries, { rows: 'resource', subRows: 'client', columns: 'month', measure: 'days' }, ref);
    expect(t.grand.total).toBe(3.5);
    expect(t.rows[0]).toMatchObject({ label: 'Alice', total: 1.5 });
    expect(t.cols.map(c => c.key)).toEqual([d(10, 1)]);
    expect(pivot(entries, { rows: 'client', columns: null, measure: 'hours', scope: 'done' }, ref).grand.total).toBe(10.5);
  });

  it('suivi des budgets par commande', () => {
    const rows = budgetRows(entries, 'order', { [budgetKey('order', 'CMD-1')]: 1, [budgetKey('order', 'CMD-2')]: 5 }, ref);
    const c1 = rows.find(r => r.name === 'CMD-1');
    const c2 = rows.find(r => r.name === 'CMD-2');
    expect(c1).toMatchObject({ done: 1.5, total: 1.5, budget: 1, state: 'over' });
    expect(c2).toMatchObject({ done: 0, planned: 2, remaining: 3, state: 'ok', resources: 'Bob' });
    expect(budgetRows(entries, 'order', {}, ref).every(r => r.state === 'none')).toBe(true);
  });
});
