<script setup>
import { ref } from 'vue';

// Carte de graphique avec bascule « Tableau » : chaque graphique a son
// équivalent tabulaire, accessible sans survol.
const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }, // [{ key, label, format? }]
  wide: Boolean
});
const showTable = ref(false);
const fmt = (c, r) => (c.format ? c.format(r[c.key], r) : r[c.key]);
</script>

<template>
  <section class="card chart-card" :class="{ wide: props.wide }">
    <header>
      <div>
        <h3>{{ title }}</h3>
        <p v-if="subtitle" class="muted sub">{{ subtitle }}</p>
      </div>
      <button v-if="columns.length" class="btn ghost small" :aria-pressed="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Graphique' : 'Tableau' }}
      </button>
    </header>
    <div v-if="showTable" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="{ right: c.numeric }">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td v-for="c in columns" :key="c.key" :class="{ right: c.numeric, num: c.numeric }">{{ fmt(c, r) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <slot v-else />
  </section>
</template>

<style scoped>
.chart-card {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.chart-card.wide {
  grid-column: 1 / -1;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
h3 {
  font-size: 15px;
}
.sub {
  margin: 2px 0 0;
  font-size: 12px;
}
.small {
  padding: 2px 8px;
  font-size: 12px;
  color: var(--ink-2);
}
.table-wrap {
  max-height: 340px;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 5px 8px;
  border-bottom: 1px solid var(--grid);
}
th {
  font-weight: 500;
  color: var(--muted);
  position: sticky;
  top: 0;
  background: var(--surface);
}
.right {
  text-align: right;
}
</style>
