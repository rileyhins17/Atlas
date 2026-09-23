import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GettingStarted } from '@/components/soft/GettingStarted';

/**
 * The checklist sits at the top of Today, so what it must NOT do matters as
 * much as what it shows: say "not done" before the answer has arrived, or
 * linger once the account is set up.
 */
const ok = <T,>(data: T) => ({ isSuccess: true, isPending: false, isError: false, data });
const pending = { isSuccess: false, isPending: true, isError: false, data: undefined };

let state: Record<string, unknown>;

vi.mock('@/lib/hooks/auth', () => ({ useMe: () => state.me }));
vi.mock('@/lib/hooks/tasks', () => ({ useTasks: () => state.tasks }));
vi.mock('@/lib/hooks/habits', () => ({ useHabits: () => state.habits }));
vi.mock('@/lib/hooks/fitness', () => ({ useWorkoutTemplates: () => state.templates }));
vi.mock('@/lib/hooks/wearables', () => ({ useWearablesStatus: () => state.watch }));

beforeEach(() => {
  localStorage.clear();
  state = {
    me: ok({ displayName: null }),
    tasks: ok([]),
    habits: ok([]),
    templates: ok([]),
    watch: ok({ configured: true, connected: false }),
  };
});
afterEach(() => localStorage.clear());

describe('GettingStarted', () => {
  it('lists what a new account has left to do', () => {
    render(<GettingStarted />);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getByText('0 of 5 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tell Atlas your name/ })).toHaveAttribute(
      'href',
      '/settings#you',
    );
    expect(screen.getByRole('button', { name: /Put something on today/ })).toBeInTheDocument();
  });

  it('says nothing while an answer it depends on is still pending', () => {
    state.habits = pending;
    const { container } = render(<GettingStarted />);
    expect(container).toBeEmptyDOMElement();
  });

  it('removes itself once everything is done', () => {
    state = {
      me: ok({ displayName: 'Maya' }),
      tasks: ok([{ id: 't' }]),
      habits: ok([{ id: 'h' }]),
      templates: ok([{ id: 'w' }]),
      watch: ok({ configured: true, connected: true }),
    };
    const { container } = render(<GettingStarted />);
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves the watch out on a server that cannot connect one', () => {
    state.watch = ok({ configured: false, connected: false });
    render(<GettingStarted />);
    expect(screen.getByText('0 of 4 done')).toBeInTheDocument();
    expect(screen.queryByText(/Connect your Fitbit/)).not.toBeInTheDocument();
  });

  it('stays hidden once hidden', () => {
    const first = render(<GettingStarted />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    const again = render(<GettingStarted />);
    expect(again.container).toBeEmptyDOMElement();
  });
});
