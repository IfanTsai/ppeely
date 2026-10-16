// Sticker outline, done in a single WebGL fragment shader:
// first shrink the image toward the center, leaving the outline width plus a small margin (`sampleInset`) around it; then sample on a circle whose radius is the outline width,
// take the highest opacity among the samples as the outline opacity (`ringCoverage`), and finally draw the original image on top of the outline.
import { STICKER_SIZE } from './constants';

export interface OutlineOptions {
  // Outline width, as a fraction of the canvas side length; 0 means no outline and the image is output unchanged.
  width: number;
  // Outline color, each component in the range 0–1.
  color: [number, number, number];
}

// Margin between the outer edge of the outline and the canvas edge: 1 pixel on the finished sticker. The outline's outer edge is anti-aliased and would lose half a pixel if it touched the canvas edge.
const EDGE_PADDING = 1 / STICKER_SIZE;

// The number of sample points on the circle is based on its circumference: adjacent sample points are about 1 pixel apart, so even the thinnest shapes cannot slip between two samples.
// The shader's loop count must be a constant, so there is a cap; on a 1024-pixel canvas, radii up to 50 pixels never hit it.
const MIN_RING_SAMPLES = 24;
const MAX_RING_SAMPLES = 320;

const VERTEX_SHADER = `
attribute vec2 corner;
varying highp vec2 uv;

void main() {
  uv = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D image;
uniform highp float radius;
uniform highp float inset;
uniform highp float ringSamples;
uniform lowp vec3 strokeColor;
varying highp vec2 uv;

const float TWO_PI = 6.28318530718;
const int MAX_RING_SAMPLES = ${MAX_RING_SAMPLES};

// Reads the shrunk image: the canvas leaves inset on every side, and everything outside the image is fully transparent.
// The bounds check compares component by component instead of using vector comparisons like any(lessThanEqual(...)): those give wrong results on the Android emulator's OpenGL ES translation layer.
vec4 sampleInset(vec2 point) {
  vec2 source = (point - 0.5) / (1.0 - 2.0 * inset) + 0.5;
  if (source.x > 0.0 && source.x < 1.0 && source.y > 0.0 && source.y < 1.0) {
    return texture2D(image, source);
  }

  return vec4(0.0);
}

// The outline opacity is the highest opacity among all samples, rather than "fill completely if any sample is opaque":
// the image edges are themselves anti-aliased, so the outline edge follows smoothly without jaggies.
float ringCoverage(vec2 point) {
  float coverage = 0.0;
  float angleStep = TWO_PI / ringSamples;

  for (int i = 0; i < MAX_RING_SAMPLES; i++) {
    if (float(i) >= ringSamples) {
      break;
    }

    float angle = float(i) * angleStep;
    coverage = max(coverage, sampleInset(point + vec2(cos(angle), sin(angle)) * radius).a);
  }

  return coverage;
}

void main() {
  vec4 pixel = sampleInset(uv);
  float coverage = max(ringCoverage(uv), pixel.a);

  // Lay down the outline color first, then draw the original image on top by its own opacity; the output is a premultiplied-alpha color.
  vec4 stroke = vec4(strokeColor * coverage, coverage);
  gl_FragColor = vec4(pixel.rgb * pixel.a, pixel.a) + stroke * (1.0 - pixel.a);
}`;

interface Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  radiusLocation: WebGLUniformLocation | null;
  insetLocation: WebGLUniformLocation | null;
  samplesLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
}

let renderer: Renderer | null = null;

// Number of stamps around the circle in the 2D canvas fallback; more stamps give a rounder outer edge to the outline.
const CANVAS_STAMPS = 72;

// Returns a new canvas the same size as the input; the input canvas is not modified.
export function applyOutline(source: HTMLCanvasElement, options: OutlineOptions): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;

  const context = output.getContext('2d')!;
  if (options.width <= 0) {
    context.drawImage(source, 0, 0);

    return output;
  }

  try {
    context.drawImage(renderWithShader(source, options), 0, 0);
  } catch (error) {
    // When WebGL is unavailable or the context is lost (which happens when system memory is low), use a 2D canvas to produce the same outline so the editor keeps working.
    console.warn('outline shader failed, falling back to 2D canvas', error);
    renderer = null;
    context.clearRect(0, 0, output.width, output.height);
    renderWithCanvas(context, source, options);
  }

  return output;
}

function renderWithShader(source: HTMLCanvasElement, options: OutlineOptions): HTMLCanvasElement {
  const { canvas, gl, radiusLocation, insetLocation, samplesLocation, colorLocation } = getRenderer();
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width;
    canvas.height = source.height;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  // The shader blends non-premultiplied colors and outputs a premultiplied result, so keep the texture non-premultiplied when uploading.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.uniform1f(radiusLocation, options.width);
  gl.uniform1f(insetLocation, options.width + EDGE_PADDING);
  gl.uniform1f(samplesLocation, ringSampleCount(options.width * source.width));
  gl.uniform3f(colorLocation, options.color[0], options.color[1], options.color[2]);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) {
    throw new Error('WebGL rendering failed');
  }

  return canvas;
}

// The same algorithm on a 2D canvas: tint the shrunk image with the outline color, stamp it around a circle whose radius is the outline width, then draw the image itself on top.
function renderWithCanvas(context: CanvasRenderingContext2D, source: HTMLCanvasElement, options: OutlineOptions): void {
  const { width, height } = source;
  const scale = 1 - 2 * (options.width + EDGE_PADDING);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const left = (width - scaledWidth) / 2;
  const top = (height - scaledHeight) / 2;

  const silhouette = document.createElement('canvas');
  silhouette.width = width;
  silhouette.height = height;
  const silhouetteContext = silhouette.getContext('2d')!;
  silhouetteContext.drawImage(source, left, top, scaledWidth, scaledHeight);
  silhouetteContext.globalCompositeOperation = 'source-in';
  silhouetteContext.fillStyle = `rgb(${options.color.map((value) => Math.round(value * 255)).join(', ')})`;
  silhouetteContext.fillRect(0, 0, width, height);

  const radius = options.width * width;
  for (let index = 0; index < CANVAS_STAMPS; index++) {
    const angle = (index / CANVAS_STAMPS) * Math.PI * 2;
    context.drawImage(silhouette, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  context.drawImage(source, left, top, scaledWidth, scaledHeight);
}

function ringSampleCount(radiusPixels: number): number {
  return Math.min(MAX_RING_SAMPLES, Math.max(MIN_RING_SAMPLES, Math.ceil(2 * Math.PI * radiusPixels)));
}

function getRenderer(): Renderer {
  if (renderer && !renderer.gl.isContextLost()) {
    return renderer;
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
  if (!gl) {
    throw new Error('WebGL is not available');
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`failed to link outline shader: ${gl.getProgramInfoLog(program)}`);
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.disable(gl.BLEND);

  renderer = {
    canvas,
    gl,
    radiusLocation: gl.getUniformLocation(program, 'radius'),
    insetLocation: gl.getUniformLocation(program, 'inset'),
    samplesLocation: gl.getUniformLocation(program, 'ringSamples'),
    colorLocation: gl.getUniformLocation(program, 'strokeColor'),
  };

  return renderer;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`failed to compile outline shader: ${gl.getShaderInfoLog(shader)}`);
  }

  return shader;
}
