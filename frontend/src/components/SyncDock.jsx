import { useEffect, useState } from 'react';

// A floating pill that takes over the hero's sync controls once the hero scrolls away.
export default function SyncDock({ watchRef, liveCount, lastUpdated, intervalMs, onRefresh }) {
  const [visible, setVisible] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const target = watchRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchRef]);

  return (
    <div className="sync-dock" data-visible={visible ? '' : undefined} aria-hidden={!visible} inert={!visible}>
      <span className="sync-dock-live" data-numeric>
        {liveCount > 0 && <span className="pulse-dot" />}{liveCount} LIVE
      </span>
      <span className="sync-dock-timer">
        <span className="sync-dock-label">NEXT SYNC</span>
        <span className="sync-dock-bar">
          {/* Re-keyed on every sync so the fill restarts from empty. */}
          <span key={lastUpdated ? lastUpdated.getTime() : 0} className="sync-dock-fill"
            style={{ '--countdown': `${intervalMs}ms` }} />
        </span>
      </span>
      <button type="button" className="sync-dock-refresh" aria-label="Refresh games now"
        data-spinning={spinning ? '' : undefined}
        onClick={() => { setSpinning(true); onRefresh(); }}
        onAnimationEnd={() => setSpinning(false)}>↻</button>
    </div>
  );
}
