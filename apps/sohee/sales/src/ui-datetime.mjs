// Mantine returns a wall-clock string. Preserve the Korea-time input contract;
// never parse with Date/toISOString (which would apply the browser's timezone).
export function toLocalMinute(value) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) return '';
  return value.replace(' ', 'T').slice(0, 16);
}
