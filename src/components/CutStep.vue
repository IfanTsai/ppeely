<script setup lang="ts">
// First editor step: select the sticker area on the image. One finger draws the selection; two fingers zoom and pan the view.
import { IonIcon } from '@ionic/vue';
import { arrowUndo, brushOutline, checkboxOutline, colorWandOutline, ellipseOutline, refreshOutline, shapesOutline, squareOutline } from 'ionicons/icons';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '../i18n';
import { ellipsePath, freehandPath, FREEHAND_MIN_POINTS, polygonPath, rectPath, type Point, type SelectorType } from '../lib/cutout';

const props = defineProps<{ image: HTMLCanvasElement }>();

const emit = defineEmits<{
  rotate: [];
  smartSelect: [];
  // A null `path` means select-all.
  cut: [path: Path2D | null];
}>();

// Selection line width, in CSS pixels.
const STROKE_WIDTH = 3;

// Rectangles and ellipses must reach this width and height to count, to avoid accidental touches.
const MIN_SHAPE_SIZE = STROKE_WIDTH * 5;

// Radius of the polygon vertex dots, and how close the release point must be to the first vertex to close the shape.
const VERTEX_RADIUS = 8;
const CLOSE_DISTANCE = VERTEX_RADIUS * 1.5;

// Maximum zoom, as a multiple of the "fit to screen" size.
const MAX_ZOOM = 8;

const VIEW_MARGIN = 16;

const tools: { type: SelectorType; icon: string; label: string }[] = [
  { type: 'freehand', icon: brushOutline, label: t.freehand },
  { type: 'rect', icon: squareOutline, label: t.square },
  { type: 'ellipse', icon: ellipseOutline, label: t.circle },
  { type: 'polygon', icon: shapesOutline, label: t.polygon },
];

const canvasRef = ref<HTMLCanvasElement | null>(null);
const tool = ref<SelectorType>('freehand');
const vertexCount = ref(0);
const drawing = ref(false);

// Gesture state doesn't drive rendering, so it lives in a plain object. View transform: screen coordinates = image coordinates × scale + (x, y).
const view = { scale: 1, x: 0, y: 0, fitScale: 1 };
const pointers = new Map<number, Point>();

// Collected selection points, in image coordinates. Freehand: sample points; rectangle and ellipse: two opposite corners; polygon: vertices.
let points: Point[] = [];
let active = false;
let lastSample: Point = { x: 0, y: 0 };
let pinchDistance = 0;
let pinchCenter: Point = { x: 0, y: 0 };
let observer: ResizeObserver | null = null;

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const context = canvas.getContext('2d')!;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(ratio * view.scale, 0, 0, ratio * view.scale, ratio * view.x, ratio * view.y);
  context.imageSmoothingQuality = 'high';
  context.drawImage(props.image, 0, 0);

  const path = previewPath();
  if (!path) {
    return;
  }

  // Selection preview: a thick white base line with a theme-colored dashed line on top, visible on any image.
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#ffffff';
  context.lineWidth = (STROKE_WIDTH * 1.4) / view.scale;
  context.stroke(path);
  context.strokeStyle = '#128c7e';
  context.lineWidth = STROKE_WIDTH / view.scale;
  context.setLineDash([10 / view.scale, 20 / view.scale]);
  context.stroke(path);
  context.setLineDash([]);

  if (tool.value === 'polygon') {
    points.forEach((point, index) => {
      const radius = ((index === 0 ? 1 : 0.5) * VERTEX_RADIUS) / view.scale;
      context.fillStyle = 'rgba(255, 255, 255, 0.78)';
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(point.x, point.y, radius * 0.8, 0, Math.PI * 2);
      context.fill();
    });
  }
}

function previewPath(): Path2D | null {
  if (points.length === 0) {
    return null;
  }

  switch (tool.value) {
    case 'rect':
      return points.length === 2 ? rectPath(points[0], points[1]) : null;

    case 'ellipse':
      return points.length === 2 ? ellipsePath(points[0], points[1]) : null;

    default: {
      // While drawing, the freehand preview is a polyline through the sample points, smoothed and closed only after the finger lifts; the polygon preview is the edges placed so far.
      const path = new Path2D();
      points.forEach((point, index) => (index === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y)));

      return path;
    }
  }
}

