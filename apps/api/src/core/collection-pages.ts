import { PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';

const COLLECTION_PAGE_SIZE = 250;
const MAX_COLLECTION_ROWS = 10_000;
const MAX_COLLECTION_BYTES = 8 * 1024 * 1024;

export interface CollectionPage {
  take: number;
  cursor?: { id: string };
  skip?: number;
}

/** Read a complete bounded collection without silently dropping a final page.
 * Callers retain owner filters and order by their existing fields plus unique id.
 * Cursor I/O is necessarily sequential; this is one query per page, not per row.
 * Large exports use AccountService's streaming path instead of this accumulator.
 */
export async function readCollection<T extends { id: string }>(
  fetchPage: (page: CollectionPage) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: { id: string } | undefined;
  let bytes = 0;
  for (;;) {
    const take = Math.min(COLLECTION_PAGE_SIZE, MAX_COLLECTION_ROWS + 1 - rows.length);
    const page = await fetchPage({ take, ...(cursor ? { cursor, skip: 1 } : {}) });
    if (page.length > take) throw new ServiceUnavailableException('Collection page exceeded its limit');
    if (rows.length + page.length > MAX_COLLECTION_ROWS) {
      throw new PayloadTooLargeException('Collection exceeds the safe read limit; use a smaller window or account export');
    }
    for (const row of page) {
      if (typeof row.id !== 'string' || seen.has(row.id)) {
        throw new ServiceUnavailableException('Collection changed during pagination; retry the request');
      }
      bytes += Buffer.byteLength(JSON.stringify(row, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ), 'utf8');
      if (bytes > MAX_COLLECTION_BYTES) {
        throw new PayloadTooLargeException('Collection exceeds the safe read limit; use a smaller window or account export');
      }
      seen.add(row.id);
      rows.push(row);
    }
    if (page.length < take) return rows;
    cursor = { id: page[page.length - 1]!.id };
  }
}
