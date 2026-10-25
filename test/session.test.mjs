import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from '../src/session.mjs';
test('restores the persistent session without opening a visible window', async () => {
  let running = false, launches = 0, prepared = 0;
  const manager = createSessionManager({
    available: async () => running,
    launch: async options => { assert.equal(options.visible, false); launches++; running = true; return { exitCode: null }; },
    prepare: async () => { prepared++; }, wait: async () => {},
  });
  await Promise.all([manager.ensure(), manager.ensure(), manager.ensure()]);
  assert.equal(launches, 1); assert.equal(prepared, 1);
  running = false; // User closed the visible window / the browser exited.
  await manager.ensure();
  assert.equal(launches, 2); assert.equal(prepared, 2);
});
test('reuses an available session, and retries a failed reconnect', async () => {
  let attempts = 0;
  const manager = createSessionManager({ available: async () => true, launch: async () => { throw Error('must not launch another browser'); }, prepare: async () => { if (++attempts === 1) throw Error('sign-in expired'); } });
  await assert.rejects(manager.ensure(), /sign-in expired/);
  await manager.ensure(); assert.equal(attempts, 2);
});
test('a failed browser startup does not trigger visible login or loop indefinitely', async () => {
  let launches = 0;
  const manager = createSessionManager({ available: async () => false, launch: async options => { assert.equal(options.visible, false); launches++; return { exitCode: 1 }; }, prepare: async () => { throw Error('must not prepare'); }, wait: async () => {} });
  await assert.rejects(manager.ensure(), /could not start/);
  assert.equal(launches, 1);
});
