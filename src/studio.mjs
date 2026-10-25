// SPDX-License-Identifier: AGPL-3.0-or-later
// All authentication remains in the user's Studio tab. No cookie reading or export.
import { connect } from './cdp.mjs';
export class StudioUnavailable extends Error {}
export async function studioRequest(kind, overrides) {
  if (!['list_tracks', 'get_tracks'].includes(kind)) throw Error('Unsupported Studio operation');
  let c;
  try {
    c = await connect();
    const expression = `window.__clovercutAudioBridge ? window.__clovercutAudioBridge.request(${JSON.stringify('/youtubei/v1/creator_music/' + kind)}, ${JSON.stringify(overrides)}) : Promise.reject(new Error('Studio bridge not connected'))`;
    const result = await c.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error('Studio session needs reconnecting');
    const data = result.result.value;
    if (!Array.isArray(data?.tracks)) throw Error('Unexpected Studio response');
    return data;
  } catch (e) { throw new StudioUnavailable('Open the authenticated Studio Audio Library and run npm run connect before syncing or playing audio.', { cause: e }); }
  finally { c?.close(); }
}
