<script setup>
import { computed, ref, watch } from 'vue';
import { allEntries, availableDimensions, refDate, state, setBudget, replaceBudgets, effectiveBudgets, offerBudgets } from '../lib/store.js';
import { BUDGET_LEVELS, BUDGET_STATES, budgetRows, budgetKey, fmtDays } from '../lib/stats.js';
import { formatDate } from '../lib/dates.js';
import { toCsv, download, csvNumber, stamp, parseCsv } from '../lib/exportCsv.js';

// Suivi de consommation : jours réalisés / à venir face aux jours vendus,
// par commande, projet ou client. Les budgets sont saisis ici et conservés
// sur le poste (exportables / importables en CSV).
const levels = computed(() => BUDGET_LEVELS.filter(l => availableDimensions.value.some(d => d.field === l.field)));
const level = ref('project');
watch(
  levels,
  list => {
    if (!list.some(l => l.field === level.value)) level.value = list[0]?.field || 'client';
  },
  { immediate: true }
);
const levelLabel = computed(() => BUDGET_LEVELS.find(l => l.field === level.value)?.label || '');

const stateFilter = ref('');
const search = ref('');
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

// Budget = saisie manuelle, sinon jours vendus de l'offre rattachée.
const all = computed(() => budgetRows(allEntries.value, level.value, effectiveBudgets.value, refDate.value));
const fromOffer = r => {
  const k = budgetKey(level.value, r.name);
  return state.budgets[k] == null && offerBudgets.value[k] != null;
};
const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return all.value
    .filter(r => !stateFilter.value || r.state === stateFilter.value)
    .filter(r => !q || `${r.name} ${r.clients} ${r.resources}`.toLowerCase().includes(q))
    .sort((a, b) => (b.projected ?? -1) - (a.projected ?? -1) || b.total - a.total);
});
const counts = computed(() => {
  const c = {};
  for (const r of all.value) c[r.state] = (c[r.state] || 0) + 1;
  return c;
});
const totals = computed(() => {
  const withBudget = all.value.filter(r => r.budget);
  return {
    budget: withBudget.reduce((s, r) => s + r.budget, 0),
    done: withBudget.reduce((s, r) => s + r.done, 0),
    total: withBudget.reduce((s, r) => s + r.total, 0),
    n: withBudget.length
  };
});

function onBudget(r, ev) {
  setBudget(level.value, r.name, ev.target.value.trim());
}

// Barre de consommation : réalisé (plein) + à venir, sur l'échelle du budget.
function meter(r) {
  if (!r.budget) return null;
  const scale = Math.max(r.budget, r.total);
  return {
    done: (r.done / scale) * 100,
    planned: (r.planned / scale) * 100,
    budget: (r.budget / scale) * 100
  };
}

function exportCsv() {
  const header = [levelLabel.value, 'Clients', 'Consultants', 'Budget (j)', 'Réalisé (j)', 'À venir (j)', 'Total planifié (j)', 'Reste (j)', '% consommé', '% projeté', 'État', 'Premier jour', 'Dernier jour'];
  const lines = rows.value.map(r => [
    r.name,
    r.clients,
    r.resources,
    csvNumber(r.budget),
    csvNumber(r.done),
    csvNumber(r.planned),
    csvNumber(r.total),
    csvNumber(r.remaining),
    r.consumed == null ? '' : csvNumber(r.consumed * 100),
    r.projected == null ? '' : csvNumber(r.projected * 100),
    BUDGET_STATES[r.state].label,
    formatDate(r.first),
    formatDate(r.last)
  ]);
  download(toCsv(header, lines), `suivi-budgets-${level.value}-${stamp()}.csv`);
}

