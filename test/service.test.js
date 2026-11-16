import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createService, guidPattern } from '../lib/service.js';
import { handle } from '../lib/http.js';

function fixture() {
  const rows = new Map();
  const store = {
    async create(hash) { const row = { tasks: [], revision: 0, createdAt: new Date().toISOString() }; rows.set(hash, row); return structuredClone(row); },
    async find(hash) { return structuredClone(rows.get(hash) || null); },
    async update(hash, revision, tasks) { const row = rows.get(hash); if (!row || row.revision !== revision) return null; row.tasks = tasks; row.revision++; return structuredClone(row); }
  };
  const service = createService(store);
  const call = (guid, method = 'GET', body) => service({ action: 'tasks', method, authorization: guid ? 'Bearer ' + guid : '', body });
  const create = async () => (await service({ action: 'profile', method: 'POST' })).body.guid;
  return { rows, service, call, create };
}
function task(text = 'Подготовить отчёт') { return { id: randomUUID(), text, done: false, createdAt: '2026-11-16T12:00:00.000Z', completedAt: null }; }

test('new GUID is random; only its hash is stored; unknown GUID never creates a user', async () => {
  const { create, rows, call } = fixture();
  const a = await create(), b = await create();
  assert.match(a, guidPattern); assert.notEqual(a, b);
  assert.equal(rows.size, 2);
  for (const hash of rows.keys()) { assert.equal(hash.length, 64); assert.notEqual(hash, a); }
  assert.equal((await call()).status, 401);
  assert.equal((await call('not-a-guid')).status, 401);
  assert.equal((await call(randomUUID())).status, 404);
  assert.equal(rows.size, 2);
});

test('another device can reopen the same user; users cannot read or overwrite each other', async () => {
  const { call, create } = fixture(); const a = await create(), b = await create();
  const saved = task();
  assert.equal((await call(a, 'PUT', { revision: 0, tasks: [saved] })).status, 200);
  assert.deepEqual((await call(a.toUpperCase())).body.tasks, [saved]);
  assert.deepEqual((await call(b)).body.tasks, []);
  await call(b, 'PUT', { revision: 0, tasks: [task('Другой список')] });
  assert.deepEqual((await call(a)).body.tasks, [saved]);
});

test('stale device cannot silently overwrite newer data', async () => {
  const { call, create } = fixture(); const guid = await create(); const saved = task();
  await call(guid, 'PUT', { revision: 0, tasks: [saved] });
  const conflict = await call(guid, 'PUT', { revision: 0, tasks: [] });
  assert.equal(conflict.status, 409);
  assert.deepEqual((await call(guid)).body.tasks, [saved]);
  assert.equal((await call(guid, 'PUT', { revision: 1, tasks: [] })).status, 200);
});

test('dates survive completion, reopening, removal and restoration', async () => {
  const { call, create } = fixture(); const guid = await create(); const saved = task();
  const done = { ...saved, done: true, completedAt: '2026-11-17T13:20:00.000Z' };
  await call(guid, 'PUT', { revision: 0, tasks: [done] });
  assert.deepEqual((await call(guid)).body.tasks, [done]);
  await call(guid, 'PUT', { revision: 1, tasks: [] });
  await call(guid, 'PUT', { revision: 2, tasks: [done] });
  assert.deepEqual((await call(guid)).body.tasks, [done]);
  await call(guid, 'PUT', { revision: 3, tasks: [{ ...saved, completedAt: null }] });
  assert.equal((await call(guid)).body.tasks[0].completedAt, null);
});

test('invalid payloads and duplicate IDs are rejected without changing saved tasks', async () => {
  const { call, create } = fixture(); const guid = await create(); const valid = task();
  const invalid = [null, {}, { revision: -1, tasks: [] }, { revision: 0, tasks: [valid, valid] }, { revision: 0, tasks: [task(' ')] }, { revision: 0, tasks: [task('x'.repeat(251))] }, { revision: 0, tasks: [{ ...valid, completedAt: 'invalid' }] }, { revision: 0, tasks: [{ ...valid, done: false, completedAt: '2026-11-17T12:00:00Z' }] }, { revision: 0, tasks: Array.from({ length: 501 }, () => task()) }];
  for (const body of invalid) assert.equal((await call(guid, 'PUT', body)).status, 400);
  assert.deepEqual((await call(guid)).body.tasks, []);
});

test('legacy tasks with unknown dates remain importable; extra fields are discarded', async () => {
  const { call, create } = fixture(); const guid = await create(); const old = { ...task(), createdAt: null, completedAt: null, debug: 'never persist' };
  const result = await call(guid, 'PUT', { revision: 0, tasks: [old] });
  assert.equal(result.status, 200); assert.equal(result.body.tasks[0].createdAt, null); assert.equal(result.body.tasks[0].debug, undefined);
});

test('HTTP layer rejects unsupported methods and malformed/oversized JSON; responses are never cached', async () => {
  async function invoke(method, body, contentType = 'application/json') {
    let output; const headers = {};
    const response = { setHeader: (key, value) => { headers[key] = value; }, end: value => { output = JSON.parse(value); } };
    await handle({ method, body, headers: { 'content-type': contentType } }, response, 'tasks');
    assert.equal(headers['Cache-Control'], 'no-store');
    return { status: response.statusCode, output, headers };
  }
  assert.equal((await invoke('DELETE')).status, 405);
  assert.equal((await invoke('PUT', '{}', 'text/plain')).status, 415);
  assert.equal((await invoke('PUT', '{')).status, 400);
  assert.equal((await invoke('PUT', 'x'.repeat(512001))).status, 413);
});
