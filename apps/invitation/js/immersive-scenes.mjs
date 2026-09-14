import { theaterCover, theaterBody } from './immersive-theater.mjs?v=20260914-reference-samples';
import { houseCover, houseBody } from './immersive-house.mjs?v=20260914-reference-samples';
import { ribbonCover, ribbonBody } from './immersive-ribbon.mjs?v=20260914-reference-samples';

const renderers = {
  'paper-theater': [theaterCover, theaterBody],
  'memory-house': [houseCover, houseBody],
  ribbon: [ribbonCover, ribbonBody],
};
export const immersiveCover = (id, thumbnail = false) => renderers[id]?.[0](thumbnail) || null;
export const immersiveBody = (selection, parts) => renderers[selection.templateId]?.[1](selection, parts) || null;
