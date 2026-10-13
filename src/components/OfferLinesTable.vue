<script setup>
import { computed, ref } from 'vue';
import { BUDGET_STATES, fmtDays } from '../lib/stats.js';
import { setLineTasks, updateOffer, revertToForfait } from '../lib/store.js';
import MultiSelect from './MultiSelect.vue';

// Suivi par ligne d'offre : jours vendus / planifiés / reste à faire et leur
// valorisation. Commun au tableau de bord (toutes les offres, lecture seule)
// et à l'onglet Offres (une offre, modifiable : quantités, tâches).
const props = defineProps({
  items: { type: Array, required: true }, // [{ offer, cmp, linked }]
  editable: Boolean,
  showOffers: Boolean, // en-tête et sous-total par offre
  taskOptions: { type: Array, default: () => [] }
});

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const money = v => (v == null || !Number.isFinite(v) ? '—' : eur.format(v));
const days = v => (v ? fmtDays(v) : '—');
// Sous-totaux : « — » plutôt que « 0 € » pour les montants nuls.
const moneyZ = v => (v ? money(v) : '—');
const hasCost = computed(() => props.items.some(i => i.cmp.hasCost));
const showMoney = ref(true);

const SUM_KEYS = ['sold', 'done', 'planned', 'raf', 'remaining', 'soldAmount', 'doneAmount', 'plannedAmount', 'rafAmount', 'gapAmount', 'cost'];
const grand = computed(() => {
  const g = Object.fromEntries(SUM_KEYS.map(k => [k, 0]));
  for (const { cmp } of props.items) for (const k of SUM_KEYS) g[k] += cmp.totals[k] ?? 0;
  // Réalisé / à venir des lignes seulement (le hors-offre est affiché à part).
  g.done = props.items.reduce((s, i) => s + i.cmp.totals.linesDone, 0);
  g.planned = props.items.reduce((s, i) => s + i.cmp.totals.linesPlanned, 0);
  return g;
});
const offerTotals = cmp => ({ ...cmp.totals, done: cmp.totals.linesDone, planned: cmp.totals.linesPlanned });

