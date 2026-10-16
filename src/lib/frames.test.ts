import { describe, expect, it } from 'vitest';
import { clipToDuration, decimate, halve } from './frames';

const make = (count: number, duration: number) => Array.from({ length: count }, (_, image) => ({ image, duration }));

describe('clipToDuration', () => {
  it('keeps frames that start before the limit and shortens the last one', () => {
    const clipped = clipToDuration(make(10, 400), 1000);

    expect(clipped.map((frame) => frame.duration)).toEqual([400, 400, 200]);
  });

  it('returns all frames when the animation is short enough', () => {
    expect(clipToDuration(make(3, 100), 9000)).toHaveLength(3);
  });
});

describe('decimate', () => {
  it('keeps every frame when the count is within the limit', () => {
    expect(decimate(make(60, 50), 60)).toHaveLength(60);
  });

  it('keeps every step-th frame and preserves the total duration', () => {
    const frames = decimate(make(270, 33), 60);

    expect(frames.map((frame) => frame.image).slice(0, 3)).toEqual([0, 5, 10]);
    expect(frames).toHaveLength(54);
    expect(frames.reduce((total, frame) => total + frame.duration, 0)).toBe(270 * 33);
  });
});

describe('halve', () => {
  it('drops every other frame', () => {
    const frames = halve(make(5, 100));

    expect(frames.map((frame) => frame.image)).toEqual([0, 2, 4]);
    expect(frames.map((frame) => frame.duration)).toEqual([200, 200, 100]);
  });
});
