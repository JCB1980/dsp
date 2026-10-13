<script setup>
import { ref } from 'vue';
import { state, chooseFile, importFile } from '../lib/store.js';
import { formatDate } from '../lib/dates.js';

defineProps({ compact: Boolean });
const input = ref(null);
const over = ref(false);

function onDrop(e) {
  over.value = false;
  chooseFile(e.dataTransfer?.files?.[0]);
}
defineExpose({ open: () => input.value?.click() });
</script>

<template>
  <input ref="input" type="file" accept=".xlsx" class="sr-only" tabindex="-1" @change="chooseFile($event.target.files[0]); $event.target.value = ''" />

  <div v-if="state.pendingFile" class="overlay">
    <div class="card dialog" role="dialog" aria-label="Mode d'import">
      <h2>Importer « {{ state.pendingFile.name }} »</h2>
      <p class="muted">
        Des données sont déjà chargées (du {{ formatDate(state.meta?.from) }} au {{ formatDate(state.meta?.to) }}). Que voulez-vous faire ?
      </p>
      <button class="btn primary choice" @click="importFile(state.pendingFile, 'merge')">
        <strong>Compléter</strong>
        <span>Ajoute la période du fichier ; les jours déjà importés sur cette même période sont remplacés. Idéal pour cumuler des extractions mensuelles.</span>
      </button>
      <button class="btn choice" @click="importFile(state.pendingFile, 'replace')">
        <strong>Remplacer</strong>
        <span>Efface les données actuelles et ne garde que ce fichier. Les budgets saisis sont conservés.</span>
      </button>
      <button class="btn ghost" @click="state.pendingFile = null">Annuler</button>
    </div>
  </div>

  <div
    v-if="!compact || state.importing"
    class="drop card"
    :class="{ over }"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <template v-if="state.importing">
      <strong>{{ state.importing.step }}</strong>
    </template>
    <template v-else>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <strong>Glissez ici l'export PlanningPME (.xlsx)</strong>
      <span class="muted">« number-hours-by-resource-by-task-by-day », avec l'onglet _All</span>
      <button class="btn primary" @click="input.click()">Choisir un fichier…</button>
      <p class="muted small">Le fichier est lu dans votre navigateur et enregistré sur ce poste uniquement : aucune donnée n'est envoyée sur Internet.</p>
    </template>
  </div>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 24px;
  border: 2px dashed var(--axis);
  text-align: center;
  color: var(--ink-2);
}
.drop.over {
  border-color: var(--accent);
  background: var(--accent-wash);
}
.small {
  font-size: 12px;
  max-width: 440px;
  margin: 6px 0 0;
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.3);
  display: grid;
  place-items: center;
  padding: 16px;
}
.dialog {
  width: min(520px, 100%);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dialog h2 {
  font-size: 17px;
  overflow-wrap: anywhere;
}
.dialog p {
  margin: 0 0 4px;
}
.choice {
  flex-direction: column;
  align-items: flex-start;
  white-space: normal;
  text-align: left;
  gap: 2px;
  padding: 10px 14px;
}
.choice span {
  font-size: 12px;
  opacity: 0.9;
}
</style>
