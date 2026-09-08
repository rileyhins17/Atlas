-- Entirely invented fixtures. This runs only against the CI service database.
BEGIN;
INSERT INTO users (id, email, "passwordHash", "updatedAt")
SELECT 'restore-user-' || n, 'restore-' || n || '@example.invalid', 'not-a-real-password-hash', now()
FROM generate_series(1, 2) n;

INSERT INTO tasks (id, "userId", title, "updatedAt")
SELECT 'restore-task-' || n, 'restore-user-' || (1 + n % 2), 'Synthetic task ' || n, now()
FROM generate_series(1, 7) n;

INSERT INTO journal_entries (id, "userId", "entryDate", body, "updatedAt")
SELECT 'restore-journal-' || n, 'restore-user-' || (1 + n % 2), '2026-01-01'::timestamp,
       'Synthetic journal fixture ' || n, now()
FROM generate_series(1, 5) n;

INSERT INTO workouts (id, "userId", title, "updatedAt")
SELECT 'restore-workout-' || n, 'restore-user-' || (1 + n % 2), 'Synthetic workout ' || n, now()
FROM generate_series(1, 3) n;

INSERT INTO accounts (id, "userId", name, "updatedAt")
SELECT 'restore-account-' || n, 'restore-user-' || n, 'Synthetic account ' || n, now()
FROM generate_series(1, 2) n;

INSERT INTO transactions (id, "userId", "accountId", "amountMinor", description, "postedAt")
SELECT 'restore-transaction-' || n, 'restore-user-' || (1 + n % 2),
       'restore-account-' || (1 + n % 2), -100 * n, 'Synthetic transaction ' || n, '2026-01-01'::timestamp
FROM generate_series(1, 4) n;

INSERT INTO timeline_events (id, "userId", type, source, title)
SELECT 'restore-timeline-' || n, 'restore-user-' || (1 + n % 2), 'task.created', 'tasks', 'Synthetic timeline ' || n
FROM generate_series(1, 7) n;

INSERT INTO embeddings (id, "userId", "ownerType", "ownerId", content, model, embedding)
SELECT 'restore-embedding-' || n, 'restore-user-' || n, 'journal', 'restore-journal-' || n,
       'Synthetic vector fixture', 'synthetic', ('[' || repeat('0.1,', 767) || '0.1]')::vector
FROM generate_series(1, 2) n;
COMMIT;

\ir restore-assert.sql
