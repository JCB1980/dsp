import { reactive, shallowRef, computed, markRaw } from 'vue';
import * as db from './db.js';
import { readPlanningFile } from './planningImport.js';
import { DIMENSIONS, NONE, dataRange, valuesOf, computeDashboard, applyDimensionFilters, periodRange, inRange } from './stats.js';

// Affectations : objets bruts (non réactifs en profondeur) pour la rapidité.
const entries = shallowRef([]);

export const state = reactive({
  ready: false,
  storageOk: true,
  meta: null, // { fileName, importedAt, from, to, count, duplicates, history: [] }
  importing: null,
  pendingFile: null, // fichier en attente du choix Remplacer / Compléter
  error: '',
  notice: '',
  view: 'dashboard', // 'dashboard' | 'pivot' | 'budgets' | 'lines'
  refDate: null, // date de référence : réalisé ≤ refDate < à venir
  filters: emptyFilters(),
  budgets: {}
});

function emptyFilters() {
  const f = { period: 'all', from: null, to: null };
  for (const d of DIMENSIONS) f[d.field] = [];
  return f;
}

export const allEntries = computed(() => entries.value);
export const range = computed(() => dataRange(entries.value));

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}
/** Date de référence effective (fin de journée). Par défaut : aujourd'hui. */
export const refDate = computed(() => state.refDate ?? startOfToday());

export const dashboard = computed(() => computeDashboard(entries.value, state.filters, refDate.value, range.value));

/** Affectations filtrées (axes + période), pour l'analyse croisée et le détail. */
export const filteredEntries = computed(() => {
  const period = periodRange(state.filters, refDate.value, range.value);
  return applyDimensionFilters(entries.value, state.filters).filter(e => inRange(e.date, period));
});

/** Valeurs distinctes par axe, pour les listes de filtres. */
export const options = computed(() => {
  const out = {};
  for (const d of DIMENSIONS) {
    const set = new Set();
    for (const e of entries.value) for (const v of valuesOf(e, d.field)) set.add(v);
    out[d.field] = [...set].sort((a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b, 'fr'));
  }
  return out;
});

/** Axes réellement renseignés dans les données (ex. « Commande » peut être vide). */
export const availableDimensions = computed(() =>
  DIMENSIONS.filter(d => options.value[d.field]?.some(v => v !== NONE))
);

export async function init() {
  try {
    const saved = await db.loadAll();
    entries.value = markRaw(saved.entries);
    state.meta = saved.meta;
    state.budgets = saved.budgets;
  } catch {
    state.storageOk = false;
  }
  state.ready = true;
}

async function persist(values) {
  try {
    await db.save(values);
    state.storageOk = true;
  } catch {
    state.storageOk = false;
  }
}

/** Choix d'un fichier : demande Remplacer / Compléter si des données existent. */
export function chooseFile(file) {
  if (!file) return;
  if (entries.value.length) state.pendingFile = file;
  else importFile(file, 'replace');
}

/**
 * Importe un export. Mode « merge » : les affectations du nouveau fichier
 * remplacent celles de la même période ; les autres périodes sont conservées.
 * Cela permet d'accumuler plusieurs extractions (par mois, par trimestre…).
 */
export async function importFile(file, mode = 'replace') {
  state.pendingFile = null;
  state.error = '';
  state.notice = '';
  state.importing = { step: 'Lecture du fichier…' };
  try {
    await new Promise(r => setTimeout(r, 30));
    const result = await readPlanningFile(file);
    state.importing.step = 'Enregistrement…';
    let next = result.entries;
    let removed = 0;
    if (mode === 'merge') {
      const kept = entries.value.filter(e => e.date < result.from || e.date > result.to);
      removed = entries.value.length - kept.length;
      next = [...kept, ...result.entries].sort((a, b) => a.date - b.date);
    }
    const r = dataRange(next);
    const imp = {
      fileName: file.name,
      importedAt: Date.now(),
      from: result.from,
      to: result.to,
      count: result.entries.length,
      duplicates: result.duplicates,
      mode
    };
    const meta = {
      ...imp,
      from: r.from,
      to: r.to,
      count: next.length,
      history: [...(mode === 'merge' ? state.meta?.history || [] : []), imp]
    };
    entries.value = markRaw(next);
    state.meta = meta;
    state.filters = emptyFilters();
    await persist({ entries: next, meta: JSON.parse(JSON.stringify(meta)) });
    state.notice =
      `${result.entries.length} affectations importées` +
      (result.duplicates ? ` (${result.duplicates} lignes en double fusionnées)` : '') +
      (mode === 'merge' ? ` · ${removed} affectations de la même période remplacées` : '') +
      '.';
  } catch (e) {
    state.error = e?.message || String(e);
  } finally {
    state.importing = null;
  }
}

export async function setBudget(level, name, value) {
  const key = `${level}::${name}`;
  const n = Number(String(value).replace(',', '.'));
  const budgets = { ...state.budgets };
  if (value === '' || value == null || !Number.isFinite(n) || n <= 0) delete budgets[key];
  else budgets[key] = n;
  state.budgets = budgets;
  await persist({ budgets: { ...budgets } });
}

export async function replaceBudgets(budgets) {
  state.budgets = { ...budgets };
  await persist({ budgets: { ...budgets } });
}

export async function clearAll() {
  try {
    await db.clearData();
  } catch {
    /* rien à effacer */
  }
  entries.value = [];
  state.meta = null;
  state.filters = emptyFilters();
}

export function resetFilters() {
  state.filters = emptyFilters();
}

/** Clic sur une barre : filtre sur cette valeur. */
export function filterOn(field, value) {
  state.filters[field] = [value];
}
