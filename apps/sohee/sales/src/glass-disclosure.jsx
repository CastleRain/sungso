import React, { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Keep the analysis mounted so sorting and reading state survive presentation
// changes. This controls visibility only; it never requests or writes records.
export function GlassDisclosure({ title, children }) {
  const [glass, setGlass] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.ssSurface === 'glass');
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  useEffect(() => {
    const update = () => setGlass(document.documentElement.dataset.ssSurface === 'glass');
    window.addEventListener('sungso:surface-change', update);
    return () => window.removeEventListener('sungso:surface-change', update);
  }, []);
  return <div className="sales-glass-disclosure"><button type="button" className="sales-glass-disclosure-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{title}<ChevronDown size={16}/></button><div id={id} className="sales-comparison-body" hidden={glass && !expanded}>{children}</div></div>;
}
