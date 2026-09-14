import { theaterCover, theaterBody } from './immersive-theater.mjs?v=20260915-venue-map';
import { houseCover, houseBody } from './immersive-house.mjs?v=20260915-venue-map';
import { ribbonCover, ribbonBody } from './immersive-ribbon.mjs?v=20260915-venue-map';

const renderers = {
  'paper-theater': [theaterCover, theaterBody],
  'memory-house': [houseCover, houseBody],
  ribbon: [ribbonCover, ribbonBody],
};
export const immersiveCover = (id, thumbnail = false) => renderers[id]?.[0](thumbnail) || null;
export const immersiveBody = (selection, parts) => renderers[selection.templateId]?.[1](selection, parts) || null;
