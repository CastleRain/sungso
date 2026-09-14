import { createScrollStory, supportsScrollStory as supportsScenes } from './scroll-story.mjs?v=20260915-personal-invitation';
import { createReferenceFlow } from './reference-flow.mjs?v=20260915-personal-invitation';
import { isReferenceTemplate } from './reference-catalog.mjs?v=20260915-personal-invitation';

export const supportsScrollStory = id => isReferenceTemplate(id) || supportsScenes(id);

export function createPreviewScroll() {
  const scenes = createScrollStory(), flow = createReferenceFlow();
  let current = null;
  return {
    mount(main, options = {}) {
      current?.dispose();
      current = isReferenceTemplate(options.templateId) ? flow : scenes;
      return current.mount(main, options);
    },
    capture: () => current?.capture() ?? null,
    refresh: () => current?.refresh(),
    dispose() { current?.dispose(); current = null; },
    get active() { return current?.active ?? false; },
  };
}
