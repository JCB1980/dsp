<script setup>
import { onMounted, ref } from 'vue';
import { state, init, allEntries, clearAll } from './lib/store.js';
import { formatDate, formatDateTime } from './lib/dates.js';
import FilterBar from './components/FilterBar.vue';
import DashboardView from './components/DashboardView.vue';
import PivotView from './components/PivotView.vue';
import BudgetView from './components/BudgetView.vue';
import LinesView from './components/LinesView.vue';
import OffersView from './components/OffersView.vue';
import ImportPanel from './components/ImportPanel.vue';

// Numéro de version affiché dans l'en-tête, pour vérifier quel fichier est ouvert.
const VERSION = 'v1.5 · 13/10/2026';
const importer = ref(null);
const nf = new Intl.NumberFormat('fr-FR');
const VIEWS = [
  ['dashboard', 'Tableau de bord'],
  ['pivot', 'Analyse croisée'],
  ['budgets', 'Suivi des budgets'],
  ['offers', 'Offres & jours vendus'],
  ['lines', 'Détail']
];

// Thème : suit le système, ou le choix mémorisé de l'utilisateur.
const theme = ref(null);
function applyTheme(t) {
  theme.value = t;
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try {
    if (t) localStorage.setItem('theme', t);
    else localStorage.removeItem('theme');
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}
function toggleTheme() {
  const dark = theme.value ? theme.value === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(dark ? 'light' : 'dark');
}

async function wipe() {
  if (confirm('Effacer les données importées de ce navigateur ? (Les budgets saisis sont conservés.)')) await clearAll();
}

onMounted(() => {
  let saved = null;
  try {
    saved = localStorage.getItem('theme');
  } catch {
    /* ignoré */
  }
  applyTheme(saved);
  init();
});
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h7" stroke-linecap="round" />
      </svg>
      <h1>Suivi des jours projets</h1>
      <span class="version" title="Version de l'application">{{ VERSION }}</span>
    </div>
    <nav v-if="state.ready" class="tabs">
      <button v-for="[k, l] in VIEWS" :key="k" :class="{ on: state.view === k }" @click="state.view = k">{{ l }}</button>
    </nav>
    <div class="right">
      <span v-if="state.meta" class="muted meta" :title="`Importé le ${formatDateTime(state.meta.importedAt)} · ${state.meta.history?.length || 1} fichier(s)`">
        {{ state.meta.fileName }} · {{ nf.format(allEntries.length) }} affectations
      </span>
      <button v-if="allEntries.length" class="btn" @click="importer.open()">Importer…</button>
      <button v-if="allEntries.length" class="btn ghost danger" title="Effacer les données importées" @click="wipe">Effacer</button>
      <button class="btn ghost" aria-label="Changer de thème" title="Thème clair / sombre" @click="toggleTheme">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </header>

  <main>
    <p v-if="!state.storageOk" class="banner warn">
      ⚠ Le stockage local du navigateur est indisponible : les données ne seront pas conservées à la fermeture de la page.
    </p>
    <p v-if="state.error" class="banner error" role="alert">
      ✕ Import impossible : {{ state.error }}
      <button class="btn ghost" @click="state.error = ''">Fermer</button>
    </p>
    <p v-if="state.notice" class="banner info" role="status">
      ✓ {{ state.notice }}
      <span v-if="state.meta" class="muted">Période disponible : du {{ formatDate(state.meta.from) }} au {{ formatDate(state.meta.to) }}.</span>
      <button class="btn ghost" @click="state.notice = ''">Fermer</button>
    </p>

    <section v-if="state.ready && !allEntries.length && !state.importing && state.view !== 'offers'" class="welcome">
      <h2>Bienvenue</h2>
      <p class="muted">
        Importez l'export Excel de PlanningPME pour suivre la consommation des jours par consultant, client, projet et commande. Joignez
        ensuite les offres financières (Word) pour comparer les jours planifiés aux jours vendus.
      </p>
    </section>

    <ImportPanel ref="importer" :compact="allEntries.length > 0 || state.view === 'offers'" />

    <OffersView v-if="state.view === 'offers' && !state.importing" />
    <template v-else-if="allEntries.length && !state.importing">
      <FilterBar v-if="state.view !== 'budgets'" />
      <DashboardView v-if="state.view === 'dashboard'" />
      <PivotView v-else-if="state.view === 'pivot'" />
      <BudgetView v-else-if="state.view === 'budgets'" />
      <LinesView v-else />
    </template>
  </main>
</template>

<style scoped>
.top {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 10px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--accent);
}
.version {
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}
.brand h1 {
  font-size: 17px;
  color: var(--ink);
}
.tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.tabs button {
  border: 0;
  background: none;
  padding: 7px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--ink-2);
}
.tabs button:hover {
  background: var(--hover);
}
.tabs button.on {
  background: var(--accent-wash);
  color: var(--accent-ink);
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.meta {
  font-size: 12px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
main {
  padding: 18px 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1600px;
  margin: 0 auto;
}
@media (max-width: 640px) {
  .top,
  main {
    padding-left: 16px;
    padding-right: 16px;
  }
  .top {
    position: static;
  }
  .meta {
    display: none;
  }
}
.banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  border: 1px solid var(--border);
}
.banner.warn {
  border-color: var(--warning);
}
.banner.error {
  border-color: var(--critical);
}
.banner.info {
  border-color: var(--good);
}
.welcome {
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}
.welcome h2 {
  font-size: 20px;
  margin-bottom: 6px;
}
</style>
