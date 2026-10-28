import { normalizeComposition, SECTION_IDS } from './composition.mjs';
import { mountExperience } from './experience.mjs';
import { mountUpperScenes } from './upper-scenes.mjs';
import { mountContentScenes } from './content-scenes.mjs';
import { mountAppearance } from './appearance.mjs';
import { mountSectionOrder } from './section-order.mjs';
import { mountScrollEffects } from './scroll-effects.mjs';

export const STUDIO_SECTIONS = Object.freeze(['top', 'invitation', 'wedding-day', 'location', 'our-story', 'gallery', 'accounts', 'guestbook']);

// Parent-window identity is checked separately from origin: a sibling frame cannot alter this preview.
export function studioMessage(event, { origin, parent, embedded }) {
  if (!embedded || !event || event.origin !== origin || event.source !== parent) return null;
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'invitation-studio:apply') return { type: 'apply', composition: normalizeComposition(data.composition) };
  if (data.type === 'invitation-studio:jump' && STUDIO_SECTIONS.includes(data.section)) {
    const reviewKey = typeof data.reviewKey === 'string' && Object.hasOwn(SECTION_IDS, data.reviewKey) && SECTION_IDS[data.reviewKey] === data.section ? data.reviewKey : null;
    return { type: 'jump', section: data.section, ...(data.section === 'top' && data.replayOpening === true ? { replayOpening: true } : {}), ...(reviewKey ? { reviewKey } : {}) };
  }
  return null;
}

/** One persistent invitation. Composition never remounts sound, data, or the four approved modules. */
export function mountStudio({ doc = document, win = window, gallery, enabled = true, composition, onChange = () => {} } = {}) {
  let current = normalizeComposition(composition), disposed = false, requested = Boolean(enabled);
  const controllers = [];
  let experience, upper, content, scroll;
  function updateMotion() {
    const sectionMotion = requested && current.motion !== 'still';
    experience?.setEnabled(requested);
    experience?.setScrollEnabled(sectionMotion);
    upper?.setEnabled(sectionMotion);
    content?.setEnabled(requested); content?.setScrollEnabled(sectionMotion);
    scroll?.setEnabled(requested);
  }
  try {
    controllers.push(mountAppearance({ doc, win, composition: current, onLayout: () => { if (!disposed) doc.dispatchEvent(new win.Event('lab:layout-changed')); } }));
    controllers.push(mountSectionOrder({ doc, composition: current }));
    controllers.push(experience = mountExperience({ doc, win, gallery, enabled, variant: 'f', includeGallery: false, includeUpper: false }));
    controllers.push(upper = mountUpperScenes({ doc, win, enabled, composition: current }));
    controllers.push(content = mountContentScenes({ doc, win, gallery, enabled, composition: current }));
    controllers.push(scroll = mountScrollEffects({ doc, win, enabled, mode: current.motion }));
    updateMotion();
  } catch (error) { controllers.reverse().forEach(controller => controller.destroy()); throw error; }
  return {
    get composition() { return { ...current }; },
    get whenReady() { return controllers[0]?.whenReady || Promise.resolve(); },
    previewMotion(id) { if (!disposed) scroll.replay?.(id); },
    setComposition(next) {
      if (disposed) return;
      current = normalizeComposition(next);
      controllers.forEach(controller => controller.setComposition?.(current));
      scroll.setMode(current.motion); updateMotion();
      onChange(current);
      doc.dispatchEvent(new win.Event('lab:layout-changed'));
    },
    setEnabled(value) { if (!disposed) { requested = Boolean(value); updateMotion(); } },
    refresh() { if (!disposed) controllers.forEach(controller => controller.refresh()); },
    destroy() { if (disposed) return; disposed = true; controllers.reverse().forEach(controller => controller.destroy()); },
  };
}
