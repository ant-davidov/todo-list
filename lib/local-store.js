import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Used only by server.cjs --local, never by the deployed API functions.
export function localStore(filename) {
  function read() {
    if (!existsSync(filename)) return { profiles: {} };
    const data = JSON.parse(readFileSync(filename, 'utf8'));
    if (!data || !data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles)) throw new Error('Invalid local task store');
    return data;
  }
  function save(data) {
    mkdirSync(dirname(filename), { recursive: true });
    const temporary = filename + '.tmp';
    writeFileSync(temporary, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, filename);
  }
  return {
    create(hash) {
      const data = read();
      const row = { tasks: [], revision: 0, createdAt: new Date().toISOString() };
      data.profiles[hash] = row; save(data); return structuredClone(row);
    },
    find(hash) { return read().profiles[hash] || null; },
    update(hash, revision, tasks) {
      const data = read(), row = data.profiles[hash];
      if (!row || row.revision !== revision) return null;
      row.tasks = tasks; row.revision++; save(data); return structuredClone(row);
    }
  };
}
