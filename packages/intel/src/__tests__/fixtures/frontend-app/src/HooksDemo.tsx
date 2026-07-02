// @ts-nocheck
// hook_dependencies fixture: one hook per known issue class.
import { useEffect, useMemo, useState, useCallback } from 'react';

export function HooksDemo({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);

  // stale_closure + missing_deps: reads state `count` with an empty dep array.
  useEffect(() => {
    console.log(count);
  }, []);

  // missing_cleanup: subscribes to an event with no cleanup return.
  useEffect(() => {
    const handler = () => setCount((c) => c + 1);
    window.addEventListener('resize', handler);
  }, [setCount]);

  // unstable_deps: an inline object literal in the dep array.
  const memo = useMemo(() => userId, [{ id: userId }]);

  // clean: setCount is stable and present; no issue.
  const inc = useCallback(() => setCount((c) => c + 1), [setCount]);

  return (
    <button onClick={inc}>
      {count}
      {memo}
    </button>
  );
}
