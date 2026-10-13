import { DAY, startOfMonth, startOfWeek, formatMonth, formatDate } from './dates.js';

export const NONE = '(non renseigné)';

// Axes d'analyse. `list` : le champ est une liste (une ressource peut
// appartenir à plusieurs départements).
export const DIMENSIONS = [
  { field: 'resource', label: 'Consultant', plural: 'consultants' },
  { field: 'client', label: 'Client', plural: 'clients' },
  { field: 'project', label: 'Projet', plural: 'projets' },
  { field: 'order', label: 'Commande', plural: 'commandes' },
  { field: 'task', label: 'Tâche', plural: 'tâches' },
  { field: 'departments', label: 'Département', plural: 'départements', list: true },
  { field: 'resourceType', label: 'Type de ressource', plural: 'types' },
  { field: 'status', label: 'Statut', plural: 'statuts' }
];
export const dimension = field => DIMENSIONS.find(d => d.field === field);

/** Valeurs d'une affectation pour un axe (toujours une liste). */
export function valuesOf(entry, field) {
  const v = entry[field];
  if (Array.isArray(v)) return v.length ? v : [NONE];
  return [v || NONE];
}

export const MEASURES = {
  days: { label: 'Jours', unit: 'j', get: e => e.totalDays },
  hours: { label: 'Heures', unit: 'h', get: e => e.totalHours }
};

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const fmtDays = v => (v == null ? '—' : `${(Math.abs(v) < 10 ? nf2 : nf1).format(v)} j`);
export const fmtHours = v => (v == null ? '—' : `${nf1.format(v)} h`);
export const fmtMeasure = (v, measure) => (measure === 'hours' ? fmtHours(v) : fmtDays(v));

export const isFilterActive = v => (Array.isArray(v) ? v.length > 0 : Boolean(v));

/** Applique les filtres d'axes (pas la période). */
export function applyDimensionFilters(entries, filters) {
  const active = DIMENSIONS.filter(d => isFilterActive(filters[d.field])).map(d => {
    const set = new Set(filters[d.field]);
    return e => valuesOf(e, d.field).some(v => set.has(v));
  });
  if (!active.length) return entries;
  return entries.filter(e => active.every(match => match(e)));
}

export function dataRange(entries) {
  let from = Infinity;
  let to = -Infinity;
  for (const e of entries) {
    if (e.date < from) from = e.date;
    if (e.date > to) to = e.date;
  }
  return from === Infinity ? null : { from, to };
}

export const PERIODS = [
  { id: 'all', label: 'Toute la période importée' },
  { id: 'month', label: 'Mois de la date de référence' },
  { id: 'prevMonth', label: 'Mois précédent' },
  { id: 'quarter', label: 'Trimestre en cours' },
  { id: 'year', label: 'Année en cours' },
  { id: 'custom', label: 'Période personnalisée' }
];

export function periodRange(filters, refDate, range) {
  const r = new Date(refDate);
  const y = r.getFullYear();
  const m = r.getMonth();
  const end = (yy, mm) => new Date(yy, mm + 1, 0).getTime();
  switch (filters.period) {
    case 'month':
      return { from: new Date(y, m, 1).getTime(), to: end(y, m) };
    case 'prevMonth':
      return { from: new Date(y, m - 1, 1).getTime(), to: end(y, m - 1) };
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: new Date(y, q, 1).getTime(), to: end(y, q + 2) };
    }
    case 'year':
      return { from: new Date(y, 0, 1).getTime(), to: new Date(y, 11, 31).getTime() };
    case 'custom':
      return { from: filters.from ?? range?.from ?? -Infinity, to: filters.to ?? range?.to ?? Infinity };
    default:
      return range ? { ...range } : { from: -Infinity, to: Infinity };
  }
}

export const inRange = (d, r) => d >= r.from && d <= r.to;

