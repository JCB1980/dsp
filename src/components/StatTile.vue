<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  note: { type: String, default: '' },
  hero: Boolean,
  clickable: Boolean
});
defineEmits(['select']);
</script>

<template>
  <component :is="clickable ? 'button' : 'div'" class="card tile" :class="{ hero, clickable }" @click="clickable && $emit('select')">
    <span class="label">{{ label }}</span>
    <span class="value">{{ value }}</span>
    <span v-if="note" class="note muted">{{ note }}</span>
  </component>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  text-align: left;
  min-width: 0;
}
.tile.clickable {
  cursor: pointer;
}
.tile.clickable:hover {
  border-color: var(--accent);
}
.label {
  font-size: 12px;
  color: var(--ink-2);
}
.value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}
.hero .value {
  font-size: 48px;
}
.note {
  font-size: 12px;
}
</style>
