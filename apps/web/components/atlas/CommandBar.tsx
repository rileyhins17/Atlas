'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  BookOpen,
  Calendar,
  CircleHelp,
  Flame,
  History,
  Home,
  ListTodo,
  Loader2,
  Send,
  Settings,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { useBrainDump } from '@/lib/hooks/ai';
import { useToast } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { Kbd } from '@/components/ui/Kbd';
import { useAtlasUi } from './AtlasUiProvider';

const DESTINATIONS = [
  { href: '/today', label: 'Home', icon: Home, keywords: 'home today dashboard' },
  { href: '/tasks', label: 'Tasks', icon: ListTodo, keywords: 'tasks todo' },
  { href: '/calendar', label: 'Calendar', icon: Calendar, keywords: 'calendar events schedule' },
  { href: '/habits', label: 'Habits', icon: Flame, keywords: 'habits streaks' },
  { href: '/journal', label: 'Journal', icon: BookOpen, keywords: 'journal mood diary' },
  { href: '/notes', label: 'Notes', icon: StickyNote, keywords: 'notes memory facts' },
  { href: '/timeline', label: 'Timeline', icon: History, keywords: 'timeline story history log' },
  { href: '/settings', label: 'Settings', icon: Settings, keywords: 'settings account google' },
] as const;

interface Item {
  id: string;
  icon: typeof Home;
  title: string;
  hint?: string;
  run: () => void;
}

/** Friendly summary of what brain-dump filed, e.g. "1 task, 1 journal entry". */
export function summarizeToolRuns(names: string[]): string {
  const labels: Record<string, string> = {
    'tasks.create': 'task',
    'tasks.complete': 'task completed',
    'habits.log': 'habit check-in',
    'journal.add': 'journal entry',
    'notes.remember': 'note',
    'calendar.add': 'event',
    'ai.ask_question': 'question for you',
  };
  const countByLabel = new Map<string, number>();
  for (const name of names) {
    const label = labels[name] ?? name;
    countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
  }
  if (countByLabel.size === 0) return 'Nothing to file';
  return [...countByLabel]
    .map(([label, n]) => (n > 1 ? `${n} ${label}s` : `1 ${label}`))
    .join(', ');
}

/**
 * The ⌘K omni-bar — Atlas's primary input. Type anything:
 * capture (default) routes messy input through brain-dump into the right
 * domains; "?…" asks the AI in the chat rail; plain words also fuzzy-match
 * section jumps.
 */
export function CommandBar() {
  const { commandOpen, setCommandOpen, openChat } = useAtlasUi();
  const router = useRouter();
  const brainDump = useBrainDump();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset per open so a stale query never flashes.
  useEffect(() => {
    if (commandOpen) {
      setQuery('');
      setActive(0);
    }
  }, [commandOpen]);

  const trimmed = query.trim();
  const isAsk = trimmed.startsWith('?');
  const askText = trimmed.replace(/^\?\s*/, '');

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    const go = (href: string) => () => {
      setCommandOpen(false);
      router.push(href);
    };

    if (isAsk) {
      list.push({
        id: 'ask',
        icon: Sparkles,
        title: askText ? `Ask Atlas: “${askText}”` : 'Ask Atlas anything',
        hint: 'opens chat',
        run: () => {
          if (askText) openChat(askText);
        },
      });
      return list;
    }

    const q = trimmed.toLowerCase();
    const navMatches = DESTINATIONS.filter(
      (d) => q.length > 0 && (d.label.toLowerCase().startsWith(q) || d.keywords.includes(q)),
    );

    if (trimmed.length > 0) {
      list.push({
        id: 'capture',
        icon: Send,
        title: `Capture: “${trimmed}”`,
        hint: 'Atlas files it for you',
        run: () => {
          const text = trimmed;
          brainDump.mutate(text, {
            onSuccess: (res) => {
              const ran = res.toolExecutions.filter((t) => t.ok).map((t) => t.name);
              toast(
                ran.length > 0 ? `Filed: ${summarizeToolRuns(ran)}` : res.content.slice(0, 140),
                'success',
              );
            },
            onError: (err) => toast(errorMessage(err, 'Atlas could not file that'), 'error'),
          });
          setCommandOpen(false);
        },
      });
      list.push({
        id: 'ask-suffix',
        icon: Sparkles,
        title: `Ask Atlas: “${trimmed}”`,
        hint: 'opens chat',
        run: () => openChat(trimmed),
      });
    }

    for (const d of navMatches.length > 0 || trimmed.length > 0 ? navMatches : DESTINATIONS) {
      list.push({
        id: d.href,
        icon: d.icon,
        title: trimmed.length > 0 ? `Go to ${d.label}` : d.label,
        run: go(d.href),
      });
    }
    return list;
  }, [trimmed, isAsk, askText, brainDump, openChat, router, setCommandOpen, toast]);

  // Clamp the active row when the list shrinks.
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  }

  // Keep the active row visible while arrowing.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <RadixDialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content
          className="command-bar"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <RadixDialog.Title className="sr-only">Atlas command bar</RadixDialog.Title>
          <div className="command-input-row">
            {brainDump.isPending ? (
              <Loader2 size={18} className="spin" aria-hidden />
            ) : (
              <Sparkles size={18} aria-hidden style={{ color: 'var(--brand)' }} />
            )}
            <input
              ref={inputRef}
              className="command-input"
              placeholder="Type anything — a task, a thought, “? a question”…"
              aria-label="Command input"
              role="combobox"
              aria-expanded
              aria-controls="command-results"
              aria-activedescendant={items[active] ? `command-item-${items[active].id}` : undefined}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <Kbd>esc</Kbd>
          </div>
          <div
            className="command-results"
            id="command-results"
            role="listbox"
            aria-label="Results"
            ref={listRef}
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  id={`command-item-${item.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`command-item ${i === active ? 'active' : ''}`}
                  onClick={item.run}
                  onMouseMove={() => setActive(i)}
                >
                  <Icon size={16} aria-hidden className="command-item-icon" />
                  <span className="command-item-title">{item.title}</span>
                  {item.hint ? <span className="command-item-hint">{item.hint}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="command-footer">
            <span className="row" style={{ gap: 6 }}>
              <CircleHelp size={13} aria-hidden />
              Atlas routes what you type — tasks, events, journal, notes.
            </span>
            <span className="row" style={{ gap: 10 }}>
              <span>
                <Kbd>↑↓</Kbd> navigate
              </span>
              <span>
                <Kbd>↵</Kbd> run
              </span>
            </span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
