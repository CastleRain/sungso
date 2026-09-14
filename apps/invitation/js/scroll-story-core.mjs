const MAX_MEASUREMENT = Number.MAX_SAFE_INTEGER;

function finiteMeasurement(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_MEASUREMENT, Math.max(0, value))
    : fallback;
}

function bounded(value, minimum, maximum) {
  if (typeof value !== 'number' || Number.isNaN(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

const smoothstep = value => value * value * (3 - 2 * value);

/** Distances are CSS pixels of ordinary document scrolling, including long-page reading. */
export function buildStoryTrack(heights, viewportHeight) {
  const viewport = Math.max(1, finiteMeasurement(viewportHeight, 1));
  const pages = Array.isArray(heights) ? Array.from(heights) : [];
  let distance = 0;
  const segments = pages.map((value, index) => {
    const height = finiteMeasurement(value, viewport);
    const hold = viewport * 0.32;
    const pan = Math.max(0, height - viewport);
    const transition = index < pages.length - 1 ? viewport * 0.65 : 0;
    const duration = hold + pan + transition;
    const start = distance;
    distance += duration;
    return { start, end: distance, height, hold, pan, transition, duration };
  });
  return { segments, distance, viewportHeight: viewport };
}

/** A frame depends only on the current position, so scrolling back restores the same frame. */
export function getStoryFrame(track, distance) {
  const segments = track?.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    return { index: -1, nextIndex: null, local: 0, panY: 0, transition: 0, sceneProgress: 0, progress: 0 };
  }
  const position = bounded(distance, 0, track.distance);
  let index = segments.findIndex(segment => position < segment.end);
  if (index === -1) index = segments.length - 1;
  const segment = segments[index];
  const local = bounded(position - segment.start, 0, segment.duration);
  const readingDistance = segment.hold + segment.pan;
  const pan = bounded(local - segment.hold, 0, segment.pan);
  const transitionProgress = segment.transition > 0
    ? bounded((local - readingDistance) / segment.transition, 0, 1)
    : 0;
  return {
    index,
    nextIndex: index < segments.length - 1 ? index + 1 : null,
    local,
    panY: pan === 0 ? 0 : -pan,
    transition: smoothstep(transitionProgress),
    sceneProgress: bounded(local / readingDistance, 0, 1),
    progress: bounded(position / track.distance, 0, 1),
  };
}

/** Fraction spans a complete segment, including its transition to the following scene. */
export function storyDistanceAt(track, index, fraction = 0) {
  const segments = track?.segments;
  if (!Array.isArray(segments) || segments.length === 0) return 0;
  const safeIndex = Math.trunc(bounded(index, 0, segments.length - 1));
  const segment = segments[safeIndex];
  return segment.start + segment.duration * bounded(fraction, 0, 1);
}
