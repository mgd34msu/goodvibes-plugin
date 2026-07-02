// @ts-nocheck
// Uses a client-only API (useEffect) but has no "use client" directive and is
// not imported by a client component → missing_directive.
import { useEffect } from 'react';

export function Leaky() {
  useEffect(() => {
    /* no-op */
  }, []);
  return <div>leaky</div>;
}
