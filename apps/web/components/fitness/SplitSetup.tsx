'use client';

import { useState } from 'react';
import type { ProposedTemplateDTO } from '@atlas/shared';
import { Check, Sparkles, X } from 'lucide-react';
import { Button, Card, Textarea } from '@/components/ui';
import { useApplySplit, usePlanSplit } from '@/lib/hooks/fitness';

const EXAMPLE = `Push: bench press, incline dumbbell press, lateral raise, tricep pushdown
Pull: pull up, barbell row, lat pulldown, bicep curl
Legs: squat, romanian deadlift, leg press, calf raise`;

/**
 * Fitness-specific setup: describe your split once, and stop scrolling the
 * catalog forever.
 *
 * Two-phase on purpose — Atlas proposes, you accept — because a wrong match
 * puts the wrong movement in someone's training history, and that is worse
 * than asking. Matching runs locally first, so this works on a brand-new
 * account with no API key and costs nothing; the model is only consulted when
 * the text does not parse into concrete movements.
 */
export function SplitSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<ProposedTemplateDTO[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const plan = usePlanSplit();
  const apply = useApplySplit();

  function read() {
    if (plan.isPending || !text.trim()) return;
    plan.mutate(text.trim(), {
      onSuccess: (res) => {
        setProposal(res.templates);
        setNote(res.note);
        setUsedAi(res.usedAi);
      },
    });
  }

  function save() {
    if (!proposal || apply.isPending) return;
    apply.mutate(
      proposal.map((t) => ({
        name: t.name,
        exercises: t.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name })),
      })),
      { onSuccess: onDone },
    );
  }

  /** Drop one movement from a proposed day before saving. */
  function drop(dayIndex: number, exIndex: number) {
    setProposal((prev) =>
      (prev ?? [])
        .map((t, i) =>
          i === dayIndex ? { ...t, exercises: t.exercises.filter((_, j) => j !== exIndex) } : t,
        )
        .filter((t) => t.exercises.length > 0),
    );
  }

  return (
    <Card stack className="split-setup">
      <header>
        <h3 className="fit-block-title">Set up your workout days</h3>
        <p className="prog-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          List what you do on each day. Atlas matches it to real exercises and puts them at the top
          of the picker, so you never scroll for the same movement twice.
        </p>
      </header>

      {proposal === null ? (
        <>
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            aria-label="Describe your training split"
          />
          <p className="prog-muted" style={{ margin: 0, fontSize: 12 }}>
            One day per line. Shorthand is fine — &ldquo;db&rdquo;, &ldquo;ohp&rdquo;,
            &ldquo;rdl&rdquo; all resolve.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <Button onClick={read} disabled={!text.trim() || plan.isPending}>
              {plan.isPending ? 'Reading…' : 'Read my split'}
            </Button>
            <Button variant="ghost" onClick={() => setText(EXAMPLE)} disabled={plan.isPending}>
              Use the example
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          {note && (
            <p className="cal-warn" role="status">
              {note}
            </p>
          )}
          {usedAi && (
            <p className="prog-muted" style={{ margin: 0, fontSize: 12 }}>
              <Sparkles size={11} aria-hidden /> Atlas interpreted this one — check it before saving.
            </p>
          )}

          {proposal.length === 0 ? (
            <p className="prog-muted" style={{ margin: 0 }}>
              Nothing to save. Go back and list some movements.
            </p>
          ) : (
            <div className="stack" style={{ gap: 14 }}>
              {proposal.map((day, di) => (
                <section key={day.name} aria-label={day.name}>
                  <h4 className="focus-group-title" style={{ marginBottom: 6 }}>
                    {day.name}
                  </h4>
                  <ul className="split-list">
                    {day.exercises.map((ex, ei) => (
                      <li key={`${ex.name}-${ei}`} className="split-item">
                        <span className="split-name">{ex.name}</span>
                        {/* Only flag what Atlas guessed at. An exact match needs
                            no annotation — labelling everything trains people to
                            ignore the label. */}
                        {ex.match === 'new' && <span className="split-tag new">new</span>}
                        {ex.match === 'fuzzy' && <span className="split-tag fuzzy">matched</span>}
                        <button
                          type="button"
                          className="split-drop"
                          aria-label={`Remove ${ex.name} from ${day.name}`}
                          onClick={() => drop(di, ei)}
                        >
                          <X size={13} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8 }}>
            <Button onClick={save} disabled={proposal.length === 0 || apply.isPending}>
              <Check size={14} aria-hidden />{' '}
              {apply.isPending ? 'Saving…' : `Save ${proposal.length} day${proposal.length === 1 ? '' : 's'}`}
            </Button>
            <Button variant="ghost" onClick={() => setProposal(null)} disabled={apply.isPending}>
              Back
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
