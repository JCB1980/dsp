<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

// Liste déroulante à cases à cocher. Valeur = tableau des options cochées ;
// un tableau vide signifie « Tous » (aucun filtre).
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  presets: { type: Array, default: () => [] }, // [{ label, values }]
  labelledBy: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const root = ref(null);
const panel = ref(null);
const pos = ref({});

// Le panneau est positionné en « fixed » par rapport à la fenêtre : il reste
// toujours visible (jamais coupé par le bord), s'ouvre vers le haut s'il
// manque de place en dessous et défile si la fenêtre est trop basse.
const MARGIN = 8;
function place() {
  const trigger = root.value?.querySelector('.trigger');
  if (!open.value || !trigger) return;
  const r = trigger.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(240, r.width), vw - 2 * MARGIN);
  const left = Math.min(Math.max(MARGIN, r.left), vw - width - MARGIN);
  const below = vh - r.bottom - MARGIN;
  const above = r.top - MARGIN;
  const natural = panel.value ? panel.value.scrollHeight : 320;
  const up = below < Math.min(natural, 240) && above > below;
  const maxHeight = Math.max(120, (up ? above : below) - 4);
  pos.value = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    ...(up ? { bottom: `${vh - r.top + 4}px` } : { top: `${r.bottom + 4}px` })
  };
}
async function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    place();
    await nextTick();
    place();
  }
}

const selected = computed(() => new Set(props.modelValue));
const summary = computed(() => {
  const n = props.modelValue.length;
  if (!n || n === props.options.length) return 'Tous';
  if (n === 1) return props.modelValue[0];
  return `${n} sélectionnés`;
});

// L'ordre de la sélection suit celui des options, pour un affichage stable.
const set = values => {
  const keep = new Set(values);
  emit('update:modelValue', props.options.filter(o => keep.has(o)));
};
function toggle(option) {
  const next = new Set(selected.value);
  if (next.has(option)) next.delete(option);
  else next.add(option);
  set([...next]);
}
const presetActive = p =>
  p.values.length > 0 && p.values.length === props.modelValue.length && p.values.every(v => selected.value.has(v));

function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
function onKey(e) {
  if (e.key === 'Escape' && open.value) {
    open.value = false;
    root.value?.querySelector('.trigger')?.focus();
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocClick);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocClick);
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
});
</script>

<template>
  <div ref="root" class="ms">
    <button
      type="button"
      class="input trigger"
      :class="{ active: modelValue.length }"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-labelledby="labelledBy"
      :title="modelValue.join(', ')"
      @click="toggleOpen"
    >
      <span class="text">{{ summary }}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
    <div v-if="open" ref="panel" class="panel card" role="group" :aria-labelledby="labelledBy" :style="pos">
      <div v-if="presets.length" class="presets">
        <button
          v-for="p in presets"
          :key="p.label"
          type="button"
          class="chip"
          :class="{ on: presetActive(p) }"
          :disabled="!p.values.length"
          @click="set(p.values)"
        >
          {{ p.label }}
        </button>
      </div>
      <label v-for="o in options" :key="o" class="opt">
        <input type="checkbox" :checked="selected.has(o)" @change="toggle(o)" />
        <span>{{ o }}</span>
      </label>
      <div class="foot">
        <button type="button" class="btn ghost" :disabled="!modelValue.length" @click="set([])">Tout effacer</button>
        <button type="button" class="btn" @click="open = false">OK</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ms {
  position: relative;
}
.trigger {
  display: flex;
  height: 34px;
  line-height: normal;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 160px;
  max-width: 220px;
  width: 100%;
  cursor: pointer;
  text-align: left;
}
.trigger.active {
  border-color: var(--accent);
  background: var(--accent-wash);
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel {
  position: fixed;
  z-index: 40;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}
.presets {
  display: flex;
  gap: 6px;
  padding: 2px 4px 8px;
  border-bottom: 1px solid var(--grid);
  margin-bottom: 4px;
}
.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent-wash);
  color: var(--accent-ink);
}
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.opt:hover {
  background: var(--hover);
}
.opt input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
  margin: 0;
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--grid);
}
@media (max-width: 640px) {
  .trigger {
    max-width: none;
  }
}
</style>
