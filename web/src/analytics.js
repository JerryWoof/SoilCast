// Cloudflare Web Analytics (cookieless). Loaded after the page load and an idle period: the beacon costs ~260 ms of
// CPU, which must not compete with the map. It still reads the page's load timings from the Performance API.
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';
const TOKEN = '{"token": "b3c30561f8f2482b9f654887fd1b6277"}';

function inject() {
  const s = document.createElement('script');
  s.defer = true;
  s.src = BEACON;
  s.dataset.cfBeacon = TOKEN;
  document.body.append(s);
}

export function loadAnalytics() {
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(inject, { timeout: 5000 }) : setTimeout(inject, 2000));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}
