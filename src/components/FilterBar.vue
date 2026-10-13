<script setup>
import { computed } from 'vue';
import { state, options, availableDimensions, resetFilters, range, refDate } from '../lib/store.js';
import { PERIODS, isFilterActive } from '../lib/stats.js';
import { toInputDate, fromInputDate, formatDate } from '../lib/dates.js';
import MultiSelect from './MultiSelect.vue';

// Une seule rangée de filtres, au-dessus de tout ce qu'elle filtre : toutes
// les vues (tableau de bord, analyse croisée, détail) utilisent les mêmes.
const from = computed({
  get: () => toInputDate(state.filters.from ?? range.value?.from),
  set: v => (state.filters.from = fromInputDate(v))
});
const to = computed({
  get: () => toInputDate(state.filters.to ?? range.value?.to),
  set: v => (state.filters.to = fromInputDate(v, true))
});
const refInput = computed({
  get: () => toInputDate(refDate.value),
  set: v => (state.refDate = v ? fromInputDate(v, true) : null)
});
const active = computed(
  () => availableDimensions.value.some(d => isFilterActive(state.filters[d.field])) || state.filters.period !== 'all'
);
</script>

<template>
  <div class="filters">
    <label class="field">
      <span>Période</span>
      <select v-model="state.filters.period" class="input period">
        <option v-for="p in PERIODS" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </label>
    <template v-if="state.filters.period === 'custom'">
      <label class="field"><span>Du</span><input v-model="from" type="date" class="input" /></label>
      <label class="field"><span>Au</span><input v-model="to" type="date" class="input" /></label>
    </template>
    <div v-for="d in availableDimensions" :key="d.field" class="field">
      <span :id="`lbl-${d.field}`">{{ d.label }}</span>
      <MultiSelect v-model="state.filters[d.field]" :options="options[d.field]" :labelled-by="`lbl-${d.field}`" />
    </div>
    <label class="field" title="Les jours jusqu'à cette date (incluse) sont comptés comme réalisés, les suivants comme à venir.">
      <span>Date de référence</span>
      <input v-model="refInput" type="date" class="input" />
    </label>
    <div class="end">
      <button v-if="active" class="btn ghost" @click="resetFilters">Réinitialiser</button>
      <span v-if="range" class="muted asof">Données du {{ formatDate(range.from) }} au {{ formatDate(range.to) }}</span>
    </div>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 12px;
}
.period {
  min-width: 200px;
}
input.input {
  height: 34px;
}
.end {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.asof {
  font-size: 12px;
}
@media (max-width: 640px) {
  .field {
    flex: 1 1 140px;
  }
  .field .input {
    width: 100%;
  }
}
</style>
