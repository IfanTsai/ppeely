// Frame sequence processing for animated stickers: truncate to the duration limit and drop frames down to the frame count limit. Pure computation, no browser APIs.

export interface TimedFrame<T> {
  image: T;
  // Frame duration in milliseconds.
  duration: number;
}

// Keeps only frames that start within the first maxMs milliseconds; the last frame is shortened to end exactly at the limit.
export function clipToDuration<T>(frames: TimedFrame<T>[], maxMs: number): TimedFrame<T>[] {
  const clipped: TimedFrame<T>[] = [];
  let elapsed = 0;

  for (const frame of frames) {
    if (elapsed >= maxMs) {
      break;
    }

    clipped.push({ image: frame.image, duration: Math.min(frame.duration, maxMs - elapsed) });
    elapsed += frame.duration;
  }

  return clipped;
}

// When the frame count exceeds the limit, keep one frame every step frames, where step = ceil(frame count / limit).
// The durations of skipped frames are added to the previous kept frame, so the total animation duration is unchanged.
export function decimate<T>(frames: TimedFrame<T>[], maxFrames: number): TimedFrame<T>[] {
  const step = Math.ceil(frames.length / maxFrames);
  if (step <= 1) {
    return frames;
  }

  const kept: TimedFrame<T>[] = [];
  frames.forEach((frame, index) => {
    if (index % step === 0) {
      kept.push({ ...frame });
    } else {
      kept[kept.length - 1].duration += frame.duration;
    }
  });

  return kept;
}

// Drops half the frames (their durations added to the previous frame); a fallback for when even the lowest quality exceeds the size limit.
export function halve<T>(frames: TimedFrame<T>[]): TimedFrame<T>[] {
  return decimate(frames, Math.ceil(frames.length / 2));
}
