import { z } from 'zod';
import type { AiToolSpec } from '@atlas/shared';
import type { ToolOutcome, ToolUndo } from '@atlas/ai';

/**
 * One thing the model may do to a domain: what it is told the tool is (`spec`)
 * and what actually happens when it calls it (`run`), declared together.
 *
 * They used to live in two places — the spec in each domain's `*.ai.ts`, the
 * handler in one central switch in the AI module — so adding a tool meant
 * editing core, and a spec could be offered to the model with nothing behind
 * it. Pairing them makes that drift impossible by construction.
 *
 * `run` receives raw model output. It must validate with the same zod DTOs the
 * HTTP boundary uses: the model is an untrusted caller like any API client.
 */
export interface DomainTool {
  readonly spec: AiToolSpec;
  run(userId: string, args: unknown): Promise<ToolOutcome>;
}

export function defineTool(
  spec: AiToolSpec,
  run: (userId: string, args: unknown) => Promise<ToolOutcome>,
): DomainTool {
  return { spec, run };
}

/** The argument shape of every by-id tool (complete, delete, ...). */
export const ByIdInput = z.object({ id: z.string().min(1).max(64) });

/** Extend an update DTO with the id the model must name. */
export const withId = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({ id: z.string().min(1).max(64) });

// ── Undo builders ─────────────────────────────────────────────────────────
// Every path here is built from a row the server just read or wrote. The model
// never supplies a path or a body, so replaying one can only ever reach data
// the caller's own session could already reach.

export const undoDelete = (path: string, label: string): ToolUndo => ({
  label,
  method: 'DELETE',
  path,
  body: null,
});

export const undoPatch = (
  path: string,
  label: string,
  body: Record<string, unknown>,
): ToolUndo => ({ label, method: 'PATCH', path, body });

export const undoRecreate = (
  path: string,
  label: string,
  body: Record<string, unknown>,
): ToolUndo => ({ label, method: 'POST', path, body });

/**
 * Only the fields the patch actually touched, read from the row as it was.
 *
 * Restoring the whole row would clobber a field someone edited by hand between
 * the AI's change and the undo.
 */
export function touchedFields(before: object, patch: object): Record<string, unknown> {
  const row = before as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    const v = row[k];
    out[k] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return out;
}
