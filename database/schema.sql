CREATE TABLE IF NOT EXISTS task_profiles (
  guid_hash TEXT PRIMARY KEY CHECK (length(guid_hash) = 64),
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tasks) = 'array'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