// Sauvegarde / restauration des budgets saisis (tous niveaux).
const fileInput = ref(null);
const message = ref('');
function exportBudgets() {
  const lines = Object.entries(state.budgets).map(([k, v]) => {
    const [lvl, ...name] = k.split('::');
    return [BUDGET_LEVELS.find(l => l.field === lvl)?.label || lvl, name.join('::'), csvNumber(v)];
  });
  download(toCsv(['Niveau', 'Nom', 'Budget (jours)'], lines), `budgets-${stamp()}.csv`);
}
async function importBudgets(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  const lines = parseCsv(await file.text());
  const next = { ...state.budgets };
  let n = 0;
  for (const [lvlLabel, name, value] of lines.slice(1)) {
    const lvl = BUDGET_LEVELS.find(l => l.label.toLowerCase() === String(lvlLabel).trim().toLowerCase() || l.field === lvlLabel)?.field;
    const v = Number(String(value).replace(',', '.'));
    if (!lvl || !name || !Number.isFinite(v) || v <= 0) continue;
    next[budgetKey(lvl, name.trim())] = v;
    n++;
  }
  await replaceBudgets(next);
  message.value = `${n} budgets importés.`;
}
</script>

<template>
  <section class="card budgets">
    <div class="controls">
      <div class="seg" role="radiogroup" aria-label="Niveau de suivi">
        <button v-for="l in levels" :key="l.field" role="radio" :aria-checked="level === l.field" :class="{ on: level === l.field }" @click="level = l.field">
          Par {{ l.label.toLowerCase() }}
        </button>
      </div>
      <input v-model="search" class="input search" type="search" :placeholder="`Rechercher un(e) ${levelLabel.toLowerCase()}, client, consultant…`" />
      <div class="actions">
        <button class="btn" title="Exporter ce tableau (Excel)" @click="exportCsv">Exporter CSV</button>
        <button class="btn ghost" title="Sauvegarder tous les budgets saisis dans un fichier" @click="exportBudgets">Sauvegarder les budgets</button>
        <button class="btn ghost" title="Restaurer des budgets depuis un fichier CSV (Niveau;Nom;Budget)" @click="fileInput.click()">Importer des budgets…</button>
        <input ref="fileInput" type="file" accept=".csv" class="sr-only" tabindex="-1" @change="importBudgets" />
      </div>
    </div>

    <div class="states">
      <button :class="{ on: !stateFilter }" @click="stateFilter = ''">Tous ({{ all.length }})</button>
      <button v-for="(s, k) in BUDGET_STATES" :key="k" :class="{ on: stateFilter === k }" :disabled="!counts[k]" @click="stateFilter = stateFilter === k ? '' : k">
        <span class="badge" :style="{ background: s.color }" aria-hidden="true">{{ s.icon }}</span>{{ s.label }} ({{ counts[k] || 0 }})
      </button>
    </div>

    <p class="muted hint">
      Saisissez le nombre de <strong>jours vendus</strong> dans la colonne Budget, ou joignez l'offre financière dans l'onglet « Offres & jours
      vendus » (budget affiché « (offre) ») : la consommation est calculée sur toutes les données importées
      (indépendamment des filtres), réalisé jusqu'au {{ formatDate(refDate) }}.
      <template v-if="totals.n">
        Sur les {{ totals.n }} {{ levelLabel.toLowerCase() }}s budgétés : {{ fmtDays(totals.done) }} réalisés et {{ fmtDays(totals.total) }} planifiés pour {{ fmtDays(totals.budget) }} vendus.
      </template>
      <span v-if="message" class="ok">{{ message }}</span>
    </p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ levelLabel }}</th>
            <th class="r">Budget (j)</th>
            <th class="r">Réalisé</th>
            <th class="r">À venir</th>
            <th class="r">Reste</th>
            <th class="meter-col">Consommation</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.name">
            <td class="name">
              <strong>{{ r.name }}</strong>
              <span v-if="r.clients" class="muted sub">{{ r.clients }}</span>
              <span class="muted sub">{{ r.resources || 'aucun consultant' }} · {{ formatDate(r.first) }} → {{ formatDate(r.last) }}</span>
            </td>
            <td class="r">
              <input
                class="input budget"
                type="number"
                min="0"
                step="0.5"
                inputmode="decimal"
                :value="fromOffer(r) ? '' : r.budget ?? ''"
                :placeholder="fromOffer(r) ? `${r.budget} (offre)` : '—'"
                :aria-label="`Budget en jours pour ${r.name}`"
                @change="onBudget(r, $event)"
              />
            </td>
            <td class="r num">{{ fmtDays(r.done) }}</td>
            <td class="r num">{{ r.planned ? fmtDays(r.planned) : '—' }}</td>
            <td class="r num" :class="{ neg: r.remaining < 0 }">{{ r.remaining == null ? '—' : fmtDays(r.remaining) }}</td>
            <td class="meter-col">
              <div v-if="meter(r)" class="meter" :title="`Réalisé ${pf.format(r.consumed)} · projeté ${pf.format(r.projected)} du budget`">
                <div class="track">
                  <span class="m-done" :style="{ width: meter(r).done + '%' }" />
                  <span class="m-planned" :style="{ width: meter(r).planned + '%' }" />
                  <span class="m-budget" :style="{ left: meter(r).budget + '%' }" />
                </div>
                <span class="num pct">{{ pf.format(r.consumed) }}<span class="muted"> / {{ pf.format(r.projected) }}</span></span>
              </div>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <span class="pill"><span class="badge" :style="{ background: BUDGET_STATES[r.state].color }" aria-hidden="true">{{ BUDGET_STATES[r.state].icon }}</span>{{ BUDGET_STATES[r.state].label }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="7" class="muted empty">Aucune ligne.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted legend">
      Barre : <i class="k m-done" /> réalisé · <i class="k m-planned" /> à venir · <i class="k k-line" /> budget. Pourcentages : réalisé / projeté (réalisé + à venir) par rapport au budget.
    </p>
  </section>
</template>

<style scoped>
.budgets {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.seg button {
  border: 0;
  background: var(--surface);
  padding: 6px 12px;
  cursor: pointer;
}
.seg button + button {
  border-left: 1px solid var(--border);
}
.seg button.on {
  background: var(--accent-wash);
  color: var(--accent-ink);
  font-weight: 600;
}
.search {
  flex: 1 1 240px;
  min-width: 180px;
  height: 34px;
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}
.states {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.states button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.states button.on {
  border-color: var(--accent);
  background: var(--accent-wash);
}
.states button:disabled {
  opacity: 0.45;
  cursor: default;
}
.badge {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.hint {
  margin: 0;
  font-size: 12px;
}
.ok {
  color: var(--good-ink);
  margin-left: 8px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 860px;
}
th,
td {
  padding: 8px;
  border-bottom: 1px solid var(--grid);
  text-align: left;
  vertical-align: middle;
}
th {
  font-weight: 500;
  color: var(--muted);
  border-bottom-color: var(--axis);
}
.r {
  text-align: right;
}
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.neg {
  color: var(--critical);
  font-weight: 600;
}
.name {
  max-width: 320px;
}
.name strong {
  display: block;
  font-weight: 600;
}
.sub {
  display: block;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.budget {
  width: 90px;
  text-align: right;
  height: 32px;
}
.meter-col {
  width: 260px;
}
.meter {
  display: flex;
  align-items: center;
  gap: 8px;
}
.track {
  position: relative;
  flex: 1;
  height: 10px;
  border-radius: 5px;
  background: var(--surface-2);
  display: flex;
  gap: 2px;
  overflow: visible;
}
.m-done {
  background: var(--series-1);
  border-radius: 5px 0 0 5px;
}
.m-planned {
  background: var(--series-2);
}
.m-budget {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--ink);
}
.pct {
  font-size: 12px;
  min-width: 80px;
}
.empty {
  text-align: center;
  padding: 20px;
}
.legend {
  font-size: 12px;
  margin: 0;
}
.k {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  vertical-align: -1px;
}
.k-line {
  width: 2px;
  background: var(--ink);
}
</style>
