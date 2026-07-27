export function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// A manager's saved dashboard_layout is a list of worker ids in display
// order. Workers not in it (new hires, or no layout saved yet) sort after
// the ones that are, in a stable id order.
export function applyDashboardOrder(workerList, layout) {
  if (!layout || layout.length === 0) return workerList;
  const rank = new Map(layout.map((id, i) => [id, i]));
  return [...workerList].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
    const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
    return ra !== rb ? ra - rb : a.id - b.id;
  });
}
