<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

// Colonnes empilées réalisé / à venir par période. Une seule échelle ;
// infobulle au survol (et au clavier) sur chaque colonne.
const props = defineProps({
  points: { type: Array, required: true }, // [{ label, done, planned }]
  format: { type: Function, required: true }
});

const root = ref(null);
const width = ref(640);
const height = 240;
const pad = { top: 16, right: 12, bottom: 28, left: 44 };
let ro;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = Math.max(280, e.contentRect.width)));
  ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

function niceMax(v) {
  if (v <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const hasPlanned = computed(() => props.points.some(p => p.planned > 0));
const geo = computed(() => {
  const pts = props.points;
  const max = niceMax(Math.max(0, ...pts.map(p => p.done + p.planned)));
  const w = width.value - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const band = pts.length ? w / pts.length : w;
  const bw = Math.min(24, Math.max(4, band * 0.6));
  const y = v => pad.top + h - (v / max) * h;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: max * f, y: y(max * f) }));
  const step = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(w / 70))));
  const cols = pts.map((p, i) => {
    const cx = pad.left + band * (i + 0.5);
    const yDone = y(p.done);
    const yTop = y(p.done + p.planned);
    return { ...p, i, cx, x: cx - bw / 2, bw, band, yDone, yTop, base: y(0) };
  });
  return { ticks, cols, step, max };
});

// Rectangle à coins arrondis en haut seulement (4px), carré à la base.
function topRounded(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const hover = ref(null);
const tip = computed(() => {
  const c = geo.value.cols[hover.value];
  if (!c) return null;
  return { c, left: (c.cx / width.value) * 100, flip: c.cx > width.value * 0.65 };
});
function onKey(e) {
  const n = props.points.length;
  if (!n) return;
  if (e.key === 'ArrowRight') hover.value = Math.min(n - 1, (hover.value ?? -1) + 1);
  else if (e.key === 'ArrowLeft') hover.value = Math.max(0, (hover.value ?? n) - 1);
  else return;
  e.preventDefault();
}
</script>

<template>
  <div ref="root" class="cols">
    <div v-if="hasPlanned" class="legend">
      <span><i class="sw" style="background: var(--series-1)" />Réalisé</span>
      <span><i class="sw" style="background: var(--series-2)" />À venir</span>
    </div>
    <div class="plot">
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        :width="width"
        :height="height"
        tabindex="0"
        role="img"
        aria-label="Charge par période. Flèches gauche/droite pour parcourir."
        @keydown="onKey"
        @blur="hover = null"
        @pointerleave="hover = null"
      >
        <g class="grid">
          <line v-for="t in geo.ticks" :key="t.v" :x1="pad.left" :x2="width - pad.right" :y1="t.y" :y2="t.y" />
        </g>
        <g class="axis">
          <text v-for="t in geo.ticks" :key="'t' + t.v" :x="pad.left - 8" :y="t.y + 4" text-anchor="end">
            {{ t.v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}
          </text>
          <template v-for="c in geo.cols" :key="'x' + c.i">
            <text v-if="c.i % geo.step === 0" :x="c.cx" :y="height - 8" text-anchor="middle">{{ c.label }}</text>
          </template>
        </g>
        <g v-for="c in geo.cols" :key="c.i" :class="{ dim: hover != null && hover !== c.i }">
          <!-- zone de survol : toute la largeur de la bande -->
          <rect :x="c.cx - c.band / 2" :y="pad.top" :width="c.band" :height="c.base - pad.top" fill="transparent" @pointerenter="hover = c.i" />
          <path
            v-if="c.done > 0"
            :d="c.planned > 0 ? `M${c.x},${c.base}V${c.yDone}H${c.x + c.bw}V${c.base}Z` : topRounded(c.x, c.yDone, c.bw, c.base - c.yDone)"
            fill="var(--series-1)"
            pointer-events="none"
          />
          <path
            v-if="c.planned > 0"
            :d="topRounded(c.x, c.yTop, c.bw, Math.max(0, c.yDone - c.yTop - (c.done > 0 ? 2 : 0)))"
            fill="var(--series-2)"
            pointer-events="none"
          />
        </g>
      </svg>
      <div v-if="tip" class="tooltip" :class="{ flip: tip.flip }" :style="{ left: tip.left + '%' }">
        <div class="tt-title">{{ tip.c.label }}</div>
        <div class="tt-row"><i style="background: var(--series-1)" /><strong class="num">{{ format(tip.c.done) }}</strong><span class="muted">réalisé</span></div>
        <div v-if="hasPlanned" class="tt-row"><i style="background: var(--series-2)" /><strong class="num">{{ format(tip.c.planned) }}</strong><span class="muted">à venir</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols {
  width: 100%;
  min-width: 0;
}
.legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--ink-2);
  margin-bottom: 6px;
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
.plot {
  position: relative;
}
svg {
  display: block;
  max-width: 100%;
  height: auto;
}
svg:focus-visible {
  outline: 2px solid var(--accent);
  border-radius: 4px;
}
.grid line {
  stroke: var(--grid);
  stroke-width: 1;
}
.axis text {
  font-size: 11px;
  fill: var(--muted);
  font-variant-numeric: tabular-nums;
}
.dim path {
  opacity: 0.55;
}
.tooltip {
  position: absolute;
  top: 0;
  transform: translateX(16px);
  pointer-events: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 12px;
  min-width: 130px;
}
.tooltip.flip {
  transform: translateX(calc(-100% - 16px));
}
.tt-title {
  color: var(--muted);
  margin-bottom: 4px;
}
.tt-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tt-row i {
  width: 12px;
  height: 2px;
}
.tt-row strong {
  color: var(--ink);
}
</style>
