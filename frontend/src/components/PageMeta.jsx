import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPageMeta } from '../config/seo';

// Find a <meta>/<link> in <head> (index.html ships the defaults), creating it if it is missing.
function headTag(tagName, attr, key) {
  let el = document.head.querySelector(`${tagName}[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement(tagName);
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  return el;
}

// Keeps <head> in step with the current route, so Google's renderer sees a title,
// description, canonical URL and robots rule specific to each page. Renders nothing.
export default function PageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const { title, description, canonical, noindex, jsonLd } = getPageMeta(pathname);
    document.title = title;
    headTag('meta', 'name', 'description').setAttribute('content', description);
    headTag('meta', 'property', 'og:title').setAttribute('content', title);
    headTag('meta', 'property', 'og:description').setAttribute('content', description);

    const canonicalLink = headTag('link', 'rel', 'canonical');
    if (canonical) {
      canonicalLink.setAttribute('href', canonical);
      headTag('meta', 'property', 'og:url').setAttribute('content', canonical);
    } else {
      canonicalLink.remove();
      document.head.querySelector('meta[property="og:url"]')?.remove();
    }

    if (noindex) headTag('meta', 'name', 'robots').setAttribute('content', 'noindex');
    else document.head.querySelector('meta[name="robots"]')?.remove();

    // The page's own structured data in one element of ours; index.html's site JSON-LD has no id and stays.
    if (jsonLd) {
      const script = headTag('script', 'id', 'page-jsonld');
      script.setAttribute('type', 'application/ld+json');
      script.textContent = JSON.stringify(jsonLd);
    } else {
      document.head.querySelector('script[id="page-jsonld"]')?.remove();
    }
  }, [pathname]);

  return null;
}
