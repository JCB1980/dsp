<script setup>
import { computed } from 'vue';
import { dashboard, filterOn, availableDimensions, refDate, offerTracking, state } from '../lib/store.js';
import { fmtDays, fmtHours, topWithOther, NONE } from '../lib/stats.js';
import { formatDate } from '../lib/dates.js';
import StatTile from './StatTile.vue';
import ChartCard from './ChartCard.vue';
import BarList from './BarList.vue';
import StackedColumns from './StackedColumns.vue';
import OfferLinesTable from './OfferLinesTable.vue';
import { offerLinesCsv } from '../lib/offerExport.js';
import { download, stamp } from '../lib/exportCsv.js';

const d = computed(() => dashboard.value);
const nf = new Intl.NumberFormat('fr-FR');
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const has = field => availableDimensions.value.some(x => x.field === field);

const cols = [
  { key: 'label', label: 'Valeur' },
  { key: 'done', label: 'Réalisé', numeric: true, format: fmtDays },
  { key: 'planned', label: 'À venir', numeric: true, format: fmtDays },
  { key: 'value', label: 'Total', numeric: true, format: fmtDays }
];
const timeCols = [
  { key: 'label', label: 'Période' },
  { key: 'done', label: 'Réalisé', numeric: true, format: fmtDays },
  { key: 'planned', label: 'À venir', numeric: true, format: fmtDays }
];

// Les ressources « À planifier » ne sont pas des consultants : elles sont
// comptées à part (indicateur dédié) et exclues du graphique par consultant.
const byConsultant = computed(() => d.value.byResource.filter(r => !d.value.scoped.some(e => e.unplanned && e.resource === r.label)));

const cards = computed(() =>
  [
    { field: 'resource', title: 'Jours par consultant', rows: byConsultant.value, limit: 15 },
    { field: 'client', title: 'Jours par client', rows: d.value.byClient, limit: 12 },
    { field: 'project', title: 'Jours par projet', rows: d.value.byProject, limit: 12 },
    { field: 'order', title: 'Jours par commande', rows: d.value.byOrder, limit: 12 },
    { field: 'task', title: 'Jours par tâche', rows: d.value.byTask, limit: 12 },
    { field: 'departments', title: 'Jours par département', rows: d.value.byDepartment, limit: 10, note: 'Une ressource rattachée à plusieurs départements est comptée dans chacun.' }
  ].filter(c => has(c.field))
);
// Suivi par ligne d'offre (offres jointes dans l'onglet « Offres & jours vendus »).
const tracking = computed(() => offerTracking.value);
const offerKpis = computed(() => {
  const t = { sold: 0, done: 0, planned: 0, raf: 0, soldAmount: 0, rafAmount: 0 };
  for (const { cmp } of tracking.value) {
    t.sold += cmp.totals.sold;
    t.done += cmp.totals.linesDone;
    t.planned += cmp.totals.linesPlanned;
    t.raf += cmp.totals.raf;
    t.soldAmount += cmp.totals.soldAmount;
    t.rafAmount += cmp.totals.rafAmount;
  }
  return t;
});
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
function exportOffers() {
  download(offerLinesCsv(tracking.value), `suivi-lignes-offres-${stamp()}.csv`);
}

const periodLabel = computed(() => {
  const p = d.value.period;
  return Number.isFinite(p.from) ? `du ${formatDate(p.from)} au ${formatDate(p.to)}` : '';
});
</script>

