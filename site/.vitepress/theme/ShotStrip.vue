<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps({
  label: {
    type: String,
    default: "截图",
  },
});

const root = ref(null);
let pointerId = null;
let startX = 0;
let startScroll = 0;
let dragged = false;

function onPointerDown(event) {
  const el = root.value;
  if (!el || event.button !== 0) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  startScroll = el.scrollLeft;
  dragged = false;
  el.classList.add("is-dragging");
  el.setPointerCapture(pointerId);
}

function onPointerMove(event) {
  const el = root.value;
  if (!el || pointerId !== event.pointerId) return;
  const dx = event.clientX - startX;
  if (Math.abs(dx) > 3) dragged = true;
  el.scrollLeft = startScroll - dx;
}

function endDrag(event) {
  const el = root.value;
  if (!el || pointerId !== event.pointerId) return;
  el.classList.remove("is-dragging");
  try {
    el.releasePointerCapture(pointerId);
  } catch {
    /* already released */
  }
  pointerId = null;
}

function onClickCapture(event) {
  if (!dragged) return;
  event.preventDefault();
  event.stopPropagation();
  dragged = false;
}

onMounted(() => {
  const el = root.value;
  if (!el) return;
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
  el.addEventListener("click", onClickCapture, true);
});

onBeforeUnmount(() => {
  const el = root.value;
  if (!el) return;
  el.removeEventListener("pointerdown", onPointerDown);
  el.removeEventListener("pointermove", onPointerMove);
  el.removeEventListener("pointerup", endDrag);
  el.removeEventListener("pointercancel", endDrag);
  el.removeEventListener("click", onClickCapture, true);
});
</script>

<template>
  <div
    ref="root"
    class="shot-strip"
    role="region"
    :aria-label="label"
  >
    <slot />
  </div>
</template>
