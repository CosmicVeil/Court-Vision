// Tell IndexNow (Bing, Yandex, Seznam...) that every sitemap URL may have changed.
// Runs daily from .github/workflows/indexnow.yml, or by hand after a deploy: `npm run indexnow`.
// It checks the key file first, because
// IndexNow rejects a key it can't fetch from the site.
import { buildIndexNowPayload } from '../src/config/seo.js';

const payload = buildIndexNowPayload();

const keyFile = await fetch(payload.keyLocation);
const served = keyFile.ok ? (await keyFile.text()).trim() : '';
if (served !== payload.key) {
  console.error(`indexnow: ${payload.keyLocation} does not serve the key yet (HTTP ${keyFile.status}). Deploy first.`);
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});
// 200 = accepted, 202 = accepted while the key is being verified; anything else is a problem.
console.log(`indexnow: submitted ${payload.urlList.length} URLs -> HTTP ${res.status}`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
