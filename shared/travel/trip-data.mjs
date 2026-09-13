// Public contract; personal values arrive only after membership verification.
export const HOTELS = [];
export const PLACES = Object.create(null);
export const TRIP_DAYS = [];
export const DECISIONS = [];
export const TRAVEL_LOCATIONS = Object.create(null);
export const TRIP_SETTINGS = Object.create(null);
export const BUDGET_QUOTES = Object.create(null);
export const PREPARATIONS = [];
export const READINESS_SOURCES = [];
const arrays = { HOTELS, TRIP_DAYS, DECISIONS, PREPARATIONS, READINESS_SOURCES };
const objects = { PLACES, TRAVEL_LOCATIONS, TRIP_SETTINGS, BUDGET_QUOTES };
export function clearTripReference() {
  for (const target of Object.values(arrays)) target.length = 0;
  for (const target of Object.values(objects)) for (const key of Object.keys(target)) delete target[key];
}
export function hydrateTripReference(reference) {
  if (!reference || !Array.isArray(reference.TRIP_DAYS) || !reference.TRIP_DAYS.length || !Array.isArray(reference.HOTELS) || !reference.HOTELS.length || !Array.isArray(reference.DECISIONS)) throw new Error('보호된 여행 기준 자료를 확인해주세요.');
  const copy = JSON.parse(JSON.stringify(reference));
  if (copy.TRIP_DAYS.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day?.date) || !Array.isArray(day.events))) throw new Error('여행 날짜 형식을 확인해주세요.');
  clearTripReference();
  for (const [name, target] of Object.entries(arrays)) target.push(...(Array.isArray(copy[name]) ? copy[name] : []));
  for (const [name, target] of Object.entries(objects)) for (const [key, value] of Object.entries(copy[name] || {})) if (!['__proto__', 'constructor', 'prototype'].includes(key)) target[key] = value;
}