/** Jours ouvrés (lundi → vendredi) entre deux dates incluses. */
export function businessDays(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  let n = 0;
  for (let d = new Date(from); d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Totaux par valeur d'un axe : réalisé / à venir / total. */
export function groupBy(entries, field, refDate, measure = 'days') {
  const get = MEASURES[measure].get;
  const map = new Map();
  for (const e of entries) {
    const v = get(e);
    const done = e.date <= refDate;
    for (const key of valuesOf(e, field)) {
      let g = map.get(key);
      if (!g) map.set(key, (g = { label: key, done: 0, planned: 0, value: 0, first: e.date, last: e.date }));
      if (done) g.done += v;
      else g.planned += v;
      g.value += v;
      if (e.date < g.first) g.first = e.date;
      if (e.date > g.last) g.last = e.date;
    }
  }
  return [...map.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));
}

export function topWithOther(rows, limit, otherLabel = 'Autres') {
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit).reduce((s, r) => s + r.value, 0);
  return [...rows.slice(0, limit), { label: otherLabel, value: rest, other: true }];
}

/** Série temporelle réalisé / à venir, par semaine ou par mois. */
export function timeline(entries, range, refDate, measure = 'days') {
  const get = MEASURES[measure].get;
  if (!range || !Number.isFinite(range.from)) return { granularity: 'semaine', points: [] };
  const weekly = (range.to - range.from) / DAY <= 120;
  const bucketStart = weekly ? startOfWeek : startOfMonth;
  const next = t => {
    const d = new Date(t);
    return weekly
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime()
      : new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  };
  const points = [];
  const index = new Map();
  for (let b = bucketStart(range.from); b <= range.to; b = next(b)) {
    index.set(b, points.length);
    points.push({
      start: b,
      label: weekly ? `Sem. du ${formatDate(b).slice(0, 5)}` : formatMonth(b),
      done: 0,
      planned: 0
    });
  }
  for (const e of entries) {
    const i = index.get(bucketStart(e.date));
    if (i === undefined) continue;
    if (e.date <= refDate) points[i].done += get(e);
    else points[i].planned += get(e);
  }
  return { granularity: weekly ? 'semaine' : 'mois', points };
}

/** Indicateurs du tableau de bord. */
export function computeDashboard(entries, filters, refDate, range) {
  const period = periodRange(filters, refDate, range);
  const scoped = applyDimensionFilters(entries, filters).filter(e => inRange(e.date, period));
  const sumDays = list => list.reduce((s, e) => s + e.totalDays, 0);
  const done = scoped.filter(e => e.date <= refDate);
  const human = scoped.filter(e => !e.unplanned && e.resourceType !== 'Matériel');
  const consultants = new Set(human.map(e => e.resource));

  // Capacité : jours ouvrés de la période (bornée aux données) × consultants actifs.
  const capFrom = Math.max(period.from, range?.from ?? period.from);
  const capTo = Math.min(period.to, range?.to ?? period.to);
  const capacity = businessDays(capFrom, capTo) * consultants.size;
  const humanDays = sumDays(human.filter(e => !e.unplanned));

  return {
    period,
    count: scoped.length,
    kpis: {
      total: sumDays(scoped),
      done: sumDays(done),
      planned: sumDays(scoped) - sumDays(done),
      hours: scoped.reduce((s, e) => s + e.totalHours, 0),
      extra: scoped.reduce((s, e) => s + e.daysExtra, 0),
      unplanned: sumDays(scoped.filter(e => e.unplanned)),
      consultants: consultants.size,
      clients: new Set(scoped.map(e => e.client).filter(Boolean)).size,
      occupancy: capacity ? humanDays / capacity : null,
      capacity
    },
    timeline: timeline(scoped, { from: Math.max(period.from, range?.from ?? -Infinity), to: Math.min(period.to, range?.to ?? Infinity) }, refDate),
    byResource: groupBy(scoped, 'resource', refDate),
    byClient: groupBy(scoped, 'client', refDate),
    byProject: groupBy(scoped, 'project', refDate),
    byOrder: groupBy(scoped, 'order', refDate),
    byTask: groupBy(scoped, 'task', refDate),
    byDepartment: groupBy(scoped, 'departments', refDate),
    scoped
  };
}

/**
 * Tableau croisé : lignes × colonnes (axe, mois, semaine ou aucune).
 * Retourne lignes triées par total, colonnes ordonnées, totaux.
 */
