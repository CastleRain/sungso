const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function referenceTreatment(id) {
  if (['salon-lettering', 'guest-porto'].includes(id)) return 'photo';
  if (['salon-editorial', 'guest-jeju'].includes(id)) return 'story';
  return 'paper';
}

/** Reversible visual values; the introduction's clock is deliberately separate. */
export function referenceSceneMotion(id, input) {
  const t = clamp(input.transition), progress = clamp(input.progress);
  const height = clamp(input.height, 1, 10000), pan = Math.min(0, Number.isFinite(input.panY) ? input.panY : 0);
  const current = Boolean(input.current), treatment = referenceTreatment(id);
  let y = current ? pan : 0, scale = 1, opacity = 1, clip = 'inset(0)';
  if (treatment === 'paper') {
    if (!current) clip = `inset(${height * (1 - t)}px 0 0 0)`;
  } else if (treatment === 'photo') {
    // Keep an opaque page behind the incoming photograph at every scroll position.
    // Sequential fades left both pages transparent when a reader stopped halfway.
    if (!current) { opacity = t; scale = 1 + .025 * (1 - t); }
  } else {
    // The read offset has reached the long page's bottom before this movement.
    // Two opaque edges meet, so a paused transition cannot reveal an empty stage.
    y += current ? -height * t : height * (1 - t);
  }
  return {
    '--ref-scene-y': `${y}px`, '--ref-scene-scale': String(scale),
    '--ref-scene-opacity': String(opacity), '--ref-scene-clip': clip,
    '--ref-photo-scale': String(treatment === 'photo' ? 1 + (1 - progress) * .065 : 1.025),
    '--ref-photo-near': `${(1 - progress) * 6}px`, '--ref-photo-far': `${(1 - progress) * -6}px`,
    '--ref-reading-progress': String(progress),
  };
}

export function collectReferenceScenes(article) {
  if (!article) return { nodes: [], groups: [] };
  const groups = [], nodes = [];
  function visit(parent) {
    for (const node of parent.children) {
      const group = node.hasAttribute('data-reference-scene-group') || node.classList.contains('rg-date') || node.classList.contains('rg-ending');
      if (group) { groups.push(node); visit(node); }
      else nodes.push(node);
    }
  }
  visit(article);
  return { nodes, groups };
}

export function referenceSceneKey(node, index, id) {
  return node.dataset.referenceKey || `${id}-${node.dataset.section || (node.classList.contains('cover') ? 'cover' : `scene-${index}`)}`;
}
