import { reactive, shallowRef, computed, markRaw } from 'vue';
import * as db from './db.js';
import { readPlanningFile } from './planningImport.js';
import { DIMENSIONS, NONE, dataRange, valuesOf, computeDashboard, applyDimensionFilters, periodRange, inRange, budgetKey, offerComparison, isFilterActive } from './stats.js';
import { parseOfferDocx, offerTotals, matchTasks, suggestClient } from './offer.js';

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
  view: 'dashboard', // 'dashboard' | 'pivot' | 'budgets' | 'offers' | 'lines'
  refDate: null, // date de référence : réalisé ≤ refDate < à venir
  filters: emptyFilters(),
  budgets: {},
  offers: [], // offres financières : { id, fileName, info, lines, other, link, … }
  selectedOffer: null
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
    state.offers = saved.offers;
    await refreshOfferLinks();
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
    // Nouvelles tâches au planning : on complète les rapprochements des offres.
    await refreshOfferLinks();
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

// --- Offres financières ----------------------------------------------------

const plain = v => JSON.parse(JSON.stringify(v));
const saveOffers = () => persist({ offers: plain(state.offers) });

/** Tâches du planning rattachées à une offre (via client / projet / commande). */
export function offerEntries(offer) {
  const values = new Set(offer.link?.values || []);
  if (!values.size) return [];
  return entries.value.filter(e => valuesOf(e, offer.link.level).some(v => values.has(v)));
}

/**
 * Propose les tâches du planning pour les lignes encore vides : chaque tâche
 * non encore rattachée va à la ligne dont le libellé est le plus proche.
 */
function autoAssignTasks(offer) {
  const taken = new Set(offer.lines.flatMap(l => l.tasks));
  const tasks = [...new Set(offerEntries(offer).map(e => e.task).filter(Boolean))].filter(t => !taken.has(t));
  const empty = offer.lines.filter(l => !l.tasks.length);
  const matches = matchTasks(empty, tasks);
  for (const l of empty) l.tasks = matches.get(l.id) || [];
}

/**
 * Retire des lignes les tâches qui n'existent plus dans le planning (ancien
 * import, nom modifié), puis rattache à nouveau les lignes vides. Sans
 * effet si l'offre n'a encore aucune affectation : on ne perd rien.
 */
function pruneAndAssign(offer) {
  const existing = new Set(offerEntries(offer).map(e => e.task).filter(Boolean));
  if (existing.size) for (const l of offer.lines) l.tasks = l.tasks.filter(t => existing.has(t));
  autoAssignTasks(offer);
}

/**
 * Offre jointe avant l'import du planning (ou client renommé) : on retente
 * de la rattacher au client, puis au projet, du planning.
 */
function relinkOffer(offer) {
  if (offer.link?.values?.length) return false;
  for (const level of ['client', 'project']) {
    const match = suggestClient(offer.info, options.value[level] || []);
    if (match) {
      offer.link = { level, values: [match] };
      return true;
    }
  }
  return false;
}

/** Rattachements automatiques de toutes les offres (après import, au démarrage). */
export async function refreshOfferLinks() {
  if (!state.offers.length || !entries.value.length) return;
  for (const o of state.offers) {
    relinkOffer(o);
    pruneAndAssign(o);
  }
  await saveOffers();
}

/** Bouton « Rattacher automatiquement » : relance le rapprochement des lignes vides. */
export function autoLink(id) {
  return updateOffer(id, o => {
    relinkOffer(o);
    pruneAndAssign(o);
  });
}

/** Joint une offre (.docx) : analyse, rattachement automatique, enregistrement. */
export async function addOffer(file) {
  state.error = '';
  state.notice = '';
  try {
    if (!/\.docx$/i.test(file.name)) throw new Error("Format non reconnu : joignez l'offre financière au format Word (.docx).");
    const buffer = await file.arrayBuffer();
    const parsed = parseOfferDocx(buffer, file.name);
    const id = `offer-${Date.now().toString(36)}`;
    const client = suggestClient(parsed.info, options.value.client || []);
    const offer = {
      id,
      fileName: file.name,
      size: file.size,
      importedAt: Date.now(),
      ...parsed,
      name: [parsed.info.clientShort, parsed.info.title].filter(Boolean).join(' – ') || file.name,
      link: { level: 'client', values: client ? [client] : [] }
    };
    autoAssignTasks(offer);
    await persist({ [`offerFile:${id}`]: buffer });
    state.offers = [...state.offers, offer];
    state.selectedOffer = id;
    await saveOffers();
    const t = offerTotals(offer);
    state.notice =
      `Offre « ${offer.name} » enregistrée : ${offer.lines.length} prestations, ${t.days.toLocaleString('fr-FR')} jours vendus.` +
      (client ? ` Rattachée au client « ${client} » du planning.` : ' Choisissez le client ou le projet du planning à rattacher.');
  } catch (e) {
    state.error = e?.message || String(e);
  }
}

export async function updateOffer(id, mutate) {
  const offer = state.offers.find(o => o.id === id);
  if (!offer) return;
  mutate(offer);
  await saveOffers();
}