<template>
  <div class="dash">
    <div class="tiles">
      <StatTile hero label="Jours consommés" :value="fmtDays(d.kpis.done)" :note="`réalisés au ${formatDate(refDate)} · ${fmtHours(d.kpis.hours)} au total`" />
      <StatTile label="Jours à venir" :value="fmtDays(d.kpis.planned)" note="planifiés après la date de référence" />
      <StatTile label="Total planifié" :value="fmtDays(d.kpis.total)" :note="periodLabel" />
      <StatTile
        label="Taux d'occupation"
        :value="d.kpis.occupancy == null ? '—' : pf.format(d.kpis.occupancy)"
        :note="d.kpis.capacity ? `${nf.format(d.kpis.consultants)} consultants · capacité ${fmtDays(d.kpis.capacity)} ouvrés` : 'aucun consultant dans la sélection'"
      />
      <StatTile label="Heures sup. / week-end" :value="fmtDays(d.kpis.extra)" note="inclus dans les totaux" />
      <StatTile label="À planifier" :value="fmtDays(d.kpis.unplanned)" note="tâches sans consultant affecté" />
    </div>

    <section v-if="state.offers.length" class="card offers-card">
      <header class="oc-head">
        <div>
          <h3>Suivi par ligne d'offre : jours vendus, planifiés, reste à faire et coûts au TJM de l'offre</h3>
          <p class="muted sub">
            {{ tracking.length }} offre(s) · sur toute la durée de l'affaire (la période ne s'applique pas) · filtres Client / Projet / Commande pris en
            compte · réalisé au {{ formatDate(refDate) }}
          </p>
        </div>
        <div class="oc-actions">
          <button class="btn" :disabled="!tracking.length" @click="exportOffers">Exporter CSV</button>
          <button class="btn ghost" @click="state.view = 'offers'">Gérer les offres</button>
        </div>
      </header>
      <div v-if="tracking.length" class="oc-kpis">
        <div><span class="muted">Jours vendus</span><strong>{{ fmtDays(offerKpis.sold) }}</strong><span class="muted">{{ eur.format(offerKpis.soldAmount) }}</span></div>
        <div><span class="muted">Consommé</span><strong>{{ fmtDays(offerKpis.done) }}</strong><span class="muted">{{ offerKpis.sold ? pf.format(offerKpis.done / offerKpis.sold) : '' }} du vendu</span></div>
        <div><span class="muted">À venir</span><strong>{{ fmtDays(offerKpis.planned) }}</strong></div>
        <div><span class="muted">Reste à faire</span><strong>{{ fmtDays(offerKpis.raf) }}</strong><span class="muted">{{ eur.format(offerKpis.rafAmount) }}</span></div>
        <div>
          <span class="muted">Écart prévisionnel</span>
          <strong :class="{ neg: offerKpis.sold - offerKpis.done - offerKpis.planned < 0 }">{{ fmtDays(offerKpis.sold - offerKpis.done - offerKpis.planned) }}</strong>
          <span class="muted">vendus − planifié</span>
        </div>
      </div>
      <OfferLinesTable v-if="tracking.length" :items="tracking" :show-offers="tracking.length > 1" />
      <p v-else class="muted">Aucune offre ne correspond aux filtres.</p>
    </section>

    <div class="grid">
      <ChartCard wide title="Charge par période" :subtitle="`Jours par ${d.timeline.granularity} · ${periodLabel}`" :rows="d.timeline.points" :columns="timeCols">
        <StackedColumns :points="d.timeline.points" :format="fmtDays" />
      </ChartCard>
      <ChartCard
        v-for="c in cards"
        :key="c.field"
        :title="c.title"
        :subtitle="c.note || 'Cliquer sur une barre pour filtrer'"
        :rows="c.rows"
        :columns="cols"
      >
        <BarList :rows="topWithOther(c.rows, c.limit)" split clickable :format="fmtDays" @select="v => v !== NONE && filterOn(c.field, v)" />
      </ChartCard>
    </div>
    <p class="muted foot">{{ nf.format(d.count) }} affectations correspondent aux filtres.</p>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr));
  gap: 12px;
}
.offers-card {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.oc-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
}
.oc-head h3 {
  font-size: 15px;
}
.oc-head .sub {
  margin: 2px 0 0;
  font-size: 12px;
}
.oc-actions {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.oc-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}
.oc-kpis > div {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 12px;
}
.oc-kpis strong {
  font-size: 20px;
  font-weight: 600;
}
.neg {
  color: var(--critical);
}
.foot {
  font-size: 12px;
  margin: 0;
}
</style>
