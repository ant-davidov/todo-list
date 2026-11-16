import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in .env.local or the environment first.');
  process.exit(1);
}
try {
  const sql = neon(process.env.DATABASE_URL);
  await sql.query(await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8'), []);
  console.log('Database schema is ready. Existing user data was preserved.');
} catch {
  console.error('Database setup failed. Check the database connection and permissions.');
  process.exit(1);
}
