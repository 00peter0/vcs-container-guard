-- VCS Container Guard — Initial Schema v1
CREATE TABLE IF NOT EXISTS containers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image TEXT,
  state TEXT,
  status TEXT,
  created TIMESTAMPTZ,
  ports JSONB DEFAULT '[]',
  labels JSONB DEFAULT '{}',
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  docker_id TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
ALTER TABLE containers ADD CONSTRAINT containers_docker_id_unique UNIQUE (docker_id);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  repo_tags TEXT[],
  size BIGINT,
  created TIMESTAMPTZ,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scans (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  containers_scanned INTEGER DEFAULT 0,
  issues_found INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  containers_total INTEGER DEFAULT 0,
  containers_running INTEGER DEFAULT 0,
  issues_open INTEGER DEFAULT 0,
  issues_new INTEGER DEFAULT 0,
  issues_resolved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS port_bindings (
  id SERIAL PRIMARY KEY,
  container_id TEXT REFERENCES containers(id) ON DELETE CASCADE,
  host_ip TEXT,
  host_port INTEGER,
  container_port INTEGER,
  protocol TEXT DEFAULT 'tcp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  container_id TEXT REFERENCES containers(id) ON DELETE CASCADE,
  rule TEXT,
  rule_id TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  message TEXT,
  suggestion TEXT,
  detail JSONB DEFAULT '{}',
  status TEXT DEFAULT 'open',
  fingerprint TEXT,
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_detected TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  scan_id INTEGER REFERENCES scans(id),
  port_binding_id INTEGER REFERENCES port_bindings(id) ON DELETE SET NULL,
  event_type TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_fingerprint ON issues(fingerprint) WHERE fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS issue_events (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  scan_id INTEGER REFERENCES scans(id),
  event_type TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_queue (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  channel TEXT DEFAULT 'webhook',
  payload JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  event_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_issues_container ON issues(container_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
CREATE INDEX IF NOT EXISTS idx_alert_queue_status ON alert_queue(status);
CREATE INDEX IF NOT EXISTS idx_port_bindings_container ON port_bindings(container_id);
