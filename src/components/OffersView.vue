<script setup>
import { computed, ref, watch } from 'vue';
import {
  state,
  options,
  availableDimensions,
  refDate,
  allEntries,
  addOffer,
  deleteOffer,
  offerEntries,
  offerFile,
  setOfferLink,
  setLineTasks,
  updateOffer,
  convertToDays,
  revertToForfait,
  exportBackup,
  importBackup
} from '../lib/store.js';
import { offerComparison, BUDGET_LEVELS, BUDGET_STATES, fmtDays } from '../lib/stats.js';
import { offerTotals } from '../lib/offer.js';
import { formatDate } from '../lib/dates.js';
import { download, stamp, toCsv, csvNumber } from '../lib/exportCsv.js';
import MultiSelect from './MultiSelect.vue';
import StatTile from './StatTile.vue';

// Offres financières : l'utilisateur joint l'offre (.docx), elle est
// enregistrée sur le poste, et ses jours vendus sont comparés au planning.
const fileInput = ref(null);
const backupInput = ref(null);
const over = ref(false);
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

watch(
  () => state.offers.length,
  () => {
    if (!state.offers.some(o => o.id === state.selectedOffer)) state.selectedOffer = state.offers[0]?.id || null;
  },
  { immediate: true }
);
const offer = computed(() => state.offers.find(o => o.id === state.selectedOffer) || null);
const levels = computed(() => BUDGET_LEVELS.filter(l => availableDimensions.value.some(d => d.field === l.field)));