/** Change le rattachement au planning, puis propose les tâches des lignes vides. */
export function setOfferLink(id, level, values) {
  return updateOffer(id, o => {
    o.link = { level, values };
    pruneAndAssign(o);
  });
}

/** Rattache des tâches à une ligne ; une tâche n'appartient qu'à une ligne. */
export function setLineTasks(id, lineId, tasks) {
  return updateOffer(id, o => {
    const set = new Set(tasks);
    for (const l of o.lines) {
      if (l.id === lineId) l.tasks = [...tasks];
      else l.tasks = l.tasks.filter(t => !set.has(t));
    }
  });
}

/**
 * Décline une prestation au forfait (ou tout élément hors jours) en jours/homme :
 * elle devient une ligne suivie comme les autres, au TJM implicite
 * montant ÷ jours. Le forfait d'origine est conservé pour pouvoir revenir.
 */
export function convertToDays(id, index, days, profile = '') {
  return updateOffer(id, o => {
    const item = o.other[index];
    if (!item || !(days > 0)) return;
    o.other.splice(index, 1);
    o.lines.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      phase: item.phase,
      label: item.label,
      qty: days,
      profile: profile || 'Forfait',
      unitPrice: item.amount != null ? item.amount / days : null,
      amount: item.amount,
      tasks: [],
      forfait: { qty: item.qty, unit: item.unit, amount: item.amount }
    });
    autoAssignTasks(o);
  });
}

/** Annule la déclinaison en jours : la ligne redevient un forfait. */
export function revertToForfait(id, lineId) {
  return updateOffer(id, o => {
    const i = o.lines.findIndex(l => l.id === lineId);
    const line = o.lines[i];
    if (!line?.forfait) return;
    o.lines.splice(i, 1);
    o.other.push({ phase: line.phase, label: line.label, qty: line.forfait.qty, unit: line.forfait.unit, amount: line.forfait.amount, profile: '' });
  });
}

export async function deleteOffer(id) {
  state.offers = state.offers.filter(o => o.id !== id);
  if (state.selectedOffer === id) state.selectedOffer = state.offers[0]?.id || null;
  await saveOffers();
  try {
    await db.remove(`offerFile:${id}`);
  } catch {
    /* déjà absent */
  }
}

/** Fichier .docx d'origine (ArrayBuffer) d'une offre. */
export function offerFile(id) {
  return db.get(`offerFile:${id}`);
}

/**
 * Budgets issus des offres : une offre rattachée à une seule valeur
 * (un client, un projet ou une commande) fournit ses jours vendus comme
 * budget de cette valeur. Un budget saisi à la main reste prioritaire.
 */
export const offerBudgets = computed(() => {
  const out = {};
  for (const o of state.offers) {
    if (o.link?.values?.length !== 1) continue;
    const key = budgetKey(o.link.level, o.link.values[0]);
    out[key] = (out[key] || 0) + offerTotals(o).days;
  }
  return out;
});
export const effectiveBudgets = computed(() => ({ ...offerBudgets.value, ...state.budgets }));

// --- Sauvegarde complète (budgets + offres avec leurs fichiers) ------------

const toBase64 = buf => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

export async function exportBackup() {
  const files = {};
  for (const o of state.offers) {
    const buf = await offerFile(o.id).catch(() => null);
    if (buf) files[o.id] = toBase64(buf);
  }
  return JSON.stringify({ app: 'dsp-suivi-jours', version: 1, savedAt: Date.now(), budgets: plain(state.budgets), offers: plain(state.offers), files });
}

export async function importBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'dsp-suivi-jours') throw new Error("Ce fichier n'est pas une sauvegarde de l'application.");
  const values = { budgets: data.budgets || {}, offers: data.offers || [] };
  for (const [id, b64] of Object.entries(data.files || {})) values[`offerFile:${id}`] = fromBase64(b64);
  await persist(values);
  state.budgets = values.budgets;
  state.offers = values.offers;
  state.selectedOffer = values.offers[0]?.id || null;
  return values.offers.length;
}

/**
 * Suivi consolidé par ligne d'offre pour le tableau de bord. Les filtres
 * Client / Projet / Commande choisissent les offres affichées (via leur
 * rattachement au planning) ; la comparaison porte sur toute la durée de
 * l'affaire, indépendamment de la période.
 */
export const offerTracking = computed(() => {
  const f = state.filters;
  const scope = ['client', 'project', 'order'].filter(k => isFilterActive(f[k]));
  // Valeurs rattachées : on relit les affectations pour connaître les clients /
  // projets / commandes réellement couverts par chaque offre.
  return state.offers
    .map(offer => {
      const linked = offerEntries(offer);
      return { offer, linked, cmp: offerComparison(offer, linked, refDate.value) };
    })
    .filter(({ linked }) =>
      scope.every(k => {
        const wanted = new Set(f[k]);
        return linked.some(e => valuesOf(e, k).some(v => wanted.has(v)));
      })
    );
});
