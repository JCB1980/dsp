import { openWorkbook, excelSerialToDate } from './xlsx.js';

// Export PlanningPME « number-hours-by-resource-by-task-by-day » : l'onglet
// « _All » contient une ligne par ressource, par tâche et par jour, avec les
// informations de la tâche (Evt_), du jour (Dat_), de la ressource (Res_), du
// client (Cus_) et du projet (Pro_ / Sub_).

const REQUIRED = ['Evt_Key', 'Res_Label', 'Dat_StartDate'];

// Libellés anglais de l'export de démonstration → français.
const RESOURCE_TYPES = { Human: 'Humaine', Material: 'Matériel', 'To plan': 'À planifier' };
const STATUSES = { '1-Planned': '1 - Planifié', '2-Confirmed': '2 - Confirmé', '3-Done': '3 - Réalisé' };
const UNPLANNED = new Set(['To plan', 'À planifier', 'A planifier']);

const clean = v => (v == null ? '' : String(v).trim());
const num = v => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Heure "08:30:00" ou fraction de jour Excel → "08:30". */
function hourOf(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const minutes = Math.round((v % 1) * 1440);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const m = /(\d{1,2}):(\d{2})/.exec(String(v));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function dateOf(v, date1904) {
  if (typeof v === 'number') return excelSerialToDate(v, date1904);
  const s = clean(v);
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  return null;
}

/** Choisit l'onglet de données : « _All » ou, à défaut, le premier qui a les bonnes colonnes. */
function findDataSheet(wb) {
  const candidates = ['_All', ...wb.sheetNames.filter(n => n !== '_All')];
  for (const name of candidates) {
    if (!wb.sheetNames.includes(name)) continue;
    const rows = wb.rows(name);
    const header = rows?.[0]?.map(clean) || [];
    if (REQUIRED.every(c => header.includes(c))) return { name, rows };
  }
  throw new Error(
    "Onglet de données introuvable : le fichier doit contenir l'onglet « _All » de l'export PlanningPME (colonnes Evt_Key, Res_Label, Dat_StartDate…)."
  );
}

/**
 * Transforme les lignes brutes en affectations journalières.
 *
 * L'export répète une même affectation pour chaque département de la
 * ressource (ex. « Commercial, IT » → 2 lignes identiques). Ces doublons sont
 * fusionnés, sinon les jours seraient comptés plusieurs fois (le tableau
 * croisé de l'export a ce défaut).
 */
export function rowsToEntries(rows, date1904 = false) {
  const header = rows[0].map(clean);
  const col = name => header.indexOf(name);
  const get = (row, name) => {
    const i = col(name);
    return i < 0 ? null : row[i];
  };
  const entries = [];
  const seen = new Map();
  let duplicates = 0;
  let absences = 0;

  for (const row of rows.slice(1)) {
    if (!row || !row.length) continue;
    const eventKey = clean(get(row, 'Evt_Key'));
    const resource = clean(get(row, 'Res_Label'));
    const date = dateOf(get(row, 'Dat_StartDate'), date1904);
    if (!eventKey || !resource || date == null) continue;
    // Absences (CP, RTT, jours fériés) : ne sont pas des jours projet.
    if (/^indisponibilit/i.test(clean(get(row, 'Evt_Type')))) {
      absences++;
      continue;
    }

    const start = hourOf(get(row, 'Dat_StartHour'));
    const end = hourOf(get(row, 'Dat_EndHour'));
    const resourceKey = clean(get(row, 'Res_Key')) || resource;
    const id = `${eventKey}|${resourceKey}|${date}|${start}|${end}`;
    const department = clean(get(row, 'Res_Department'));
    const client = clean(get(row, 'Cus_Label')) || clean(get(row, 'Cus_Company'));

    const existing = seen.get(id);
    if (existing) {
      duplicates++;
      if (department && !existing.departments.includes(department)) existing.departments.push(department);
      if (client && client !== existing.client && !existing.otherClients.includes(client)) existing.otherClients.push(client);
      continue;
    }

    const rawType = clean(get(row, 'Res_Type'));
    const rawStatus = clean(get(row, 'Evt_Status'));
    const days = num(get(row, 'Dat_Days'));
    const daysExtra = num(get(row, 'Dat_DaysExtra'));
    const hours = num(get(row, 'Dat_Hours'));
    const hoursExtra = num(get(row, 'Dat_HoursExtra'));
    const entry = {
      id,
      eventKey,
      // Objet de la prestation : le sous-projet (Sub_Label) quand il existe,
      // sinon le nom de l'événement. C'est le libellé repris par l'offre.
      task: clean(get(row, 'Sub_Label')) || clean(get(row, 'Evt_Label')),
      // Prix unitaire et durée vendue du sous-projet, pour contrôle.
      subUnitPrice: num(get(row, 'Sub_PRIXUNIT')) || null,
      category: clean(get(row, 'Evt_Category')),
      status: STATUSES[rawStatus] || rawStatus,
      // Commande : n° d'événement, sinon n° de commande du projet (Pro_NUMBC).
      order: clean(get(row, 'Evt_Order')) || clean(get(row, 'Pro_NUMBC')),
      billingType: clean(get(row, 'Evt_BillingType')),
      remark: clean(get(row, 'Evt_Remark')),
      date,
      start,
      end,
      days,
      daysExtra,
      hours,
      hoursExtra,
      totalDays: days + daysExtra,
      // Coût interne calculé par PlanningPME (coût de la ressource), s'il est renseigné.
      cost: num(get(row, 'Dat_Cost')),
      totalHours: hours + hoursExtra,
      resource,
      resourceKey,
      resourceType: RESOURCE_TYPES[rawType] || rawType,
      unplanned: UNPLANNED.has(rawType) || UNPLANNED.has(resource),
      departments: department ? [department] : [],
      client,
      otherClients: [],
      project: clean(get(row, 'Pro_Label')),
      subProject: clean(get(row, 'Sub_Label'))
    };
    seen.set(id, entry);
    entries.push(entry);
  }
  // Les départements multiples sont exportés en une seule cellule
  // (« Commercial, IT ») ou en plusieurs lignes : on normalise en liste.
  for (const e of entries) {
    e.departments = [...new Set(e.departments.flatMap(d => d.split(/\s*,\s*/)).filter(Boolean))];
  }
  return { entries, duplicates, absences };
}

export async function readPlanningFile(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Format non reconnu : importez le fichier Excel (.xlsx) exporté de PlanningPME.');
  const wb = openWorkbook(new Uint8Array(await file.arrayBuffer()));
  const { name, rows } = findDataSheet(wb);
  const { entries, duplicates, absences } = rowsToEntries(rows, wb.date1904);
  if (!entries.length) throw new Error(`Aucune ligne exploitable dans l'onglet « ${name} ».`);
  let from = Infinity;
  let to = -Infinity;
  for (const e of entries) {
    if (e.date < from) from = e.date;
    if (e.date > to) to = e.date;
  }
  return { entries, duplicates, absences, sheet: name, from, to };
}