// When the image changes (e.g. rotation) or the container resizes, re-fit the view to the screen and clear the selection.
function fit(): void {
  const canvas = canvasRef.value;
  if (!canvas || canvas.clientWidth === 0) {
    return;
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  view.fitScale = Math.min((width - VIEW_MARGIN * 2) / props.image.width, (height - VIEW_MARGIN * 2) / props.image.height);
  view.scale = view.fitScale;
  view.x = (width - props.image.width * view.scale) / 2;
  view.y = (height - props.image.height * view.scale) / 2;
  reset();
}

onMounted(() => {
  fit();
  observer = new ResizeObserver(fit);
  observer.observe(canvasRef.value!);
});
onUnmounted(() => observer?.disconnect());
watch(() => props.image, fit);

function screenPoint(event: PointerEvent): Point {
  const rect = canvasRef.value!.getBoundingClientRect();

  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

const toImage = (point: Point): Point => ({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale });

const toScreen = (point: Point): Point => ({ x: point.x * view.scale + view.x, y: point.y * view.scale + view.y });

function reset(): void {
  points = [];
  active = false;
  vertexCount.value = 0;
  drawing.value = false;
  draw();
}

function commit(path: Path2D): void {
  reset();
  emit('cut', path);
}

function onPointerDown(event: PointerEvent): void {
  const point = screenPoint(event);
  canvasRef.value!.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, point);

  if (pointers.size === 2) {
    // A second finger touches down: abandon the selection being drawn and switch to zooming and panning the view.
    if (active) {
      if (tool.value === 'polygon') {
        points.pop();
        vertexCount.value = points.length;
      } else {
        points = [];
      }

      active = false;
      drawing.value = false;
    }

    const [a, b] = [...pointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    draw();

    return;
  }

  if (pointers.size !== 1) {
    return;
  }

  active = true;
  lastSample = point;

  if (tool.value === 'polygon') {
    points.push(toImage(point));
    vertexCount.value = points.length;
  } else {
    points = [toImage(point)];
    drawing.value = true;
  }

  draw();
}

function onPointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) {
    return;
  }

  const point = screenPoint(event);
  pointers.set(event.pointerId, point);

  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const anchor = toImage(pinchCenter);

    if (pinchDistance > 0) {
      view.scale = Math.min(view.fitScale * MAX_ZOOM, Math.max(view.fitScale, view.scale * (distance / pinchDistance)));
    }

    // Keep the image point that was under the midpoint of the two fingers before zooming under the new midpoint after zooming.
    view.x = center.x - anchor.x * view.scale;
    view.y = center.y - anchor.y * view.scale;
    pinchDistance = distance;
    pinchCenter = center;
    draw();

    return;
  }

  if (!active) {
    return;
  }

  switch (tool.value) {
    case 'freehand':
      // Only record a new point once the finger has moved at least the line width horizontally or vertically since the last sample.
      if (Math.abs(point.x - lastSample.x) >= STROKE_WIDTH || Math.abs(point.y - lastSample.y) >= STROKE_WIDTH) {
        points.push(toImage(point));
        lastSample = point;
      }
      break;

    case 'rect':
    case 'ellipse':
      points[1] = toImage(point);
      break;

    case 'polygon':
      points[points.length - 1] = toImage(point);
      break;
  }

  draw();
}

function onPointerUp(event: PointerEvent): void {
  if (!pointers.delete(event.pointerId) || !active || pointers.size > 0) {
    return;
  }

  active = false;
  const point = screenPoint(event);

  switch (tool.value) {
    case 'freehand':
      if (points.length > FREEHAND_MIN_POINTS) {
        commit(freehandPath(points));
      } else {
        reset();
      }
      break;

    case 'rect':
    case 'ellipse': {
      const start = toScreen(points[0]);
      if (points.length === 2 && Math.abs(point.x - start.x) >= MIN_SHAPE_SIZE && Math.abs(point.y - start.y) >= MIN_SHAPE_SIZE) {
        commit(tool.value === 'rect' ? rectPath(points[0], points[1]) : ellipsePath(points[0], points[1]));
      } else {
        reset();
      }
      break;
    }

    case 'polygon': {
      // Close the shape when the release point is near the first vertex; the vertex just placed is only the "close" action and isn't counted as part of the shape.
      const first = toScreen(points[0]);
      if (points.length >= 4 && Math.hypot(point.x - first.x, point.y - first.y) < CLOSE_DISTANCE) {
        commit(polygonPath(points.slice(0, -1)));
      }
      break;
    }
  }
}

function selectTool(type: SelectorType): void {
  tool.value = type;
  reset();
}

function undo(): void {
  points.pop();
  vertexCount.value = points.length;
  draw();
}
</script>

<template>
  <div class="cut-step" data-testid="cut-step">
    <canvas
      ref="canvasRef"
      class="cut-canvas checker"
      data-testid="cut-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <div class="cut-hint" :class="{ hidden: drawing }">{{ tool === 'polygon' ? t.polygonInstructions : t.cutInstructions }}</div>
    <button v-if="tool === 'polygon' && vertexCount > 0" class="cut-undo" data-testid="cut-undo" @click="undo">
      <ion-icon :icon="arrowUndo" />
      {{ t.undo }}
    </button>
    <div class="cut-tools" :class="{ hidden: drawing }">
      <div class="tool-row">
        <button class="tool" data-testid="cut-rotate" @click="emit('rotate')">
          <ion-icon :icon="refreshOutline" />
          <span>{{ t.rotate }}</span>
        </button>
        <button class="tool" data-testid="cut-select-all" @click="emit('cut', null)">
          <ion-icon :icon="checkboxOutline" />
          <span>{{ t.selectAll }}</span>
        </button>
        <button class="tool" data-testid="cut-smart" @click="emit('smartSelect')">
          <ion-icon :icon="colorWandOutline" />
          <span>{{ t.smartSelect }}</span>
        </button>
      </div>
      <div class="tool-row">
        <button v-for="item in tools" :key="item.type" class="tool" :class="{ active: tool === item.type }" :data-testid="`cut-tool-${item.type}`" @click="selectTool(item.type)">
          <ion-icon :icon="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
