import { neon } from '@neondatabase/serverless';

function profile(row) {
  return row ? { tasks: row.tasks, revision: row.revision, createdAt: new Date(row.created_at).toISOString() } : null;
}

export function databaseStore() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const sql = neon(process.env.DATABASE_URL);
  return {
    async create(hash) {
      const rows = await sql`INSERT INTO task_profiles (guid_hash) VALUES (${hash}) RETURNING tasks, revision, created_at`;
      return profile(rows[0]);
    },
    async find(hash) {
      const rows = await sql`SELECT tasks, revision, created_at FROM task_profiles WHERE guid_hash = ${hash}`;
      return profile(rows[0]);
    },
    async update(hash, revision, tasks) {
      const rows = await sql`UPDATE task_profiles SET tasks = ${JSON.stringify(tasks)}::jsonb, revision = revision + 1 WHERE guid_hash = ${hash} AND revision = ${revision} RETURNING tasks, revision, created_at`;
      return profile(rows[0]);
    }
  };
}
