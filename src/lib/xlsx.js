import { unzipSync, strFromU8 } from 'fflate';

// Lecteur .xlsx minimal : un fichier .xlsx est une archive zip de fichiers XML.
// On ne lit que ce qui est utile ici (noms des onglets, textes partagés,
// valeurs des cellules), sans dépendance externe.

const parseXml = text => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node, tag) => Array.from(node.getElementsByTagName(tag));

function colIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function textOf(node) {
  // Texte d'un <si> ou <is> : simple (<t>) ou enrichi (<r><t>…</t></r>…).
  return byTag(node, 't')
    .map(t => t.textContent)
    .join('');
}

export function openWorkbook(bytes) {
  const files = unzipSync(bytes);
  const read = path => {
    const f = files[path];
    return f ? strFromU8(f) : null;
  };
  const wbXml = read('xl/workbook.xml');
  if (!wbXml) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx) valide.");
  const wb = parseXml(wbXml);
  const date1904 = byTag(wb, 'workbookPr').some(p => p.getAttribute('date1904') === '1' || p.getAttribute('date1904') === 'true');

  const rels = new Map();
  const relsXml = read('xl/_rels/workbook.xml.rels');
  if (relsXml) {
    for (const r of byTag(parseXml(relsXml), 'Relationship')) {
      let target = r.getAttribute('Target');
      target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      rels.set(r.getAttribute('Id'), target);
    }
  }
  const sheets = byTag(wb, 'sheet').map(s => ({
    name: s.getAttribute('name'),
    path: rels.get(s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
  }));

  let shared = null;
  const sharedStrings = () => {
    if (!shared) {
      const xml = read('xl/sharedStrings.xml');
      shared = xml ? byTag(parseXml(xml), 'si').map(textOf) : [];
    }
    return shared;
  };

  /** Lignes d'un onglet sous forme de tableaux de valeurs (texte, nombre, booléen ou null). */
  function rows(name) {
    const sheet = sheets.find(s => s.name === name);
    const xml = sheet?.path && read(sheet.path);
    if (!xml) return null;
    const out = [];
    for (const row of byTag(parseXml(xml), 'row')) {
      const values = [];
      let next = 0;
      for (const c of byTag(row, 'c')) {
        const ref = c.getAttribute('r');
        const i = ref ? colIndex(ref) : next;
        next = i + 1;
        const type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent;
        let value = null;
        if (type === 's') value = v == null ? null : sharedStrings()[Number(v)] ?? null;
        else if (type === 'inlineStr') value = textOf(c);
        else if (type === 'str' || type === 'e') value = v ?? null;
        else if (type === 'b') value = v === '1';
        else if (v != null && v !== '') value = Number(v);
        values[i] = value;
      }
      const r = Number(row.getAttribute('r'));
      out[r ? r - 1 : out.length] = values;
    }
    return Array.from(out, r => r || []);
  }

  return { sheetNames: sheets.map(s => s.name), rows, date1904 };
}

/** Numéro de série Excel → timestamp (heure locale), à minuit si `dateOnly`. */
export function excelSerialToDate(serial, date1904 = false, dateOnly = true) {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const utc = new Date(epoch + Math.round(serial * 86400000));
  const d = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  if (!dateOnly) d.setHours(utc.getUTCHours(), utc.getUTCMinutes());
  return d.getTime();
}
