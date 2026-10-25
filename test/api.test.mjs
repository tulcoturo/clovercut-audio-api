import { test } from 'node:test';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { normalizeTrack, queryTracks, audioUrl, validateCatalogue } from '../src/catalogue.mjs';
import { collectCatalogue } from '../src/sync.mjs';
import { createApi } from '../src/server.mjs';
import { StudioUnavailable } from '../src/studio.mjs';
const raw = (id, title = 'Rain') => ({ trackId: id, title, duration: { seconds: '3', nanos: 250000000 }, attributes: { category: 'AMBIENCES', genres: ['ROCK'], moods: ['CALM'] }, licenseType: 'CREATOR_MUSIC_LICENSE_TYPE_YOUTUBE' });
const effect = normalizeTrack(raw('effect-1'), 'sound-effect');
const music = normalizeTrack({ ...raw('music-1', 'Água'), artist: { name: 'Artist' }, licenseType: 'UNRECOGNIZED' }, 'music');
const catalogue = { version: 1, updatedAt: '2026-10-25T00:00:00Z', counts: { music: 1, 'sound-effect': 1 }, tracks: [effect, music] };
const signed = seconds => `https://redirector.googlevideo.com/videoplayback?expire=${seconds}&sig=synthetic-test-only`;
test('normalizes real Studio duration, type, and licence without copying credentials', () => {
  const item = normalizeTrack({ ...raw('a'), authorization: 'private', responseContext: { private: true }, streamingAudioUrl: 'private' }, 'sound-effect');
  assert.equal(item.duration, 3.25); assert.equal(item.type, 'sound-effect');
  assert.equal(item.license.requiresAttribution, false); assert.equal(normalizeTrack({...raw('cc'),licenseType:'CREATOR_MUSIC_LICENSE_TYPE_CCBY_4'},'music').license.requiresAttribution,true); assert.equal(music.license.requiresAttribution, null);
  assert.ok(!JSON.stringify(item).includes('private'));
  assert.throws(() => normalizeTrack(raw('bad/id'), 'music'));
  assert.throws(() => normalizeTrack({ ...raw('a'), duration: { seconds: '-1' } }, 'music'));
});
test('searches and filters independently of pagination', () => {
  assert.equal(queryTracks(catalogue, new URLSearchParams('q=ÁGUA')).items[0].id, 'music-1');
  assert.equal(queryTracks(catalogue, new URLSearchParams('type=sound-effect&category=AMBIENCES&durationMax=4')).total, 1);
  assert.equal(queryTracks(catalogue, new URLSearchParams('genre=ROCK&mood=CALM&limit=1')).nextOffset, 1);
  assert.equal(queryTracks(catalogue, new URLSearchParams('offset=1&limit=1')).items[0].id, 'music-1');
  for (const p of ['type=unknown', 'limit=0', 'limit=201', 'offset=-1', 'offset=1.5', 'durationMin=10&durationMax=1']) assert.throws(() => queryTracks(catalogue, new URLSearchParams(p)));
});
test('rejects duplicate catalogue ids and unexpected or expired audio sources', () => {
  assert.throws(() => validateCatalogue({ ...catalogue, tracks: [effect, effect] }));
  assert.equal(audioUrl(signed(1000), 0).expiresAt, 1_000_000);
  for (const u of [signed(1), 'http://redirector.googlevideo.com/videoplayback?expire=1000', 'https://googlevideo.com.evil.test/videoplayback?expire=1000', 'https://u:p@googlevideo.com/videoplayback?expire=1000', 'https://googlevideo.com/other?expire=1000']) assert.throws(() => audioUrl(u, 0));
});
test('sync follows actual page tokens to exhaustion, not the approximate total', async () => {
  const calls=[];
  const result = await collectCatalogue(async (kind, body) => {
    calls.push(body);const sfx=!!body.filter.trackTypeIn;
    if (sfx) return { tracks: [raw('sfx')], pageInfo: {} };
    return body.pageInfo.pageToken ? { tracks: [raw('second')], pageInfo: {} }
      : { tracks: [raw('first')], pageInfo: { nextPageToken: 'page2', totalSizeInfo: { size: '1' } } };
  });
  assert.deepEqual(result.counts, { music: 2, 'sound-effect': 1 });
  assert.equal(calls[1].pageInfo.pageToken, 'page2');
});
test('incomplete or looping sync fails instead of publishing partial success', async () => {
  await assert.rejects(collectCatalogue(async () => ({ tracks: [], pageInfo: {} })), /Empty/);
  await assert.rejects(collectCatalogue(async () => ({ tracks: [raw('a')], pageInfo: { nextPageToken: 'same' } })), /stalled/);
});
async function withApi(options, run) {
  const server=createApi(catalogue, options);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try { await run('http://127.0.0.1:'+server.address().port); } finally { await new Promise(r=>server.close(r)); }
}
test('HTTP API lists tracks, facets and details and rejects invalid requests', async () => {
  await withApi({}, async base => {
    assert.equal((await (await fetch(base+'/health')).json()).status, 'ok');
    assert.equal((await (await fetch(base+'/v1/tracks?type=music')).json()).total, 1);
    assert.deepEqual((await (await fetch(base+'/v1/facets?type=sound-effect')).json()).categories, ['AMBIENCES']);
    assert.equal((await (await fetch(base+'/v1/tracks/effect-1')).json()).name, 'Rain');
    assert.equal((await fetch(base+'/v1/tracks/missing')).status, 404);
    assert.equal((await fetch(base+'/v1/tracks?limit=-2')).status, 400);
    assert.equal((await fetch(base+'/v1/tracks',{method:'POST'})).status, 405);
    assert.equal((await fetch(base+'/health',{headers:{Origin:'https://unrelated.example'}})).status, 403);
    assert.equal(await new Promise((resolve,reject)=>{get(base+'/health',{headers:{Host:'unrelated.example'}},response=>{response.resume();resolve(response.statusCode)}).on('error',reject)}),403);
  });
});
test('audio resolver caches valid URLs, renews expiry and coalesces concurrent requests', async () => {
  let now=0,calls=0;
  await withApi({now:()=>now, resolve:async()=>{calls++;await new Promise(r=>setTimeout(r,5));return signed(now/1000+120)}},async base=>{
    const responses=await Promise.all([fetch(base+'/v1/tracks/effect-1/audio',{redirect:'manual'}),fetch(base+'/v1/tracks/effect-1/download',{redirect:'manual'})]);
    assert.equal(responses[0].status,307);assert.equal(calls,1);
    await fetch(base+'/v1/tracks/effect-1/audio',{redirect:'manual'});assert.equal(calls,1);
    now=61_000;await fetch(base+'/v1/tracks/effect-1/audio',{redirect:'manual'});assert.equal(calls,2);
  });
});
test('catalogue browsing works offline while unavailable playback is explicit', async () => {
  await withApi({resolve:async()=>{throw new StudioUnavailable('Reconnect Studio')}},async base=>{
    assert.equal((await fetch(base+'/v1/tracks')).status,200);
    const response=await fetch(base+'/v1/tracks/effect-1/audio');assert.equal(response.status,503);
    assert.equal((await response.json()).error,'Reconnect Studio');
  });
});
