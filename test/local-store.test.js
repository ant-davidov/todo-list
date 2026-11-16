import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localStore } from '../lib/local-store.js';
import { createService } from '../lib/service.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'my-tasks-store-'));
  const filename = join(directory, 'tasks.json');
  t.after(() => { rmSync(filename, { force: true }); rmSync(filename + '.tmp', { force: true }); rmdirSync(directory); });
  return filename;
}

test('local tasks survive reopening storage; stale writes conflict and other users stay separate', async t => {
  const filename = fixture(t);
  const service = createService(localStore(filename));
  const profile = (await service({ action: 'profile', method: 'POST' })).body;
  const task = { id: randomUUID(), text: 'Локальная задача', done: false, createdAt: null, completedAt: null };
  const request = { action: 'tasks', method: 'PUT', authorization: 'Bearer ' + profile.guid, body: { revision: 0, tasks: [task] } };
  assert.equal((await service(request)).status, 200);
  const reopened = createService(localStore(filename));
  const saved = await reopened({ action: 'profile', method: 'GET', authorization: request.authorization });
  assert.deepEqual(saved.body.tasks, [task]);
  assert.equal((await reopened({ ...request, body: { revision: 0, tasks: [] } })).status, 409);
  const other = (await reopened({ action: 'profile', method: 'POST' })).body;
  assert.deepEqual(other.tasks, []);
  assert.equal(readFileSync(filename, 'utf8').includes(profile.guid), false);
});

test('corrupt local storage is reported without overwriting existing data', t => {
  const filename = fixture(t);
  const corrupt = '{broken';
  writeFileSync(filename, corrupt);
  assert.throws(() => localStore(filename).create('hash'));
  assert.equal(readFileSync(filename, 'utf8'), corrupt);
});
