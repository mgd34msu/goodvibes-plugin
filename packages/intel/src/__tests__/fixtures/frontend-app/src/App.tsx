// @ts-nocheck
// component_tree fixture: bare tree + state / events / attributes annotations.
// Known answers are asserted in component_tree.test.ts.
import { useState } from 'react';
import SearchBox from './SearchBox';
import Counter from './Counter';

export function App() {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <SearchBox value={query} onChange={setQuery} />
      <Counter count={count} />
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <div onClick={() => setCount(0)}>Reset</div>
      <img src="/logo.png" />
    </div>
  );
}
