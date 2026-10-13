import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseOfferDocx, offerTotals, suggestTasks, suggestClient, parseAmount } from '../src/lib/offer.js';
import { offerComparison } from '../src/lib/stats.js';

// Document Word minimal reproduisant la structure d'une offre financière.
const cell = t => `<w:tc><w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p></w:tc>`;
const row = cells => `<w:tr>${cells.map(cell).join('')}</w:tr>`;
const table = rows => `<w:tbl>${rows.map(row).join('')}</w:tbl>`;
const para = t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
function docx(body) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  // new Uint8Array : sous jsdom, TextEncoder renvoie un Uint8Array d'un autre « realm ».
  return zipSync({ 'word/document.xml': new Uint8Array(strToU8(xml)) }).slice().buffer;
}
const offer = docx(
  para('Offre Financière') +
    para('Logiciel de gestion budgétaire en mode Souscription Cloud') +
    table([['Version', 'Date', 'Objet'], ['1.0', '24/07/2025', 'Proposition initiale']]) +
    table([['Établissement', 'Destinataire'], ['Musée des civilisations (MUCEM)', 'M. X']]) +
    table([
      ['', 'PrestationsFournitures', 'Qté', 'Profil', 'P.U. €HT net', 'Coût total €HT Net'],
      ['2.', 'PRESTATIONS DE PILOTAGE', '', '', '', ''],
      ['', 'Suivi et coordination globale du projet', '23', 'CP', '1 350,00', '31 050,00'],
      ['', 'Sous total Pilotage Projet', '31 050,00'],
      ['3.', 'PRESTATIONS TECHNIQUES', '', '', '', ''],
      ['', "Location de l'infrastructure", '12', 'mois', '1 206,00', '14 472,00'],
      ['', 'Installation des produits', '1', '', 'Forfait', '10 925,00'],
      ['7.', 'PRESTATIONS DE FORMATION', '', '', '', ''],
      ['', 'Formation des utilisateurs PEP', '14', 'FOR', '1 350,00', '18 900,00'],
      ['', 'Paramétrage', '8,5', 'CFHS', '1 250,00', '10 625,00'],
      ['', 'TOTAL GENERAL', '75 000,00']
    ])
);

describe('offre financière (.docx)', () => {
  it('lit les montants français', () => {
    expect(parseAmount('1 350,00')).toBe(1350);
    expect(parseAmount('8,5')).toBe(8.5);
    expect(parseAmount('Forfait')).toBeNull();
  });

  it('extrait les prestations en jours, les forfaits à part, et les infos du document', () => {
    const o = parseOfferDocx(offer, 'MUCEM_Offre.docx');
    expect(o.info).toMatchObject({ clientShort: 'MUCEM', title: 'Logiciel de gestion budgétaire en mode Souscription Cloud' });
    expect(new Date(o.info.date)).toEqual(new Date(2025, 6, 24));
    expect(o.lines.map(l => [l.phase, l.label, l.qty, l.profile, l.unitPrice])).toEqual([
      ['PRESTATIONS DE PILOTAGE', 'Suivi et coordination globale du projet', 23, 'CP', 1350],
      ['PRESTATIONS DE FORMATION', 'Formation des utilisateurs PEP', 14, 'FOR', 1350],
      ['PRESTATIONS DE FORMATION', 'Paramétrage', 8.5, 'CFHS', 1250]
    ]);
    expect(o.other.map(x => [x.label, x.unit, x.amount])).toEqual([
      ["Location de l'infrastructure", 'mois', 14472],
      ['Installation des produits', 'Forfait', 10925]
    ]);
    expect(offerTotals(o)).toEqual({ days: 45.5, amount: 60575 });
  });

  it("refuse un document sans prestation en jours", () => {
    expect(() => parseOfferDocx(docx(para('Bonjour')), 'x.docx')).toThrow(/Aucune prestation/);
    expect(() => parseOfferDocx(new ArrayBuffer(8), 'x.docx')).toThrow(/Word/);
  });

  it('rapproche les libellés et le client', () => {
    expect(suggestTasks('Formation des utilisateurs PEP', ['formation des utilisateurs pep', 'Réunion', 'Paramétrage'])).toEqual(['formation des utilisateurs pep']);
    expect(suggestTasks('Paramétrage de la solution PEP', ['Paramétrage'])).toEqual(['Paramétrage']);
    expect(suggestClient({ clientShort: 'MUCEM', client: 'Musée (MUCEM)' }, ['Ville de Lyon', 'Mucem'])).toBe('Mucem');
  });

  it('compare jours vendus et jours planifiés par ligne', () => {
    const o = parseOfferDocx(offer, 'MUCEM_Offre.docx');
    o.lines[1].tasks = ['Formation des utilisateurs PEP'];
    const ref = new Date(2026, 9, 13).getTime();
    const day = d => new Date(2026, 9, d).getTime();
    const linked = [
      ...Array.from({ length: 10 }, (_, i) => ({ task: 'Formation des utilisateurs PEP', date: day(1 + i), totalDays: 1, resource: 'Laura' })),
      ...Array.from({ length: 6 }, (_, i) => ({ task: 'Formation des utilisateurs PEP', date: day(20 + i), totalDays: 1, resource: 'Laura' })),
      { task: 'Réunion interne', date: day(2), totalDays: 0.5, resource: 'Sophie' }
    ];
    const c = offerComparison(o, linked, ref);
    const f = c.lines[1];
    expect(f).toMatchObject({ sold: 14, done: 10, planned: 6, remaining: -2, state: 'risk', doneAmount: 13500 });
    expect(c.lines[0].state).toBe('none');
    expect(c.unassigned).toEqual([expect.objectContaining({ task: 'Réunion interne', total: 0.5 })]);
    expect(c.totals).toMatchObject({ sold: 45.5, done: 10.5, planned: 6, unassigned: 0.5 });
  });
});

import { labelScore, matchTasks } from '../src/lib/offer.js';

describe('rapprochement tolérant des libellés', () => {
  it('reconnaît des libellés proches mais non identiques', () => {
    expect(labelScore('Formation des utilisateurs PEP', 'Formation utilisateurs PEP - session 1')).toBeGreaterThanOrEqual(0.6);
    expect(labelScore('Ateliers de paramétrage PEP', 'Ateliers paramétrage')).toBeGreaterThanOrEqual(0.6);
    expect(labelScore('Bascule et Reprises', 'Reprise des données / bascule')).toBeGreaterThanOrEqual(0.6);
    expect(labelScore('Formation équipe projet PEP', 'Réunion interne PEP')).toBe(0);
  });

  it('attribue chaque tâche à la ligne la plus proche', () => {
    const lines = [
      { id: 'a', label: 'Paramétrage de la solution PEP' },
      { id: 'b', label: 'Dossier de paramétrage PEP' },
      { id: 'c', label: 'Formation des utilisateurs PEP' }
    ];
    const m = matchTasks(lines, ['Paramétrage solution PEP', 'Rédaction dossier paramétrage', 'Formation utilisateurs', 'Réunion interne']);
    expect(m.get('a')).toEqual(['Paramétrage solution PEP']);
    expect(m.get('b')).toEqual(['Rédaction dossier paramétrage']);
    expect(m.get('c')).toEqual(['Formation utilisateurs']);
  });
});
