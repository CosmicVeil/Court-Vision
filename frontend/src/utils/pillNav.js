export function getIndicatorGeometry(tabs, index) {
  if (!Number.isInteger(index) || index < 0 || index >= tabs.length) return null;
  return { x: tabs[index].offsetLeft, width: tabs[index].offsetWidth };
}

export function getNextTabIndex(current, key, count) {
  if (!Number.isInteger(current) || current < 0 || current >= count) return null;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current + count - 1) % count;
  return null;
}
