// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';
const c = await connect();
const evaluate = async expression => {
  const r = await c.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error('Studio interface is unavailable; open the Audio Library and retry');
  return r.result.value;
};
try {
  const status = await evaluate('window.__clovercutAudioBridge?.status()');
  if (!process.argv.includes('--reconnect') && Array.isArray(status) && status.some(x => (typeof x === 'string' ? x : x.path).endsWith('/get_tracks')) && status.some(x => (typeof x === 'string' ? x : x.path).endsWith('/list_tracks'))) {
    console.log('Studio is already connected.');
  } else {
    await c.call('Page.enable');
    const source = await readFile(new URL('./browser-bridge.js', import.meta.url), 'utf8');
    const { identifier } = await c.call('Page.addScriptToEvaluateOnNewDocument', { source });
    try {
      await c.call('Page.reload');
      let ready = false;
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500));
        ready = await evaluate('Boolean(window.__clovercutAudioBridge?.status().some(p=>p.endsWith("/list_tracks")))');
        if (ready) break;
      }
      if (!ready) throw Error('Could not connect the Studio list request. Keep the Audio Library tab open and retry.');
      // Trigger the normal, read-only preview request. Stop it immediately.
      let played = false;
      for (let i = 0; i < 40; i++) {
        played = await evaluate(`(() => { const button = document.querySelector('ytcp-icon-button[aria-label^="Reproduzir faixa de áudio"], ytcp-icon-button[aria-label^="Play audio track"]'); if (!button) return false; document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) { e.target.pause(); } }, { capture: true, once: true }); button.click(); return true; })()`);
        if (played) break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (!played) throw Error('Open the music list in Portuguese or English and retry.');
      let playable = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 250));
        await evaluate('document.querySelectorAll("audio").forEach(a=>a.pause())');
        playable = await evaluate('window.__clovercutAudioBridge.status().some(p=>p.endsWith("/get_tracks"))');
        if (playable) break;
      }
      if (!playable) throw Error('Preview request was not captured. Play one track in Studio, then retry.');
      console.log('Studio catalogue and audio requests connected. Keep this tab open for audio URL renewal.');
    } finally { await c.call('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
  }
} finally { c.close(); }
