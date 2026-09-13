/** A closed browser request must not schedule the rest of a five-year month batch. */
export function connectedHistoryMonthLoader(response, loadMonth) {
  return async (request) => {
    if (response.destroyed) throw new DOMException('History client disconnected', 'AbortError');
    // Already running monthly requests may also serve other queries through shared cache.
    // Let those finish; block new work for this disconnected history request only.
    return loadMonth(request);
  };
}
