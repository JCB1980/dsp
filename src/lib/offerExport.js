import { BUDGET_STATES } from './stats.js';
import { toCsv, csvNumber } from './exportCsv.js';

/** CSV du suivi par ligne d'offre (une ou plusieurs offres). */
export function offerLinesCsv(items) {
  const header = [
    'Client / offre', 'Phase', 'Prestation', 'Profil', 'TJM offre (€ HT)',
    'Jours vendus', 'Consommé (j)', 'À venir (j)', 'Reste à faire (j)', 'Écart prévisionnel (j)',
    'Vendu (€ HT)', 'Coût consommé (€ HT)', 'Coût à venir (€ HT)', 'Reste à faire (€ HT)', 'Écart prévisionnel (€ HT)',
    'Coût interne (€)', 'Marge (€)', 'Tâches du planning', 'Consultants', 'État'
  ];
  const rows = [];
  for (const { offer, cmp } of items) {
    const who = offer.info.clientShort || offer.link.values.join(', ') || offer.fileName;
    for (const l of cmp.lines) {
      rows.push([
        who, l.phase, l.label, l.profile, csvNumber(l.unitPrice),
        csvNumber(l.sold), csvNumber(l.done), csvNumber(l.planned), csvNumber(l.raf), csvNumber(l.remaining),
        csvNumber(l.soldAmount), csvNumber(l.doneAmount), csvNumber(l.plannedAmount), csvNumber(l.rafAmount), csvNumber(l.gapAmount),
        cmp.hasCost ? csvNumber(l.cost) : '', cmp.hasCost ? csvNumber(l.margin) : '',
        l.tasks.join(', '), l.resources, l.state === 'none' ? 'Aucune tâche' : BUDGET_STATES[l.state].label
      ]);
    }
    for (const u of cmp.unassigned) {
      rows.push([who, 'Hors offre', u.task, '', '', '', csvNumber(u.done), csvNumber(u.planned), '', '', '', '', '', '', '', cmp.hasCost ? csvNumber(u.cost) : '', '', u.task, u.resources, '']);
    }
  }
  return toCsv(header, rows);
}