export function pivot(entries, { rows, subRows, columns, measure = 'days', scope = 'all' }, refDate) {
  const get = MEASURES[measure].get;
  const list = scope === 'done' ? entries.filter(e => e.date <= refDate) : scope === 'planned' ? entries.filter(e => e.date > refDate) : entries;
  const colKey = e => {
    if (columns === 'month') return [startOfMonth(e.date)];
    if (columns === 'week') return [startOfWeek(e.date)];
    if (!columns) return ['total'];
    return valuesOf(e, columns);
  };
  const colSet = new Map();
  const rowMap = new Map();
  const add = (node, c, v) => {
    node.cells.set(c, (node.cells.get(c) || 0) + v);
    node.total += v;
  };
  const newNode = label => ({ label, cells: new Map(), total: 0, children: new Map() });
  const grand = newNode('Total');
  for (const e of list) {
    const v = get(e);
    for (const c of colKey(e)) {
      colSet.set(c, (colSet.get(c) || 0) + v);
      add(grand, c, v);
      for (const r of valuesOf(e, rows)) {
        if (!rowMap.has(r)) rowMap.set(r, newNode(r));
        const node = rowMap.get(r);
        add(node, c, v);
        if (subRows) {
          for (const s of valuesOf(e, subRows)) {
            if (!node.children.has(s)) node.children.set(s, newNode(s));
            add(node.children.get(s), c, v);
          }
        }
      }
    }
  }
  const timeCols = columns === 'month' || columns === 'week';
  const cols = [...colSet.keys()]
    .sort((a, b) => (timeCols ? a - b : colSet.get(b) - colSet.get(a) || String(a).localeCompare(String(b), 'fr')))
    .map(k => ({
      key: k,
      label: columns === 'month' ? formatMonth(k) : columns === 'week' ? `S. ${formatDate(k).slice(0, 5)}` : k === 'total' ? 'Total' : k
    }));
  const sortNodes = map =>
    [...map.values()]
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fr'))
      .map(n => ({ ...n, children: sortNodes(n.children) }));
  let max = 0;
  for (const n of rowMap.values()) for (const v of n.cells.values()) if (v > max) max = v;
  return { cols, rows: sortNodes(rowMap), grand, max, hasColumns: Boolean(columns) };
}

// --- Suivi des budgets (jours vendus) -------------------------------------

export const BUDGET_LEVELS = [
  { field: 'order', label: 'Commande' },
  { field: 'project', label: 'Projet' },
  { field: 'client', label: 'Client' }
];

export const budgetKey = (level, name) => `${level}::${name}`;

/**
 * Consommation par commande / projet / client, comparée au budget saisi.
 * Calculée sur toutes les données importées (indépendamment de la période),
 * car un budget se consomme sur toute la durée de l'affaire.
 */
export function budgetRows(entries, level, budgets, refDate) {
  const groups = groupBy(entries, level, refDate);
  return groups
    .filter(g => g.label !== NONE)
    .map(g => {
      const clients = new Set();
      const resources = new Set();
      for (const e of entries) {
        if (valuesOf(e, level).includes(g.label)) {
          if (e.client) clients.add(e.client);
          if (!e.unplanned) resources.add(e.resource);
        }
      }
      const budget = budgets[budgetKey(level, g.label)];
      const hasBudget = typeof budget === 'number' && budget > 0;
      const consumed = hasBudget ? g.done / budget : null;
      const projected = hasBudget ? g.value / budget : null;
      let state = 'none';
      if (hasBudget) state = g.done > budget ? 'over' : g.value > budget ? 'risk' : projected >= 0.8 ? 'watch' : 'ok';
      return {
        name: g.label,
        clients: level === 'client' ? '' : [...clients].join(', '),
        resources: [...resources].join(', '),
        done: g.done,
        planned: g.planned,
        total: g.value,
        budget: hasBudget ? budget : null,
        remaining: hasBudget ? budget - g.value : null,
        consumed,
        projected,
        state,
        first: g.first,
        last: g.last
      };
    });
}

export const BUDGET_STATES = {
  over: { label: 'Dépassé', icon: '▲', color: 'var(--critical)' },
  risk: { label: 'Dépassement prévu', icon: '!', color: 'var(--serious)' },
  watch: { label: 'Vigilance (≥ 80 %)', icon: '!', color: 'var(--warning)' },
  ok: { label: 'Dans le budget', icon: '✓', color: 'var(--good)' },
  none: { label: 'Sans budget', icon: '–', color: 'var(--axis)' }
};
