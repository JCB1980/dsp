<script setup>
import { computed, ref, watch } from 'vue';
import { filteredEntries, refDate } from '../lib/store.js';
import { fmtDays, fmtHours } from '../lib/stats.js';
import { formatDate } from '../lib/dates.js';
import { toCsv, download, csvNumber, stamp } from '../lib/exportCsv.js';

// Détail des affectations journalières (après filtres), triable et exportable.
const search = ref('');
const sortKey = ref('date');
const sortDir = ref(-1);
const page = ref(0);
const PAGE = 100;
const nf = new Intl.NumberFormat('fr-FR');
const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const searched = computed(() => {
  const terms = norm(search.value.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return filteredEntries.value;
  return filteredEntries.value.filter(e => {
    const hay = norm(`${e.resource} ${e.client} ${e.project} ${e.order} ${e.task} ${e.status} ${e.remark} ${e.eventKey}`);
    return terms.every(t => hay.includes(t));
  });
});

const COLUMNS = [
  ['date', 'Date'],
  ['resource', 'Consultant'],
  ['client', 'Client'],
  ['project', 'Projet'],
  ['order', 'Commande'],
  ['task', 'Tâche'],
  ['status', 'Statut'],
  ['totalHours', 'Heures'],
  ['totalDays', 'Jours']
];
const sorted = computed(() => {
  const k = sortKey.value;
  const dir = sortDir.value;
  return [...searched.value].sort((a, b) => {
    const x = a[k];
    const y = b[k];
    const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr');
    return c * dir || (a.date - b.date) * dir;
  });
});
const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE)));
const visible = computed(() => sorted.value.slice(page.value * PAGE, (page.value + 1) * PAGE));
watch([searched, sortKey, sortDir], () => (page.value = 0));
const totals = computed(() => ({
  days: searched.value.reduce((s, e) => s + e.totalDays, 0),
  hours: searched.value.reduce((s, e) => s + e.totalHours, 0)
}));

function sortBy(k) {
  if (sortKey.value === k) sortDir.value = -sortDir.value;
  else {
    sortKey.value = k;
    sortDir.value = ['date', 'totalDays', 'totalHours'].includes(k) ? -1 : 1;
  }
}
const arrow = k => (sortKey.value === k ? (sortDir.value > 0 ? '▲' : '▼') : '');

function exportCsv() {
  const header = ['Date', 'Début', 'Fin', 'Consultant', 'Type de ressource', 'Départements', 'Client', 'Projet', 'Sous-projet', 'Commande', 'Tâche', 'Statut', 'Heures', 'dont heures sup.', 'Jours', 'dont jours sup.', 'Réalisé', 'N° tâche'];
  const rows = sorted.value.map(e => [
    formatDate(e.date),
    e.start,
    e.end,
    e.resource,
    e.resourceType,
    e.departments.join(', '),
    e.client,
    e.project,
    e.subProject,
    e.order,
    e.task,
    e.status,
    csvNumber(e.totalHours),
    csvNumber(e.hoursExtra),
    csvNumber(e.totalDays),
    csvNumber(e.daysExtra),
    e.date <= refDate.value ? 'Oui' : 'Non',
    e.eventKey
  ]);
  download(toCsv(header, rows), `affectations-${stamp()}.csv`);
}
</script>

<template>
  <section class="card lines">
    <div class="toolbar">
      <input v-model="search" class="input search" type="search" placeholder="Rechercher : consultant, client, projet, tâche…" aria-label="Rechercher" />
      <span class="muted count">{{ nf.format(sorted.length) }} affectations · {{ fmtDays(totals.days) }} · {{ fmtHours(totals.hours) }}</span>
      <button class="btn" @click="exportCsv">Exporter CSV</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th v-for="[k, l] in COLUMNS" :key="k" :class="{ r: k.startsWith('total') }">
              <button @click="sortBy(k)">{{ l }} <span class="arrow">{{ arrow(k) }}</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in visible" :key="e.id" :class="{ future: e.date > refDate }">
            <td class="num">{{ weekday.format(e.date) }} {{ formatDate(e.date) }} <span class="muted">{{ e.start }}–{{ e.end }}</span></td>
            <td>{{ e.resource }}</td>
            <td :title="e.otherClients.length ? `Autres clients : ${e.otherClients.join(', ')}` : ''">{{ e.client || '—' }}<span v-if="e.otherClients.length" class="muted"> +{{ e.otherClients.length }}</span></td>
            <td>{{ e.project || '—' }}<span v-if="e.subProject" class="muted"> / {{ e.subProject }}</span></td>
            <td>{{ e.order || '—' }}</td>
            <td :title="e.remark">{{ e.task }}</td>
            <td>{{ e.status || '—' }}</td>
            <td class="r num">{{ fmtHours(e.totalHours) }}<span v-if="e.hoursExtra" class="muted" title="dont heures supplémentaires"> (+{{ fmtHours(e.hoursExtra) }})</span></td>
            <td class="r num">{{ fmtDays(e.totalDays) }}</td>
          </tr>
          <tr v-if="!visible.length">
            <td :colspan="COLUMNS.length" class="muted empty">Aucune affectation ne correspond.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pages > 1" class="pager">
      <button class="btn" :disabled="page === 0" @click="page--">Précédent</button>
      <span class="muted num">Page {{ page + 1 }} / {{ pages }}</span>
      <button class="btn" :disabled="page >= pages - 1" @click="page++">Suivant</button>
    </div>
    <p class="muted hint">Les lignes en italique sont à venir (après la date de référence).</p>
  </section>
</template>

<style scoped>
.lines {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.search {
  flex: 1 1 260px;
  min-width: 180px;
  height: 34px;
}
.count {
  font-size: 13px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 960px;
}
th {
  text-align: left;
  font-weight: 500;
  color: var(--muted);
  border-bottom: 1px solid var(--axis);
  padding: 0;
}
th button {
  border: 0;
  background: none;
  padding: 6px 8px;
  width: 100%;
  text-align: inherit;
  cursor: pointer;
  color: inherit;
  font-weight: 500;
}
.r,
th.r button {
  text-align: right;
}
.arrow {
  font-size: 9px;
}
td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--grid);
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
tr.future td {
  font-style: italic;
  color: var(--ink-2);
}
.empty {
  text-align: center;
  padding: 24px;
}
.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}
.hint {
  font-size: 12px;
  margin: 0;
}
</style>
