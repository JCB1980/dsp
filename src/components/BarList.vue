<script setup>
import { computed } from 'vue';

// Barres horizontales : libellé à gauche, valeur au bout de la barre.
// Avec `split`, la barre est découpée en réalisé (plein) + à venir.
// Un clic sur une barre filtre les données sur cette valeur.
const props = defineProps({
  rows: { type: Array, required: true }, // [{ label, value, done?, planned?, other? }]
  clickable: Boolean,
  split: Boolean,
  format: { type: Function, default: v => new Intl.NumberFormat('fr-FR').format(v) },
  empty: { type: String, default: 'Aucune donnée pour ces filtres.' }
});
const emit = defineEmits(['select']);

const total = computed(() => props.rows.reduce((s, r) => s + r.value, 0));
// « Autres » regroupe la traîne : affiché en texte, il n'entre pas dans l'échelle.
const bars = computed(() => props.rows.filter(r => !r.other));
const other = computed(() => props.rows.find(r => r.other));
const max = computed(() => Math.max(1e-9, ...bars.value.map(r => r.value)));
const pct = v => (total.value ? Math.round((v / total.value) * 100) : 0);
const hasPlanned = computed(() => props.split && bars.value.some(r => r.planned > 0));

function title(r) {
  let t = `${r.label} : ${props.format(r.value)} (${pct(r.value)} %)`;
  if (hasPlanned.value) t += ` — réalisé ${props.format(r.done)}, à venir ${props.format(r.planned)}`;
  if (props.clickable) t += ' — cliquer pour filtrer';
  return t;
}
const width = v => `calc((100% - 64px) * ${v / max.value})`;
</script>

<template>
  <p v-if="!rows.length || !total" class="muted empty">{{ empty }}</p>
  <template v-else>
    <div v-if="hasPlanned" class="legend">
      <span><i class="sw done" />Réalisé</span>
      <span><i class="sw planned" />À venir</span>
    </div>
    <ul class="bars" role="list">
      <li v-for="r in bars" :key="r.label">
        <component :is="clickable ? 'button' : 'div'" class="row" :class="{ link: clickable }" :title="title(r)" @click="clickable && emit('select', r.label)">
          <span class="label">{{ r.label }}</span>
          <span class="track">
            <template v-if="hasPlanned">
              <span v-if="r.done > 0" class="bar done" :class="{ end: !(r.planned > 0) }" :style="{ width: width(r.done), minWidth: '2px' }" />
              <span v-if="r.planned > 0" class="bar planned end" :style="{ width: width(r.planned), minWidth: '2px' }" />
            </template>
            <span v-else class="bar done end" :style="{ width: width(r.value), minWidth: r.value ? '3px' : 0 }" />
            <span class="value num">{{ format(r.value) }}</span>
          </span>
        </component>
      </li>
      <li v-if="other" class="other-row muted">+ {{ format(other.value) }} pour les autres valeurs ({{ pct(other.value) }} %)</li>
    </ul>
  </template>
</template>

<style scoped>
.legend {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--ink-2);
  margin: -4px 0 6px;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: grid;
  grid-template-columns: minmax(90px, 38%) 1fr;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 3px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  text-align: left;
  font-size: 13px;
}
.row.link {
  cursor: pointer;
}
.row.link:hover,
.row.link:focus-visible {
  background: var(--hover);
  outline: none;
}
.row.link:hover .bar,
.row.link:focus-visible .bar {
  filter: brightness(1.12);
}
.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-2);
}
.track {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.bar {
  height: 14px;
  flex: none;
}
.bar.end {
  border-radius: 0 4px 4px 0;
}
.done,
.sw.done {
  background: var(--series-1);
}
.planned,
.sw.planned {
  background: var(--series-2);
}
.value {
  font-size: 12px;
  color: var(--ink-2);
  margin-left: 6px;
  white-space: nowrap;
}
.other-row {
  font-size: 12px;
  padding: 6px 4px 0;
}
.empty {
  margin: 8px 0;
  font-size: 13px;
}
</style>
