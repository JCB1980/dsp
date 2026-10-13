// Dates de l'export Jira (locale fr) : "30/juil./26 2:33 PM"
const MONTHS = {
  'janv.': 0, 'févr.': 1, mars: 2, 'avr.': 3, mai: 4, juin: 5,
  'juil.': 6, août: 7, 'sept.': 8, 'oct.': 9, 'nov.': 10, 'déc.': 11
};

const JIRA_DATE = /^(\d{1,2})\/([^/]+)\/(\d{2,4}) (\d{1,2}):(\d{2})(?: (AM|PM))?$/;

/** Convertit une date Jira en timestamp (ms), ou null si vide / illisible. */
export function parseJiraDate(value) {
  if (!value) return null;
  const m = JIRA_DATE.exec(value.trim());
  if (!m) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  let hours = Number(m[4]) % 12;
  if (m[6] === 'PM') hours += 12;
  if (!m[6]) hours = Number(m[4]);
  return new Date(year, month, Number(m[1]), hours, Number(m[5])).getTime();
}

export const DAY = 24 * 3600 * 1000;

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });

export const formatDate = t => (t ? dateFmt.format(t) : '—');
export const formatDateTime = t => (t ? dateTimeFmt.format(t) : '—');
export const formatMonth = t => monthFmt.format(t);

/** Durée lisible : "3 h", "2,5 j" */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const hours = ms / 3600000;
  if (hours < 24) return `${hours.toLocaleString('fr-FR', { maximumFractionDigits: hours < 10 ? 1 : 0 })} h`;
  const days = ms / DAY;
  return `${days.toLocaleString('fr-FR', { maximumFractionDigits: days < 10 ? 1 : 0 })} j`;
}

/** Valeur pour un <input type="date"> */
export function toInputDate(t) {
  if (!t) return '';
  const d = new Date(t);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromInputDate(s, endOfDay = false) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime();
}

export function startOfMonth(t) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Lundi de la semaine de t, à minuit. */
export function startOfWeek(t) {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}
