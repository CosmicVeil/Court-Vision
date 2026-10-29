import { getHeroWords } from '../utils/pageHero';
import './PageHero.css';

// The section anatomy from the design system: eyebrow, display heading, lead, stat strip.
// Heading words rise in once on load; each stat value is keyed by its value, so it ticks in
// only when the data behind it changes.
export default function PageHero({ eyebrow, title, accent, lead, stats = [] }) {
  const words = getHeroWords(title, accent);
  const plain = words.filter(word => !word.accent);
  const ember = words.filter(word => word.accent);
  const renderWord = word => (
    <span key={word.index} className="ph-word" style={{ '--word': word.index }}>{word.text}</span>
  );
  const withSpaces = list => list.flatMap((word, i) => (i ? [' ', renderWord(word)] : [renderWord(word)]));

  return (
    <header className="page-hero">
      {eyebrow && <span className="cv-section-badge" data-slot="eyebrow">{eyebrow}</span>}
      {/* Split words would be read one by one, so the heading gets its text as a label. */}
      <h1 className="ph-title" data-slot="display-heading" aria-label={`${title} ${accent}`.trim()}>
        <span aria-hidden="true">
          {withSpaces(plain)}
          {ember.length > 0 && <>{plain.length > 0 && ' '}<span className="text-ember">{withSpaces(ember)}</span></>}
        </span>
      </h1>
      {lead && <p className="ph-lead" data-slot="lead">{lead}</p>}
      {stats.length > 0 && (
        <dl className="ph-stats" data-slot="stat-strip">
          {stats.map(({ key, label, value }, index) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd data-numeric>
                <span key={value} className="ph-stat-value" style={{ '--stat': index }}>{value}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
