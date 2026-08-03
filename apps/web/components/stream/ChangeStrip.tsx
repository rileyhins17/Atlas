'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Wand2 } from 'lucide-react';
import { useAtlasUi } from '@/components/atlas/AtlasUiProvider';
import { useToast } from '@/components/ui';

/**
 * What Atlas changed, and how to take it back.
 *
 * Atlas can create, edit and delete across seven domains from one sentence.
 * Every one of those writes already returned a server-built inverse — but the
 * only place it was ever offered was a toast, so the record of what an AI did
 * to your data survived about four seconds. Trusting a model with delete
 * permission is only reasonable if you can see what it used it for.
 *
 * Session-scoped on purpose. An undo step is a path and a body aimed at a row
 * that existed when it was built; persisting it across reloads would offer
 * buttons that quietly fail against rows already gone.
 */
export function ChangeStrip() {
  const { changes, undoChange } = useAtlasUi();
  const { toast } = useToast();
  const qc = useQueryClient();

  if (changes.length === 0) return null;

  return (
    <section className="chg-strip" aria-label="What Atlas changed">
      <h2 className="chg-head">
        <Wand2 size={13} aria-hidden />
        What Atlas changed
      </h2>
      <ul className="chg-list">
        {changes.map((c) => (
          <li key={c.id} className={`chg-item ${c.undone ? 'undone' : ''}`}>
            <span className="chg-what">{c.summary}</span>
            {c.undone ? (
              <span className="chg-state">undone</span>
            ) : c.undo.length > 0 ? (
              <button
                type="button"
                className="chg-undo"
                aria-label={`Undo: ${c.summary}`}
                onClick={() => {
                  void undoChange(c.id).then(
                    () => {
                      toast('Undone', 'info');
                      // The reversal can touch any domain, so nothing cached
                      // is known to be current afterwards.
                      void qc.invalidateQueries();
                    },
                    () => toast('Could not undo that', 'error'),
                  );
                }}
              >
                <RotateCcw size={12} aria-hidden />
                Undo
              </button>
            ) : (
              /* Honest about the ones that cannot be reversed rather than
                 showing a button that would fail. */
              <span className="chg-state">kept</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
