// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCatalogue, queryTracks, audioUrl } from './catalogue.mjs';
import { studioRequest, StudioUnavailable } from './studio.mjs';
import { ensureStudio } from './session.mjs';
export function createApi(catalogue, { resolve = async id => {
  const data = await studioRequest('get_tracks', { trackIds: [id] });
  return data.tracks.find(t => t.trackId === id)?.streamingAudioUrl;
}, now = Date.now } = {}) {
  validateCatalogue(catalogue);
  const byId = new Map(catalogue.tracks.map(t => [t.id, t]));
  const cache = new Map(), pending = new Map();
  async function resolveAudio(id) {
    const saved = cache.get(id);
    if (saved && saved.expiresAt > now() + 60_000) return saved.url;
    if (pending.has(id)) return pending.get(id);
    const task = (async () => { const result = audioUrl(await resolve(id), now()); cache.set(id, result); return result.url; })();
    pending.set(id, task);
    try { return await task; } finally { pending.delete(id); }
  }
  return createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const localHost = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/;
    if (!localHost.test(req.headers.host ?? '') || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)) return send(403, { error: 'Local access only' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: 'GET required' }); }
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (url.pathname === '/health') return send(200, { status: 'ok', updatedAt: catalogue.updatedAt, counts: catalogue.counts });
      if (url.pathname === '/v1/tracks') return send(200, queryTracks(catalogue, url.searchParams));
      if (url.pathname === '/v1/facets') {
        const type = url.searchParams.get('type');
        if (type && !['music', 'sound-effect'].includes(type)) return send(400, { error: 'Invalid type' });
        const tracks = catalogue.tracks.filter(t => !type || t.type === type);
        const unique = key => [...new Set(tracks.flatMap(t => Array.isArray(t[key]) ? t[key] : t[key] ? [t[key]] : []))].sort();
        return send(200, { categories: unique('category'), genres: unique('genres'), moods: unique('moods'), instruments: unique('instruments') });
      }
      const match = /^\/v1\/tracks\/([A-Za-z0-9_-]{1,128})(?:\/(audio|download))?$/.exec(url.pathname);
      if (!match || !byId.has(match[1])) return send(404, { error: 'Track not found' });
      const track = byId.get(match[1]);
      if (!match[2]) return send(200, track);
      const location = await resolveAudio(track.id);
      res.writeHead(307, { Location: location }); res.end();
    } catch (e) {
      if (e instanceof StudioUnavailable) return send(503, { error: e.message });
      if (url.pathname === '/v1/tracks') return send(400, { error: e.message });
      return send(502, { error: 'The current audio URL could not be obtained from Studio' });
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalogue = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8'));
  const port = Number(process.env.PORT ?? 8917);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid PORT');
  createApi(catalogue).listen(port, '127.0.0.1', () => {
    console.log(`Clovercut Audio API: http://127.0.0.1:${port}`);
    ensureStudio().then(() => console.log('Studio session ready in the background.')).catch(() => console.log('Studio sign-in is needed. Run npm run login once.'));
  });
}
