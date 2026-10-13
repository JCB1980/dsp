<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { filteredEntries, availableDimensions, refDate } from '../lib/store.js';
import { pivot, dimension, fmtMeasure, MEASURES } from '../lib/stats.js';
import { toCsv, download, csvNumber, stamp } from '../lib/exportCsv.js';

// Tableau croisé dynamique : lignes × colonnes, avec sous-lignes repliables.
const cfg = reactive({ rows: 'resource', subRows: 'client', columns: 'month', measure: 'days', scope: 'all' });
const open = ref(new Set());

const dims = computed(() => availableDimensions.value);
watch(
  dims,
  list => {
    const ok = f => !f || ['month', 'week'].includes(f) || list.some(d => d.field === f);
    if (!ok(cfg.rows)) cfg.rows = list[0]?.field || 'resource';
    if (!ok(cfg.subRows) || cfg.subRows === cfg.rows) cfg.subRows = '';
    if (!ok(cfg.columns) || cfg.columns === cfg.rows) cfg.columns = 'month';
  },
  { immediate: true }
);

const table = computed(() =>
  pivot(filteredEntries.value, { rows: cfg.rows, subRows: cfg.subRows || null, columns: cfg.columns || null, measure: cfg.measure, scope: cfg.scope }, refDate.value)
);
const fmt = v => (v ? fmtMeasure(v, cfg.measure) : '');
// Intensité de fond proportionnelle à la valeur (une seule teinte).
const heat = v => (v && table.value.max ? { '--heat': Math.min(1, v / table.value.max) } : null);

function toggle(label) {
  const s = new Set(open.value);
  s.has(label) ? s.delete(label) : s.add(label);
  open.value = s;
}
const allOpen = computed(() => table.value.rows.length > 0 && table.value.rows.every(r => open.value.has(r.label)));
function toggleAll() {
  open.value = allOpen.value ? new Set() : new Set(table.value.rows.map(r => r.label));
}

function exportCsv() {
  const t = table.value;
  const header = [dimension(cfg.rows).label, ...(cfg.subRows ? [dimension(cfg.subRows).label] : []), ...t.cols.map(c => c.label), ...(t.hasColumns ? ['Total'] : [])];
  const line = (labels, node) => [...labels, ...t.cols.map(c => csvNumber(node.cells.get(c.key))), ...(t.hasColumns ? [csvNumber(node.total)] : [])];
  const rows = [];
  for (const r of t.rows) {
    if (cfg.subRows) for (const s of r.children) rows.push(line([r.label, s.label], s));
    else rows.push(line([r.label], r));
  }
  rows.push(line(cfg.subRows ? ['Total', ''] : ['Total'], t.grand));
  download(toCsv(header, rows), `analyse-${cfg.rows}-${stamp()}.csv`);
}
</script>

<template>
  <section class="card pivot">
    <div class="controls">
      <label class="field">
        <span>Lignes</span>
        <select v-model="cfg.rows" class="input">
          <option v-for="d in dims" :key="d.field" :value="d.field">{{ d.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Sous-lignes</span>
        <select v-model="cfg.subRows" class="input">
          <option value="">Aucune</option>
          <option v-for="d in dims.filter(x => x.field !== cfg.rows)" :key="d.field" :value="d.field">{{ d.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Colonnes</span>
        <select v-model="cfg.columns" class="input">
          <option value="">Total seulement</option>
          <option value="month">Mois</option>
          <option value="week">Semaine</option>
          <option v-for="d in dims.filter(x => x.field !== cfg.rows)" :key="d.field" :value="d.field">{{ d.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Mesure</span>
        <select v-model="cfg.measure" class="input">
          <option v-for="(m, k) in MEASURES" :key="k" :value="k">{{ m.label }}</option>
        </select>
      </label>
      <label class="field">
        <span>Périmètre</span>
        <select v-model="cfg.scope" class="input">
          <option value="all">Réalisé + à venir</option>
          <option value="done">Réalisé seulement</option>
          <option value="planned">À venir seulement</option>
        </select>
      </label>
      <div class="actions">
        <button v-if="cfg.subRows" class="btn ghost" @click="toggleAll">{{ allOpen ? 'Tout replier' : 'Tout déplier' }}</button>
        <button class="btn" @click="exportCsv">Exporter CSV</button>
      </div>
    </div>

    <p v-if="!table.rows.length" class="muted empty">Aucune donnée pour ces filtres.</p>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="first">{{ dimension(cfg.rows).label }}<template v-if="cfg.subRows"> / {{ dimension(cfg.subRows).label }}</template></th>
            <th v-for="c in table.cols" :key="c.key" class="num-col" :title="c.label">{{ c.label }}</th>
            <th v-if="table.hasColumns" class="num-col total">Total</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in table.rows" :key="r.label">
            <tr class="parent">
              <th class="first" scope="row">
                <button v-if="cfg.subRows" class="tog" :aria-expanded="open.has(r.label)" @click="toggle(r.label)">
                  <span class="chev" :class="{ on: open.has(r.label) }">›</span>{{ r.label }}
                </button>
                <template v-else>{{ r.label }}</template>
              </th>
              <td v-for="c in table.cols" :key="c.key" class="num" :style="heat(r.cells.get(c.key))">{{ fmt(r.cells.get(c.key)) }}</td>
              <td v-if="table.hasColumns" class="num total">{{ fmt(r.total) }}</td>
            </tr>
            <template v-if="cfg.subRows && open.has(r.label)">
              <tr v-for="s in r.children" :key="r.label + '/' + s.label" class="child">
                <th class="first" scope="row">{{ s.label }}</th>
                <td v-for="c in table.cols" :key="c.key" class="num">{{ fmt(s.cells.get(c.key)) }}</td>
                <td v-if="table.hasColumns" class="num total">{{ fmt(s.total) }}</td>
              </tr>
            </template>
          </template>
        </tbody>
        <tfoot>
          <tr>
            <th class="first" scope="row">Total</th>
            <td v-for="c in table.cols" :key="c.key" class="num">{{ fmt(table.grand.cells.get(c.key)) }}</td>
            <td v-if="table.hasColumns" class="num total">{{ fmt(table.grand.total) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>

<style scoped>
.pivot {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: flex-end;
}
.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.empty {
  margin: 12px 0;
}
.table-wrap {
  overflow: auto;
  max-height: calc(100vh - 260px);
  min-height: 200px;
}
table {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  width: max-content;
  min-width: 100%;
}
th,
td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--grid);
  white-space: nowrap;
}
thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface);
  color: var(--muted);
  font-weight: 500;
  text-align: left;
  border-bottom-color: var(--axis);
}
.num-col {
  text-align: right;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.first {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
  text-align: left;
  font-weight: 500;
  min-width: 200px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}
thead .first {
  z-index: 3;
}
td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  /* fond : bleu dont l'intensité suit la valeur */
  background: color-mix(in srgb, var(--series-1) calc(var(--heat, 0) * 28%), transparent);
}
td.total,
th.total {
  font-weight: 600;
  background: var(--surface-2);
}
.child th,
.child td {
  color: var(--ink-2);
  font-size: 12px;
}
.child .first {
  padding-left: 34px;
  font-weight: 400;
}
tfoot th,
tfoot td {
  font-weight: 600;
  border-top: 1px solid var(--axis);
  background: var(--surface-2);
  position: sticky;
  bottom: 0;
}
.tog {
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chev {
  display: inline-block;
  width: 12px;
  transition: transform 0.15s;
  color: var(--muted);
}
.chev.on {
  transform: rotate(90deg);
}
</style>
