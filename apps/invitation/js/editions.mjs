import { editorialCover, editorialBody, createEditorialEditions } from './editions-editorial.mjs?v=20260915-venue-map';
import { playfulCover, playfulBody, createPlayfulEditions } from './editions-playful.mjs?v=20260915-venue-map';
export const editionCover = (id, thumbnail) => editorialCover(id, thumbnail) || playfulCover(id, thumbnail);
export const editionBody = (selection, parts) => editorialBody(selection, parts) || playfulBody(selection, parts);
export function createEditions() {
  const controllers = [createEditorialEditions(), createPlayfulEditions()];
  return { mount(root) { controllers.forEach(controller => controller.mount(root)); }, dispose() { controllers.forEach(controller => controller.dispose()); } };
}
