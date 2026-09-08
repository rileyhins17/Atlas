import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// This check owns synthetic rows in CI's disposable container only. No env
// files are loaded and no account or embedding rows are deleted for cleanup.
const testUrl = 'postgresql://atlas:atlas@localhost:5432/atlas_test';
assert.equal(process.env.CI, 'true', 'Embedding database check is CI-only');
assert.equal(process.env.DATABASE_URL, testUrl, 'Requires the disposable CI database');
assert.equal(process.env.DIRECT_DATABASE_URL, testUrl, 'Requires the disposable CI direct URL');

const { PrismaClient } = await import('../../packages/db/dist/index.js');
const { EmbeddingService } = await import('../../apps/api/dist/modules/ai/embedding.service.js');
const { ActivityService } = await import('../../apps/api/dist/core/activity.service.js');
const db = new PrismaClient({ datasourceUrl: testUrl });
const vector = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
const batchId = randomUUID();
const owner = `embedding-owner-${batchId}`;
const other = `embedding-other-${batchId}`;
const changedOwner = `embedding-race-${batchId}`;
const makeRows = (prefix, userId, count) => Array.from({ length: count }, (_, i) => ({
  id: `${prefix}-${i}-${batchId}`, userId, ownerType: 'synthetic-ci',
  ownerId: `${prefix}-${i}-${batchId}`, content: `Synthetic ${prefix} ${i}`, model: 'pending',
}));

try {
  await db.user.createMany({ data: [owner, other, changedOwner].map(id => ({
    id, email: `${id}@example.invalid`, passwordHash: 'synthetic-no-login',
  })) });
  const rows = makeRows('batch', owner, 9);
  const foreign = makeRows('foreign', other, 1);
  await db.embedding.createMany({ data: [...rows, ...foreign] });
  let writes = 0;
  let modelCalls = 0;
  const client = {
    embedding: db.embedding,
    $executeRaw: async (query) => { writes++; return db.$executeRaw(query); },
  };
  const service = new EmbeddingService({ client }, {
    embed: async texts => { modelCalls++; return texts.map(() => vector); },
  }, new ActivityService());
  assert.deepEqual(await service.backfillPending(owner), { processed: 9, failed: 0 });
  assert.equal(writes, 1);
  assert.equal(modelCalls, 2);
  const dimensions = await db.$queryRaw`
    SELECT vector_dims(embedding) AS dimensions FROM embeddings WHERE "userId" = ${owner}
  `;
  assert.equal(dimensions.length, 9);
  assert.ok(dimensions.every(row => row.dimensions === 768));
  assert.equal((await db.embedding.findUniqueOrThrow({ where: { id: foreign[0].id } })).model, 'pending');

  const race = makeRows('race', changedOwner, 4);
  await db.embedding.createMany({ data: race });
  const racing = new EmbeddingService({ client }, {
    embed: async texts => {
      // Simulate independent edits after the service read its inference input.
      // All ids below were created by this check in this disposable database.
      await db.embedding.update({ where: { id: race[0].id, userId: changedOwner }, data: { content: 'Synthetic edited text' } });
      await db.embedding.update({ where: { id: race[1].id, userId: changedOwner }, data: { userId: other } });
      await db.embedding.update({ where: { id: race[2].id, userId: changedOwner }, data: { model: 'synthetic-concurrent-completion' } });
      return texts.map(() => vector);
    },
  }, new ActivityService());
  assert.deepEqual(await racing.backfillPending(changedOwner), { processed: 1, failed: 3 });
  const guarded = await db.$queryRaw`
    SELECT id, model, embedding IS NULL AS "noVector" FROM embeddings
    WHERE id IN (${race[0].id}, ${race[1].id}, ${race[2].id}, ${race[3].id})
  `;
  for (const row of guarded) {
    assert.equal(row.noVector, row.id !== race[3].id);
    if (row.id === race[0].id || row.id === race[1].id) assert.equal(row.model, 'pending');
    if (row.id === race[2].id) assert.equal(row.model, 'synthetic-concurrent-completion');
  }
  assert.equal(guarded.length, 4);
  process.stdout.write('Embedding batch verified: 9 rows, 2 inference chunks, 1 write, 768 dimensions; owner/content/model races preserved.\n');
} finally {
  await db.$disconnect();
}