// allEntries est lu pour recalculer quand un nouveau planning est importé.
const linked = computed(() => (allEntries.value, offer.value ? offerEntries(offer.value) : []));
const cmp = computed(() => (offer.value ? offerComparison(offer.value, linked.value, refDate.value) : null));
const taskOptions = computed(() => [...new Set(linked.value.map(e => e.task).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')));
// Déclinaison des forfaits en jours/homme : saisie par élément (jours, profil).
const conv = ref({});
const convInput = i => (conv.value[i] ||= { days: '', profile: '' });
const toNum = v => Number(String(v ?? '').replace(',', '.'));
const tjm = (o, i) => {
  const d = toNum(conv.value[i]?.days);
  return o.amount != null && d > 0 ? o.amount / d : null;
};
const profiles = computed(() => [...new Set((offer.value?.lines || []).map(l => l.profile).filter(p => p && p !== 'Forfait'))]);
async function convert(i) {
  const d = toNum(conv.value[i]?.days);
  if (!(d > 0)) return;
  await convertToDays(offer.value.id, i, d, conv.value[i]?.profile);
  conv.value = {};
}
// Les forfaits d'abord (ce sont eux qu'on décline), puis les abonnements au mois.
const otherItems = computed(() =>
  (offer.value?.other || []).map((o, i) => ({ ...o, i, isForfait: /forfait/i.test(o.unit) })).sort((a, b) => b.isForfait - a.isForfait)
);

function pick(files) {
  const f = files?.[0];
  if (f) addOffer(f);
}
function onDrop(e) {
  over.value = false;
  pick(e.dataTransfer?.files);
}
async function downloadFile(o) {
  const buf = await offerFile(o.id);
  if (!buf) return alert("Le fichier d'origine n'est plus disponible sur ce poste.");
  download(buf, o.fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
async function remove(o) {
  if (confirm(`Supprimer l'offre « ${o.name} » et son fichier de ce poste ?`)) await deleteOffer(o.id);
}
function setQty(line, ev) {
  const v = Number(String(ev.target.value).replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return;
  updateOffer(offer.value.id, o => {
    const l = o.lines.find(x => x.id === line.id);
    l.qty = v;
    if (l.unitPrice != null) l.amount = v * l.unitPrice;
  });
}

// Barre : réalisé + à venir sur l'échelle des jours vendus.
function meter(l) {
  const scale = Math.max(l.sold, l.total) || 1;
  return { done: (l.done / scale) * 100, planned: (l.planned / scale) * 100, sold: (l.sold / scale) * 100 };
}

function exportCsv() {
  const header = ['Phase', 'Prestation', 'Profil', 'P.U. (€ HT)', 'Jours vendus', 'Réalisé (j)', 'À venir (j)', 'Reste (j)', 'Montant vendu (€ HT)', 'Réalisé valorisé (€ HT)', 'Tâches du planning', 'Consultants', 'État'];
  const rows = cmp.value.lines.map(l => [
    l.phase,
    l.label,
    l.profile,
    csvNumber(l.unitPrice),
    csvNumber(l.sold),
    csvNumber(l.done),
    csvNumber(l.planned),
    csvNumber(l.remaining),
    csvNumber(l.soldAmount),
    csvNumber(l.doneAmount),
    l.tasks.join(', '),
    l.resources,
    BUDGET_STATES[l.state].label
  ]);
  for (const u of cmp.value.unassigned) rows.push(['(non rattaché à l\'offre)', u.task, '', '', '', csvNumber(u.done), csvNumber(u.planned), '', '', '', u.task, u.resources, '']);
  download(toCsv(header, rows), `offre-${(offer.value.info.clientShort || 'client').toLowerCase()}-${stamp()}.csv`);
}

const backupMsg = ref('');
async function saveBackup() {
  download(await exportBackup(), `sauvegarde-offres-budgets-${stamp()}.json`, 'application/json');
}
async function restoreBackup(ev) {
  const f = ev.target.files?.[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const n = await importBackup(await f.text());
    backupMsg.value = `Sauvegarde restaurée : ${n} offre(s) et les budgets.`;
  } catch (e) {
    backupMsg.value = `Restauration impossible : ${e.message}`;
  }
}
</script>

<template>
  <div class="offers">
    <section class="card bar-top" :class="{ over }" @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="onDrop">
      <div class="list" role="tablist" aria-label="Offres enregistrées">
        <button
          v-for="o in state.offers"
          :key="o.id"
          role="tab"
          class="chip"
          :class="{ on: o.id === state.selectedOffer }"
          :aria-selected="o.id === state.selectedOffer"
          :title="o.fileName"
          @click="state.selectedOffer = o.id"
        >
          <strong>{{ o.info.clientShort || o.link.values[0] || 'Offre' }}</strong>
          <span class="muted">{{ fmtDays(offerTotals(o).days) }} vendus</span>
        </button>
        <span v-if="!state.offers.length" class="muted">Aucune offre enregistrée.</span>
      </div>
      <div class="actions">
        <button class="btn primary" @click="fileInput.click()">+ Joindre une offre (.docx)</button>
        <button class="btn ghost" title="Télécharger une sauvegarde des offres (avec leurs fichiers) et des budgets" @click="saveBackup">Sauvegarder</button>
        <button class="btn ghost" title="Restaurer une sauvegarde" @click="backupInput.click()">Restaurer…</button>
        <input ref="fileInput" type="file" accept=".docx" class="sr-only" tabindex="-1" @change="pick($event.target.files); $event.target.value = ''" />
        <input ref="backupInput" type="file" accept=".json" class="sr-only" tabindex="-1" @change="restoreBackup" />
      </div>
      <p v-if="backupMsg" class="muted msg">{{ backupMsg }}</p>
      <p v-if="!state.offers.length" class="muted hint">
        Joignez l'offre financière (Word) d'un projet, ou glissez-la ici : les jours vendus sont lus dans le tableau récapitulatif (Qté, Profil,
        P.U.) et comparés aux jours planifiés. L'offre et son fichier sont conservés sur ce poste.
      </p>
    </section>

    <template v-if="offer && cmp">
      <section class="card head">
        <div class="title">
          <span class="muted small">{{ offer.info.client || 'Client non détecté' }}<template v-if="offer.info.date"> · offre du {{ formatDate(offer.info.date) }}</template></span>
          <h2>{{ offer.info.title || offer.name }}</h2>
          <span class="muted small">{{ offer.fileName }} · jointe le {{ formatDate(offer.importedAt) }}</span>
        </div>
        <div class="head-actions">
          <button class="btn" @click="downloadFile(offer)">Ouvrir l'offre</button>
          <button class="btn" @click="exportCsv">Exporter CSV</button>
          <button class="btn ghost danger" @click="remove(offer)">Supprimer</button>
        </div>
        <div class="link">
          <label class="field">
            <span>Rattachée au planning par</span>
            <select class="input" :value="offer.link.level" @change="setOfferLink(offer.id, $event.target.value, [])">
              <option v-for="l in levels" :key="l.field" :value="l.field">{{ l.label }}</option>
            </select>
          </label>
          <div class="field">
            <span id="lbl-offer-link">{{ levels.find(l => l.field === offer.link.level)?.label || 'Valeur' }}</span>
            <MultiSelect
              :model-value="offer.link.values"
              :options="options[offer.link.level] || []"
              labelled-by="lbl-offer-link"
              empty-label="Aucun"
              @update:model-value="v => setOfferLink(offer.id, offer.link.level, v)"
            />
          </div>
          <p v-if="!offer.link.values.length" class="warn-text">⚠ Choisissez le client (ou le projet / la commande) du planning qui correspond à cette offre.</p>
          <p v-else class="muted small">{{ linked.length }} affectations du planning rattachées · réalisé au {{ formatDate(refDate) }}</p>
        </div>
      </section>

      <div class="tiles">
        <StatTile hero label="Jours vendus" :value="fmtDays(cmp.totals.sold)" :note="`${eur.format(cmp.totals.soldAmount)} HT de prestations`" />
        <StatTile label="Jours réalisés" :value="fmtDays(cmp.totals.done)" :note="cmp.totals.sold ? `${pf.format(cmp.totals.done / cmp.totals.sold)} des jours vendus` : ''" />
        <StatTile label="Jours planifiés à venir" :value="fmtDays(cmp.totals.planned)" note="après la date de référence" />
        <StatTile
          label="Reste à planifier"
          :value="fmtDays(cmp.totals.sold - cmp.totals.done - cmp.totals.planned)"
          :note="cmp.totals.sold - cmp.totals.done - cmp.totals.planned < 0 ? 'planifié au-delà du vendu' : 'vendus – (réalisé + à venir)'"
        />
        <StatTile label="Réalisé valorisé" :value="eur.format(cmp.totals.doneAmount)" note="jours réalisés × prix unitaire de la ligne" />
        <StatTile label="Hors offre" :value="fmtDays(cmp.totals.unassigned)" note="tâches planifiées non rattachées" />
      </div>

      <section class="card table-card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Prestation</th>
                <th>Profil</th>
                <th class="r">P.U.</th>
                <th class="r">Vendus</th>
                <th class="r">Réalisé</th>
                <th class="r">À venir</th>
                <th class="r">Reste</th>
                <th class="meter-col">Consommation</th>
                <th>Tâches du planning</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody v-for="p in cmp.phases" :key="p.name">
              <tr class="phase">
                <th colspan="3">{{ p.name || 'Prestations' }}</th>
                <td class="r num">{{ fmtDays(p.sold) }}</td>
                <td class="r num">{{ fmtDays(p.done) }}</td>
                <td class="r num">{{ fmtDays(p.planned) }}</td>
                <td colspan="4"></td>
              </tr>
              <tr v-for="l in p.lines" :key="l.id">
                <td class="label">
                  {{ l.label }}
                  <span v-if="l.forfait" class="forfait-tag" :title="`Forfait de ${eur.format(l.forfait.amount)} décliné en ${l.qty} jours/homme`">
                    forfait {{ l.forfait.amount == null ? '' : eur.format(l.forfait.amount) }}
                    <button class="undo" title="Annuler la déclinaison : revenir au forfait" @click="revertToForfait(offer.id, l.id)">↩</button>
                  </span>
                  <span v-if="l.resources" class="muted sub">{{ l.resources }}</span>
                </td>
                <td>{{ l.profile }}</td>
                <td class="r num">{{ l.unitPrice == null ? '—' : eur.format(l.unitPrice) }}</td>
                <td class="r">
                  <input class="input qty" type="number" min="0" step="0.5" :value="l.qty" :aria-label="`Jours vendus : ${l.label}`" @change="setQty(l, $event)" />
                </td>
                <td class="r num">{{ fmtDays(l.done) }}</td>
                <td class="r num">{{ l.planned ? fmtDays(l.planned) : '—' }}</td>
                <td class="r num" :class="{ neg: l.remaining < 0 }">{{ fmtDays(l.remaining) }}</td>
                <td class="meter-col">
                  <div class="track" :title="`${fmtDays(l.done)} réalisés + ${fmtDays(l.planned)} à venir pour ${fmtDays(l.sold)} vendus`">
                    <span class="m-done" :style="{ width: meter(l).done + '%' }" />
                    <span class="m-planned" :style="{ width: meter(l).planned + '%' }" />
                    <span class="m-sold" :style="{ left: meter(l).sold + '%' }" />
                  </div>
                </td>
                <td class="tasks">
                  <MultiSelect
                    :model-value="l.tasks"
                    :options="[...new Set([...taskOptions, ...l.tasks])]"
                    :labelled-by="''"
                    empty-label="Aucune tâche"
                    @update:model-value="v => setLineTasks(offer.id, l.id, v)"
                  />
                </td>
                <td>
                  <span class="pill"><span class="badge" :style="{ background: BUDGET_STATES[l.state].color }" aria-hidden="true">{{ BUDGET_STATES[l.state].icon }}</span>{{ l.state === 'none' ? 'Aucune tâche' : BUDGET_STATES[l.state].label }}</span>
                </td>
              </tr>
            </tbody>
            <tbody v-if="cmp.unassigned.length">
              <tr class="phase">
                <th colspan="10">Tâches du planning non rattachées à une ligne de l'offre</th>
              </tr>
              <tr v-for="u in cmp.unassigned" :key="u.task" class="unassigned">
                <td class="label">{{ u.task }}<span v-if="u.resources" class="muted sub">{{ u.resources }}</span></td>
                <td colspan="3" class="muted">à rattacher via la colonne « Tâches du planning »</td>
                <td class="r num">{{ fmtDays(u.done) }}</td>
                <td class="r num">{{ u.planned ? fmtDays(u.planned) : '—' }}</td>
                <td colspan="4"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted legend">
          Barre : <i class="k m-done" /> réalisé · <i class="k m-planned" /> à venir · <i class="k k-line" /> jours vendus. Les tâches sont
          rattachées automatiquement quand leur libellé correspond à celui de la prestation ; ajustez au besoin.
        </p>
      </section>

      <section v-if="otherItems.length" class="card other">
        <h3>Prestations au forfait et éléments hors jours</h3>
        <p class="muted small">
          Ces éléments ne sont pas vendus en jours. Pour suivre un forfait dans le planning, déclinez-le en <strong>jours/homme</strong> : il
          rejoint le tableau ci-dessus, au TJM implicite (montant ÷ jours). La déclinaison peut être annulée (↩).
        </p>
        <div class="table-wrap">
          <table class="other-table">
            <thead>
              <tr>
                <th>Élément</th>
                <th class="r">Quantité</th>
                <th class="r">Montant HT</th>
                <th class="r">Jours/homme</th>
                <th>Profil</th>
                <th class="r">TJM implicite</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in otherItems" :key="o.i" :class="{ dimmed: !o.isForfait }">
                <td class="label">{{ o.label }}<span class="muted sub">{{ o.phase }}</span></td>
                <td class="r num">{{ o.qty }} {{ o.unit }}</td>
                <td class="r num">{{ o.amount == null ? '—' : eur.format(o.amount) }}</td>
                <td class="r">
                  <input
                    v-model="convInput(o.i).days"
                    class="input qty"
                    type="number"
                    min="0.5"
                    step="0.5"
                    placeholder="j/h"
                    :aria-label="`Jours/homme pour ${o.label}`"
                    @keydown.enter="convert(o.i)"
                  />
                </td>
                <td>
                  <input v-model="convInput(o.i).profile" class="input profile" list="offer-profiles" placeholder="ex. CF" :aria-label="`Profil pour ${o.label}`" />
                </td>
                <td class="r num">{{ tjm(o, o.i) == null ? '—' : eur.format(tjm(o, o.i)) }}</td>
                <td class="r">
                  <button class="btn" :disabled="!(toNum(conv[o.i]?.days) > 0)" @click="convert(o.i)">Décliner en jours</button>
                </td>
              </tr>
            </tbody>
          </table>
          <datalist id="offer-profiles">
            <option v-for="p in profiles" :key="p" :value="p" />
          </datalist>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.offers {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bar-top {
  padding: 12px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.bar-top.over {
  border-color: var(--accent);
  background: var(--accent-wash);
}
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
  align-items: center;
}
.chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
}
.chip span {
  font-size: 11px;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent-wash);
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.hint,
.msg {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
}
.head {
  padding: 16px 18px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px 16px;
}
.title h2 {
  font-size: 18px;
  margin: 2px 0;
}
.small {
  font-size: 12px;
}
.head-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.link {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 14px;
  padding-top: 10px;
  border-top: 1px solid var(--grid);
}
.link p {
  margin: 0;
}
.warn-text {
  font-size: 13px;
  color: var(--ink);
}
@media (max-width: 640px) {
  .head {
    grid-template-columns: 1fr;
  }
}
.tiles {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) repeat(5, minmax(150px, 1fr));
  gap: 12px;
}
@media (max-width: 1200px) {
  .tiles {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 640px) {
  .tiles {
    grid-template-columns: 1fr 1fr;
  }
  .tiles > :first-child {
    grid-column: 1 / -1;
  }
}
.table-card {
  padding: 10px 14px 14px;
  min-width: 0;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 1100px;
}
th,
td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--grid);
  text-align: left;
  vertical-align: middle;
}
thead th {
  font-weight: 500;
  color: var(--muted);
  border-bottom-color: var(--axis);
}
tr.phase th,
tr.phase td {
  background: var(--surface-2);
  font-weight: 600;
  font-size: 12px;
  text-transform: none;
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
.label {
  max-width: 300px;
}
.sub {
  display: block;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qty {
  width: 72px;
  text-align: right;
  height: 30px;
}
.tasks {
  min-width: 200px;
}
.tasks :deep(.trigger) {
  min-width: 180px;
  max-width: 240px;
}
.meter-col {
  width: 150px;
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
.unassigned td {
  color: var(--ink-2);
}
.legend {
  font-size: 12px;
  margin: 10px 0 0;
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
.other {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.other h3 {
  font-size: 15px;
}
.other p {
  margin: 0;
}
.other-table {
  min-width: 820px;
}
.dimmed td {
  color: var(--ink-2);
}
.profile {
  width: 90px;
  height: 30px;
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
</style>