function meter(l) {
  const scale = Math.max(l.sold, l.total) || 1;
  return { done: (l.done / scale) * 100, planned: (l.planned / scale) * 100, sold: (l.sold / scale) * 100 };
}
function setTjm(offer, line, ev) {
  const v = Number(String(ev.target.value).replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return;
  updateOffer(offer.id, o => {
    const l = o.lines.find(x => x.id === line.id);
    l.unitPrice = v;
    l.amount = (l.qty || 0) * v;
  });
}
function setQty(offer, line, ev) {
  const v = Number(String(ev.target.value).replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return;
  updateOffer(offer.id, o => {
    const l = o.lines.find(x => x.id === line.id);
    l.qty = v;
    if (l.unitPrice != null) l.amount = v * l.unitPrice;
  });
}
const cols = computed(() => 10 + (showMoney.value ? 5 : 0) + (hasCost.value ? 2 : 0) + (props.editable ? 1 : 0));
// Diagnostic : pourquoi des jours ne s'imputent pas sur les lignes.
function issues({ offer, cmp, linked }) {
  const out = [];
  const who = offer.info.clientShort || offer.info.client || 'ce client';
  if (!offer.link?.values?.length) out.push(`Offre non rattachée au planning : choisissez le client (ou le projet) correspondant à « ${who} » dans l'onglet Offres.`);
  else if (!linked?.length) out.push(`Aucune affectation du planning pour « ${offer.link.values.join(', ')} » : vérifiez que l'export PlanningPME couvre ce client et la période du projet.`);
  else {
    const empty = cmp.lines.filter(l => !l.tasks.length).length;
    if (cmp.totals.unassigned > 0)
      out.push(`${fmtDays(cmp.totals.unassigned)} planifiés sur des tâches non rattachées à une ligne de l'offre (liste en bas) : rattachez-les dans la colonne « Tâches du planning » de l'onglet Offres.`);
    else if (empty === cmp.lines.length) out.push('Aucune tâche du planning n\'est rattachée aux lignes de l\'offre.');
  }
  return out;
}
const stateLabel = l => (l.state === 'none' ? 'Aucune tâche' : BUDGET_STATES[l.state].label);
</script>

<template>
  <div class="olt">
    <div class="opts">
      <label class="check"><input v-model="showMoney" type="checkbox" /> Afficher les coûts (€ HT)</label>
      <span class="muted">
        <strong>Coûts</strong> = jours × <strong>TJM de la ligne</strong> (repris de l'offre) · <strong>Reste à faire</strong> = vendus − consommé ·
        <strong>Écart prévisionnel</strong> = vendus − (consommé + à venir)<template v-if="hasCost"> · <strong>coût interne</strong> = coût des ressources calculé par PlanningPME</template>
      </span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr class="groups">
            <th colspan="3"></th>
            <th colspan="5" class="grp">Jours</th>
            <th v-if="showMoney" colspan="5" class="grp">Coûts au TJM de l'offre (€ HT)</th>
            <th v-if="hasCost" colspan="2" class="grp">Coût interne</th>
            <th :colspan="editable ? 3 : 2"></th>
          </tr>
          <tr>
            <th class="first">Prestation</th>
            <th>Profil</th>
            <th class="r" title="Taux journalier moyen de la ligne, repris de l'offre (colonne P.U.)">TJM</th>
            <th class="r">Vendus</th>
            <th class="r">Consommé</th>
            <th class="r">À venir</th>
            <th class="r">Reste à faire</th>
            <th class="r">Écart prév.</th>
            <template v-if="showMoney">
              <th class="r">Vendu</th>
              <th class="r">Consommé</th>
              <th class="r">À venir</th>
              <th class="r">Reste à faire</th>
              <th class="r">Écart prév.</th>
            </template>
            <template v-if="hasCost">
              <th class="r">Coût</th>
              <th class="r">Marge</th>
            </template>
            <th class="meter-col">Consommation</th>
            <th v-if="editable">Tâches du planning</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody v-for="{ offer, cmp, linked } in items" :key="offer.id">
          <tr v-if="showOffers" class="offer-row">
            <th class="first" colspan="3">
              {{ offer.info.clientShort || offer.link.values.join(', ') || 'Offre' }}
              <span class="muted">· {{ offer.info.title || offer.fileName }}</span>
            </th>
            <td class="r num">{{ days(cmp.totals.sold) }}</td>
            <td class="r num">{{ days(offerTotals(cmp).done) }}</td>
            <td class="r num">{{ days(offerTotals(cmp).planned) }}</td>
            <td class="r num">{{ days(cmp.totals.raf) }}</td>
            <td class="r num" :class="{ neg: cmp.totals.remaining < 0 }">{{ fmtDays(cmp.totals.remaining) }}</td>
            <template v-if="showMoney">
              <td class="r num">{{ money(cmp.totals.soldAmount) }}</td>
              <td class="r num">{{ moneyZ(cmp.totals.doneAmount) }}</td>
              <td class="r num">{{ moneyZ(cmp.totals.plannedAmount) }}</td>
              <td class="r num">{{ money(cmp.totals.rafAmount) }}</td>
              <td class="r num" :class="{ neg: cmp.totals.gapAmount < 0 }">{{ money(cmp.totals.gapAmount) }}</td>
            </template>
            <template v-if="hasCost">
              <td class="r num">{{ moneyZ(cmp.totals.cost) }}</td>
              <td class="r num" :class="{ neg: cmp.totals.soldAmount - cmp.totals.cost < 0 }">{{ money(cmp.totals.soldAmount - cmp.totals.cost) }}</td>
            </template>
            <td :colspan="editable ? 3 : 2"></td>
          </tr>
          <tr v-for="(msg, k) in issues({ offer, cmp, linked })" :key="'w' + k" class="issue">
            <td class="first" :colspan="cols">⚠ {{ msg }}</td>
          </tr>
          <template v-for="p in cmp.phases" :key="offer.id + p.name">
            <tr class="phase">
              <th class="first" colspan="3">{{ p.name || 'Prestations' }}</th>
              <td class="r num">{{ days(p.sold) }}</td>
              <td class="r num">{{ days(p.done) }}</td>
              <td class="r num">{{ days(p.planned) }}</td>
              <td class="r num">{{ days(p.raf) }}</td>
              <td class="r num" :class="{ neg: p.remaining < 0 }">{{ fmtDays(p.remaining) }}</td>
              <template v-if="showMoney">
                <td class="r num">{{ money(p.soldAmount) }}</td>
                <td class="r num">{{ moneyZ(p.doneAmount) }}</td>
                <td class="r num">{{ moneyZ(p.plannedAmount) }}</td>
                <td class="r num">{{ money(p.rafAmount) }}</td>
                <td class="r num" :class="{ neg: p.gapAmount < 0 }">{{ money(p.gapAmount) }}</td>
              </template>
              <template v-if="hasCost">
                <td class="r num">{{ moneyZ(p.cost) }}</td>
                <td class="r num">{{ money(p.soldAmount - p.cost) }}</td>
              </template>
              <td :colspan="editable ? 3 : 2"></td>
            </tr>
            <tr v-for="l in p.lines" :key="l.id">
              <td class="first label">
                {{ l.label }}
                <span v-if="l.forfait" class="forfait-tag" :title="`Forfait de ${money(l.forfait.amount)} décliné en ${l.qty} jours/homme`">
                  forfait {{ money(l.forfait.amount) }}
                  <button v-if="editable" class="undo" title="Annuler la déclinaison : revenir au forfait" @click="revertToForfait(offer.id, l.id)">↩</button>
                </span>
                <span v-if="l.resources" class="muted sub">{{ l.resources }}</span>
              </td>
              <td>{{ l.profile }}</td>
              <td class="r num">
                <input
                  v-if="editable"
                  class="input qty tjm"
                  type="number"
                  min="0"
                  step="10"
                  :value="l.unitPrice ?? ''"
                  :aria-label="`TJM : ${l.label}`"
                  title="TJM repris de l'offre ; modifiable (avenant…)"
                  @change="setTjm(offer, l, $event)"
                />
                <template v-else>{{ l.unitPrice == null ? '—' : money(l.unitPrice) }}</template>
              </td>
              <td class="r">
                <input v-if="editable" class="input qty" type="number" min="0" step="0.5" :value="l.qty" :aria-label="`Jours vendus : ${l.label}`" @change="setQty(offer, l, $event)" />
                <span v-else class="num">{{ days(l.sold) }}</span>
              </td>
              <td class="r num">{{ days(l.done) }}</td>
              <td class="r num">{{ days(l.planned) }}</td>
              <td class="r num" :class="{ neg: l.raf < 0 }">{{ fmtDays(l.raf) }}</td>
              <td class="r num" :class="{ neg: l.remaining < 0 }">{{ fmtDays(l.remaining) }}</td>
              <template v-if="showMoney">
                <td class="r num">{{ money(l.soldAmount) }}</td>
                <td class="r num">{{ l.done ? money(l.doneAmount) : '—' }}</td>
                <td class="r num">{{ l.planned ? money(l.plannedAmount) : '—' }}</td>
                <td class="r num" :class="{ neg: l.rafAmount < 0 }">{{ money(l.rafAmount) }}</td>
                <td class="r num" :class="{ neg: l.gapAmount < 0 }">{{ money(l.gapAmount) }}</td>
              </template>
              <template v-if="hasCost">
                <td class="r num">{{ l.cost ? money(l.cost) : '—' }}</td>
                <td class="r num" :class="{ neg: l.margin < 0 }">{{ money(l.margin) }}</td>
              </template>
              <td class="meter-col">
                <div class="track" :title="`${fmtDays(l.done)} réalisés + ${fmtDays(l.planned)} à venir pour ${fmtDays(l.sold)} vendus`">
                  <span class="m-done" :style="{ width: meter(l).done + '%' }" />
                  <span class="m-planned" :style="{ width: meter(l).planned + '%' }" />
                  <span class="m-sold" :style="{ left: meter(l).sold + '%' }" />
                </div>
              </td>
              <td v-if="editable" class="tasks">
                <MultiSelect
                  :model-value="l.tasks"
                  :options="[...new Set([...taskOptions, ...l.tasks])]"
                  empty-label="Aucune tâche"
                  @update:model-value="v => setLineTasks(offer.id, l.id, v)"
                />
              </td>
              <td>
                <span class="pill"><span class="badge" :style="{ background: BUDGET_STATES[l.state].color }" aria-hidden="true">{{ BUDGET_STATES[l.state].icon }}</span>{{ stateLabel(l) }}</span>
              </td>
            </tr>
          </template>
          <template v-if="cmp.unassigned.length">
            <tr class="phase sub-phase">
              <th class="first" :colspan="cols">Planifié hors offre (tâches non rattachées à une ligne)</th>
            </tr>
            <tr v-for="u in cmp.unassigned" :key="offer.id + u.task" class="unassigned">
              <td class="first label">{{ u.task }}<span v-if="u.resources" class="muted sub">{{ u.resources }}</span></td>
              <td colspan="3" class="muted">{{ editable ? 'à rattacher via « Tâches du planning »' : 'non vendu dans l\'offre' }}</td>
              <td class="r num">{{ days(u.done) }}</td>
              <td class="r num">{{ days(u.planned) }}</td>
              <td :colspan="cols - 6"></td>
            </tr>
          </template>
        </tbody>
        <tfoot v-if="items.length">
          <tr>
            <th class="first" colspan="3">Total{{ items.length > 1 ? ` (${items.length} offres)` : '' }}</th>
            <td class="r num">{{ days(grand.sold) }}</td>
            <td class="r num">{{ days(grand.done) }}</td>
            <td class="r num">{{ days(grand.planned) }}</td>
            <td class="r num">{{ days(grand.raf) }}</td>
            <td class="r num" :class="{ neg: grand.remaining < 0 }">{{ fmtDays(grand.remaining) }}</td>
            <template v-if="showMoney">
              <td class="r num">{{ money(grand.soldAmount) }}</td>
              <td class="r num">{{ moneyZ(grand.doneAmount) }}</td>
              <td class="r num">{{ moneyZ(grand.plannedAmount) }}</td>
              <td class="r num">{{ money(grand.rafAmount) }}</td>
              <td class="r num" :class="{ neg: grand.gapAmount < 0 }">{{ money(grand.gapAmount) }}</td>
            </template>
            <template v-if="hasCost">
              <td class="r num">{{ moneyZ(grand.cost) }}</td>
              <td class="r num">{{ money(grand.soldAmount - grand.cost) }}</td>
            </template>
            <td :colspan="editable ? 3 : 2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="muted legend">
      Barre : <i class="k m-done" /> réalisé · <i class="k m-planned" /> à venir · <i class="k k-line" /> jours vendus. Les valeurs négatives (en
      rouge) signalent un dépassement.
    </p>
  </div>
</template>

<style scoped>
.olt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  align-items: center;
  font-size: 12px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
}
.table-wrap {
  overflow: auto;
  max-height: 75vh;
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
  padding: 6px 8px;
  border-bottom: 1px solid var(--grid);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}
thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface);
  font-weight: 500;
  color: var(--muted);
}
thead tr:nth-child(2) th {
  top: 27px;
  border-bottom-color: var(--axis);
}
.groups th {
  font-size: 11px;
  border-bottom: 0;
  padding-bottom: 0;
}
.grp {
  text-align: center;
  border-bottom: 1px solid var(--grid) !important;
}
.first {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
}
thead .first {
  z-index: 3;
}
.label {
  white-space: normal;
  min-width: 240px;
  max-width: 320px;
}
.r {
  text-align: right;
}
.num {
  font-variant-numeric: tabular-nums;
}
.neg {
  color: var(--critical);
  font-weight: 600;
}
.offer-row th,
.offer-row td {
  background: var(--accent-wash);
  font-weight: 600;
  border-top: 2px solid var(--accent);
}
.offer-row .first {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  white-space: normal;
}
.issue td {
  white-space: normal;
  background: color-mix(in srgb, var(--warning) 16%, var(--surface));
  color: var(--ink);
  font-size: 13px;
  position: static;
}
.phase th,
.phase td {
  background: var(--surface-2);
  font-weight: 600;
  font-size: 12px;
}
.sub-phase th {
  font-weight: 500;
  color: var(--ink-2);
}
.unassigned td {
  color: var(--ink-2);
}
tfoot th,
tfoot td {
  position: sticky;
  bottom: 0;
  background: var(--surface-2);
  font-weight: 700;
  border-top: 1px solid var(--axis);
}
.sub {
  display: block;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tjm {
  width: 86px;
}
.qty {
  width: 70px;
  text-align: right;
  height: 30px;
}
.tasks :deep(.trigger) {
  min-width: 180px;
  max-width: 240px;
}
.meter-col {
  width: 130px;
  min-width: 130px;
}
.track {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: var(--surface-2);
  display: flex;
  gap: 2px;
}
.m-done {
  background: var(--series-1);
  border-radius: 5px 0 0 5px;
}
.m-planned {
  background: var(--series-2);
}
.m-sold {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--ink);
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
.forfait-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding: 0 4px 0 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-wash);
  color: var(--accent-ink);
  white-space: nowrap;
}
.undo {
  border: 0;
  background: none;
  cursor: pointer;
  color: inherit;
  padding: 0 4px;
  font-size: 13px;
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
