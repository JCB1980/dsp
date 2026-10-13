import { unzipSync, strFromU8 } from 'fflate';

// Lecture d'une offre financière Word (.docx) : on cherche le tableau
// récapitulatif des prestations (colonnes Qté / Profil / P.U. / Coût total) et
// on en extrait les lignes vendues en jours, par phase.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children = (el, name) => Array.from(el.childNodes).filter(n => n.namespaceURI === W && n.localName === name);
const textOf = el => Array.from(el.getElementsByTagNameNS(W, 't'))
  .map(t => t.textContent)
  .join('')
  .replace(/\s+/g, ' ')
  .trim();

/** "1 350,00" / "8,5" / "1 350,00 €" → nombre, sinon null. */
export function parseAmount(s) {
  if (s == null) return null;
  const clean = String(s).replace(/[\s  €]|HT/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

// Unités qui ne sont pas des jours de prestation (abonnements, forfaits…).
const NOT_DAYS = /^(mois|an|ans|année|forfait|u|unité|unités|lot)$/i;

function readTables(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const blocks = [];
  for (const el of Array.from(body?.childNodes || [])) {
    if (el.localName === 'p') blocks.push({ type: 'p', text: textOf(el) });
    else if (el.localName === 'tbl') {
      const rows = Array.from(el.getElementsByTagNameNS(W, 'tr')).map(tr => children(tr, 'tc').map(textOf));
      blocks.push({ type: 'table', rows });
    }
  }
  return blocks;
}

/** Extrait les lignes d'un tableau récapitulatif « Qté / Profil / P.U. ». */
function linesFromSummary(rows) {
  const header = rows.findIndex(r => r.some(c => /^qt[ée]/i.test(c)) && r.some(c => /^profil/i.test(c)));
  if (header < 0) return null;
  const h = rows[header];
  const iQty = h.findIndex(c => /^qt[ée]/i.test(c));
  const iProfile = h.findIndex(c => /^profil/i.test(c));
  const iPrice = h.findIndex(c => /^p\.?\s*u/i.test(c));
  const iTotal = h.findIndex(c => /co[uû]t|total|montant/i.test(c));
  const iLabel = iQty - 1;
  const days = [];
  const other = [];
  let phase = '';
  for (const r of rows.slice(header + 1)) {
    if (r.length === h.length && /^\d+\.?$/.test(r[0]) && r[1]) {
      phase = r[1].replace(/\s+/g, ' ').trim();
      continue;
    }
    if (r.length < h.length) continue; // sous-titres et sous-totaux (cellules fusionnées)
    const label = r[iLabel];
    const qty = parseAmount(r[iQty]);
    const profile = (r[iProfile] || '').trim();
    const price = parseAmount(r[iPrice]);
    const total = parseAmount(r[iTotal]);
    if (!label || /^(sous[- ]?total|total)/i.test(label) || qty == null) continue;
    const line = { phase, label, qty, profile, unitPrice: price, amount: total ?? (price != null ? qty * price : null) };
    if (profile && !NOT_DAYS.test(profile) && price != null) days.push(line);
    else other.push({ ...line, unit: profile || (/forfait/i.test(r[iPrice]) ? 'Forfait' : '') });
  }
  return { days, other };
}

/**
 * Repli : offres sans tableau récapitulatif, avec des lignes du type
 * « 23 | jours | x | 1 350,00 € | = | 31 050,00 €HT » précédées de leur libellé.
 */
function linesFromDetail(blocks) {
  const days = [];
  let lastText = '';
  for (const b of blocks) {
    if (b.type === 'p') {
      if (b.text) lastText = b.text;
      continue;
    }
    for (const r of b.rows) {
      if (r.length >= 4 && /^jours?$/i.test(r[1]) && r[2] === 'x') {
        const qty = parseAmount(r[0]);
        const price = parseAmount(r[3]);
        if (qty != null) days.push({ phase: '', label: lastText || 'Prestation', qty, profile: '', unitPrice: price, amount: parseAmount(r[5]) });
      }
    }
  }
  return days;
}

function detectInfo(blocks, fileName) {
  const info = { title: '', client: '', clientShort: '', date: null };
  const paras = blocks.filter(b => b.type === 'p' && b.text).map(b => b.text);
  info.title = paras.find(p => /logiciel|offre|proposition|solution/i.test(p) && p.length > 25 && !/table des mati/i.test(p)) || paras[0] || '';
  for (const b of blocks) {
    if (b.type !== 'table') continue;
    const head = b.rows[0] || [];
    // Tableau « Diffusion » : Établissement | Destinataire
    if (head.some(c => /tablissement|client/i.test(c)) && b.rows[1]) {
      info.client = info.client || b.rows[1][head.findIndex(c => /tablissement|client/i.test(c))] || '';
    }
    // Tableau « Révisions » : Version | Date | Objet → date la plus récente
    if (head.some(c => /^version$/i.test(c)) && head.some(c => /^date$/i.test(c))) {
      const iDate = head.findIndex(c => /^date$/i.test(c));
      for (const r of b.rows.slice(1)) {
        const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(r[iDate] || '');
        if (m) {
          const t = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
          if (!info.date || t > info.date) info.date = t;
        }
      }
    }
  }
  const acronym = /\(([A-Z0-9][A-Z0-9 &'-]{1,20})\)/.exec(info.client);
  info.clientShort = acronym ? acronym[1].trim() : '';
  if (!info.clientShort) {
    const fromName = /^([A-Z0-9]{3,})[_\s-]/.exec(fileName || '');
    if (fromName) info.clientShort = fromName[1];
  }
  return info;
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Lit une offre .docx (ArrayBuffer) et retourne { info, lines, other }. */
export function parseOfferDocx(buffer, fileName = '') {
  let files;
  try {
    files = unzipSync(new Uint8Array(buffer), { filter: f => f.name === 'word/document.xml' });
  } catch {
    throw new Error("Ce fichier n'est pas un document Word (.docx) valide.");
  }
  if (!files['word/document.xml']) throw new Error("Ce fichier n'est pas un document Word (.docx) valide.");
  const blocks = readTables(strFromU8(files['word/document.xml']));
  let days = [];
  let other = [];
  for (const b of blocks) {
    if (b.type !== 'table') continue;
    const res = linesFromSummary(b.rows);
    if (res) {
      days.push(...res.days);
      other.push(...res.other);
    }
  }
  if (!days.length) days = linesFromDetail(blocks);
  if (!days.length) {
    throw new Error("Aucune prestation en jours trouvée : l'offre doit contenir un tableau récapitulatif (Qté, Profil, P.U.) ou des lignes « N jours x prix ».");
  }
  return {
    info: detectInfo(blocks, fileName),
    lines: days.map(l => ({ id: newId(), tasks: [], ...l })),
    other
  };
}

export const offerTotals = offer => ({
  days: offer.lines.reduce((s, l) => s + (l.qty || 0), 0),
  amount: offer.lines.reduce((s, l) => s + (l.amount ?? (l.qty || 0) * (l.unitPrice || 0)), 0)
});

export const normalize = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Rapprochement automatique ligne d'offre ↔ tâches du planning : libellés
 * identiques, ou l'un contenu dans l'autre (au moins 8 caractères).
 */
export function suggestTasks(label, taskNames) {
  const l = normalize(label);
  if (!l) return [];
  return taskNames.filter(t => {
    const n = normalize(t);
    if (!n) return false;
    if (n === l) return true;
    const [short, long] = n.length < l.length ? [n, l] : [l, n];
    return short.length >= 8 && long.includes(short);
  });
}

/** Le client du planning qui correspond le mieux à l'offre. */
export function suggestClient(info, clients) {
  const keys = [info.clientShort, info.client].map(normalize).filter(Boolean);
  for (const c of clients) {
    const n = normalize(c);
    if (keys.some(k => k === n)) return c;
  }
  for (const c of clients) {
    const n = normalize(c);
    if (n.length >= 3 && keys.some(k => k.includes(n) || n.includes(k))) return c;
  }
  return '';
}
