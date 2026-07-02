// @ts-nocheck
// layout_analysis fixture: nested flex without min-h-0, a fixed z-50 modal,
// and a selectable `.results` node for the sizing constraint chain.
export function Panel() {
  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 shrink-0">Head</header>
      <main className="flex flex-col flex-1">
        <div className="results overflow-y-auto flex-1">List</div>
      </main>
      <div className="modal fixed z-50">Modal</div>
      <aside className="tip absolute top-0">Tip</aside>
    </div>
  );
}
