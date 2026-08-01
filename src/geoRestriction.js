const ALLOWED_COUNTRY = process.env.ALLOWED_COUNTRY_CODE || 'SG';
const LOOKUP_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — keeps repeat requests from the same IP fast and avoids the free lookup service's rate limit.

const cache = new Map(); // ip -> { country, expiresAt }

function isPrivateIp(ip) {
  if (!ip) return true;
  const v = ip.replace('::ffff:', '');
  return (
    v === '127.0.0.1' ||
    v === '::1' ||
    v.startsWith('10.') ||
    v.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v)
  );
}

async function fetchCountry(ip) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
      signal: controller.signal,
    });
    const data = await res.json();
    if (data.status !== 'success' || !data.countryCode) {
      throw new Error(`Geo lookup did not return a country (response: ${JSON.stringify(data)})`);
    }
    return data.countryCode;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupCountry(ip) {
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.country;

  // One retry with a short backoff — cheap insurance against a transient blip (e.g. right
  // after a container restart) causing a false block on an otherwise-legitimate request.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const country = await fetchCountry(ip);
      cache.set(ip, { country, expiresAt: Date.now() + CACHE_TTL_MS });
      return country;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastErr;
}

// Blocks the entire app for any request whose IP doesn't resolve to ALLOWED_COUNTRY.
// Fails closed: if the free lookup service errors, times out, or can't be reached even
// after a retry, the request is blocked rather than let through. Set
// DISABLE_GEO_RESTRICTION=true as an app setting (no redeploy needed) if this ever locks
// out legitimate access.
async function requireAllowedRegion(req, res, next) {
  if (process.env.DISABLE_GEO_RESTRICTION === 'true') return next();
  if (isPrivateIp(req.ip)) return next();

  try {
    const country = await lookupCountry(req.ip);
    if (country !== ALLOWED_COUNTRY) {
      return res.status(403).type('text/plain').send('Access to this application is restricted by region.');
    }
    next();
  } catch (err) {
    console.error('Geo restriction check failed, blocking (fail-closed):', req.ip, err.message);
    res.status(403).type('text/plain').send('Access to this application is temporarily unavailable.');
  }
}

module.exports = { requireAllowedRegion };
