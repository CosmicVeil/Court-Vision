import { useLayoutEffect, useRef, useState } from 'react';
import { getIndicatorGeometry, getNextTabIndex } from '../utils/pillNav';

export default function PillNav({ items, value, onChange, label, idPrefix, panelId, className, tabClassName = 'lg-tab' }) {
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const tabRefs = useRef([]);
  const [hoverIndex, setHoverIndex] = useState(null);
  const activeIndex = items.findIndex(item => item.id === value);
  const targetIndex = hoverIndex ?? activeIndex;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    const tabs = tabRefs.current.slice(0, items.length);
    const place = () => {
      const geometry = getIndicatorGeometry(tabs.map(tab => ({ offsetLeft: tab.offsetLeft, offsetWidth: tab.offsetWidth })), targetIndex);
      if (!geometry) {
        nav.removeAttribute('data-indicator-ready');
        return;
      }
      indicator.style.transform = `translateX(${geometry.x}px)`;
      indicator.style.width = `${geometry.width}px`;
      nav.setAttribute('data-indicator-ready', '');
    };
    place();
    const frame = requestAnimationFrame(() => nav.setAttribute('data-indicator-animate', ''));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (observer) {
      observer.observe(nav);
      tabs.forEach(tab => observer.observe(tab));
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [items.length, targetIndex]);

  return (
    <div ref={navRef} role="tablist" aria-label={label} data-slot="pill-nav" data-defer className={className}
      onPointerLeave={() => setHoverIndex(null)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHoverIndex(null); }}>
      {items.map((item, index) => (
        <button key={item.id} ref={element => { tabRefs.current[index] = element; }} type="button"
          role="tab" id={`${idPrefix}-tab-${item.id}`} aria-controls={panelId} aria-selected={index === activeIndex}
          tabIndex={index === activeIndex ? 0 : -1} data-indicator-target={index === targetIndex ? '' : undefined}
          className={`${tabClassName} ${index === activeIndex ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
          onPointerEnter={event => { if (event.pointerType === 'mouse') setHoverIndex(index); }}
          onFocus={() => setHoverIndex(index)}
          onKeyDown={event => {
            const next = getNextTabIndex(index, event.key, items.length);
            if (next === null) return;
            event.preventDefault();
            tabRefs.current[next]?.focus();
          }}>
          {item.label}
        </button>
      ))}
      <span ref={indicatorRef} aria-hidden="true" data-slot="pill-indicator" />
    </div>
  );
}
