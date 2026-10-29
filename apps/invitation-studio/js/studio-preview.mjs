import { normalizeComposition, SECTION_IDS, CHOICE_KEYS, ORDER_SECTIONS } from './composition.mjs';
import { mountExperience } from './experience.mjs';
import { mountUpperScenes } from './upper-scenes.mjs';
import { mountContentScenes } from './content-scenes.mjs';
import { mountAppearance } from './appearance.mjs';
import { mountSectionOrder } from './section-order.mjs';
import { mountScrollEffects } from './scroll-effects.mjs';
import { mountUtilityScenes } from './utility-scenes.mjs';
import { mountOptionalScenes } from './optional-scenes.mjs';
import { mountSentimentScenes } from './sentiment-scenes.mjs';
import { mountPhotoFinishScenes } from './photo-finish-scenes.mjs';
import { mountGuestPass } from './guest-pass.mjs';
import { normalizeContentDraft } from './content-draft.mjs';
import { mountFineAppearance } from './fine-appearance.mjs';

export const STUDIO_SECTIONS = Object.freeze(['top', ...ORDER_SECTIONS.map(section => section.id), 'closing']);

// Parent-window identity is checked separately from origin: a sibling frame cannot alter this preview.
export function studioMessage(event, { origin, parent, embedded }) {
  if (!embedded || !event || event.origin !== origin || event.source !== parent) return null;
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'invitation-studio:content') {
    try { return {type:'content', draft:normalizeContentDraft(data.draft)}; } catch { return null; }
  }
  const requestId = Number.isSafeInteger(data.requestId) && data.requestId >= 0 ? data.requestId : null;
  if (data.type === 'invitation-studio:apply') return { type: 'apply', composition: normalizeComposition(data.composition), ...(requestId !== null ? { requestId } : {}), ...(data.previewOnly === true ? { previewOnly: true } : {}) };
  if (data.type === 'invitation-studio:demo' && requestId !== null && CHOICE_KEYS.includes(data.key)) return { type: 'demo', requestId, key: data.key };
  if (data.type === 'invitation-studio:demo-stop' && requestId !== null) return { type: 'demo-stop', requestId };
  if (data.type === 'invitation-studio:jump' && STUDIO_SECTIONS.includes(data.section)) {
    const reviewKey = typeof data.reviewKey === 'string' && Object.hasOwn(SECTION_IDS, data.reviewKey) && SECTION_IDS[data.reviewKey] === data.section ? data.reviewKey : null;
    return { type: 'jump', section: data.section, ...(data.section === 'top' && data.replayOpening === true ? { replayOpening: true } : {}), ...(reviewKey ? { reviewKey } : {}) };
  }
  return null;
}

/** One persistent invitation. Composition never remounts sound, data, or the four approved modules. */
export function mountStudio({ doc = document, win = window, gallery, wedding, enabled = true, composition, onChange = () => {} } = {}) {
  let current = normalizeComposition(composition), disposed = false, requested = Boolean(enabled);
  const controllers = [];
  let experience, upper, content, scroll, utilities, extras, sentiment, finish, guestPass;
  function updateMotion() {
    const sectionMotion = requested && current.motion !== 'still';
    experience?.setEnabled(requested);
    experience?.setScrollEnabled(sectionMotion);
    upper?.setEnabled(sectionMotion);
    content?.setEnabled(requested); content?.setScrollEnabled(sectionMotion);
    scroll?.setEnabled(requested);
    utilities?.setEnabled(requested); utilities?.setScrollEnabled(sectionMotion);
    extras?.setEnabled(sectionMotion); sentiment?.setEnabled(sectionMotion);
    finish?.setEnabled(sectionMotion); guestPass?.setEnabled(sectionMotion);
  }
  try {
    controllers.push(mountAppearance({ doc, win, composition: current, onLayout: () => { if (!disposed) doc.dispatchEvent(new win.Event('lab:layout-changed')); } }));
    controllers.push(sentiment = mountSentimentScenes({ doc, win, composition: current, wedding, enabled }));
    controllers.push(extras = mountOptionalScenes({ doc, win, composition: current, wedding, enabled }));
    controllers.push(guestPass = mountGuestPass({ doc, win, composition: current, wedding, enabled }));
    controllers.push(mountSectionOrder({ doc, composition: current }));
    controllers.push(experience = mountExperience({ doc, win, gallery, enabled, variant: 'f', includeGallery: false, includeUpper: false }));
    controllers.push(utilities = mountUtilityScenes({ doc, win, enabled, composition: current }));
    controllers.push(upper = mountUpperScenes({ doc, win, enabled, composition: current }));
    controllers.push(content = mountContentScenes({ doc, win, gallery, enabled, composition: current }));
    controllers.push(finish = mountPhotoFinishScenes({ doc, win, gallery, enabled, composition: current }));
    controllers.push(scroll = mountScrollEffects({ doc, win, enabled, mode: current.motion, speed: current.motionSpeed, strength: current.motionStrength }));
    controllers.push(mountFineAppearance({doc,win,composition:current}));
    updateMotion();
  } catch (error) { controllers.reverse().forEach(controller => controller.destroy()); throw error; }
  return {
    get composition() { return { ...current }; },
    get whenReady() { return controllers[0]?.whenReady || Promise.resolve(); },
    prepareDemo(key) {
      if (disposed) return () => {};
      const cleanups = [scroll.prepareDemo?.(key), upper.prepareDemo?.(key), content.prepareDemo?.(key), finish.prepareDemo?.(key)].filter(Boolean);
      return () => cleanups.forEach(clean => clean());
    },
    demoInteraction(key) {
      if (disposed) return () => {};
      return key === 'album' ? content.demoInteraction?.() || (() => {}) : key === 'guestGuide' ? extras.demoInteraction?.(key) || (() => {}) : experience.demoInteraction?.(key) || (() => {});
    },
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
