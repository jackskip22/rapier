// SPDX-License-Identifier: MIT
import {useEffect, useMemo, useRef} from 'react';
import {render, observe} from 'rapier-math';

export function Equation({source, displayMode = false}: {source: string; displayMode?: boolean}) {
  const ref = useRef<HTMLSpanElement>(null);
  const result = useMemo(() => {
    try { return render(source, {displayMode}); }
    catch { return null; }
  }, [source, displayMode]);
  const svg = result && result.errors.length === 0 ? result.svg : null;
  useEffect(() => {
    if (ref.current && svg) return observe(ref.current);
  }, [svg]); // Cleanup runs before replacement setup and on unmount.
  if (!svg) return <code>{source}</code>;
  // The server and initial client render use identical source/options. Fit only
  // after hydration; never pass authored HTML to dangerouslySetInnerHTML.
  return <span ref={ref} dangerouslySetInnerHTML={{__html: svg}} />;
}
