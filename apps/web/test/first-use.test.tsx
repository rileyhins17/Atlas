import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ query: { data: [] as { id: string }[], isSuccess: true }, focus: vi.fn() }));
vi.mock('@/lib/hooks/tasks', () => ({ useTasks: () => state.query }));
vi.mock('@/lib/hooks/events', () => ({ useEvents: () => state.query }));
vi.mock('@/lib/hooks/habits', () => ({ useHabits: () => state.query }));
vi.mock('@/lib/hooks/routine', () => ({ useRoutine: () => state.query }));
vi.mock('@/components/atlas/AtlasUiProvider', () => ({ useAtlasUi: () => ({ setFocusMode: state.focus, planWindow: vi.fn() }) }));
vi.mock('@/components/onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => <p>Routine wizard</p> }));
vi.mock('@/components/home/HomeCapture', () => ({ HomeCapture: () => <textarea aria-label="Capture anything" /> }));
vi.mock('@/components/stream/TodayHeader', () => ({ BriefBlock: () => null }));
vi.mock('@/components/stream/ConnectionCard', () => ({ ConnectionCard: () => null }));
vi.mock('@/components/stream/ChangeStrip', () => ({ ChangeStrip: () => null }));
vi.mock('@/components/canvas/DayPager', () => ({ DayPager: () => null }));
vi.mock('@/components/canvas/DayOverviewView', () => ({ DayOverviewView: () => <p>Your existing day</p> }));
import { TodayView } from '@/components/canvas/TodayView';
beforeEach(() => { localStorage.removeItem('atlas.firstCapture.done'); state.query.data = []; state.query.isSuccess = true; state.focus.mockClear(); });
it('lets an empty account capture before configuring a routine or provider', () => {
  render(<TodayView />);
  expect(screen.getByRole('heading', { name: 'What do you want to get off your mind?' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Capture anything' })).toBeTruthy();
  expect(screen.queryByText('Routine wizard')).toBeNull();
});
it('keeps routine setup as an explicit first-use choice', () => {
  render(<TodayView />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up my routine first' }));
  expect(screen.getByText('Routine wizard')).toBeTruthy();
});
it('never presents first-use setup from unsuccessful account reads', () => {
  state.query.isSuccess = false;
  render(<TodayView />);
  expect(screen.getByText('Your existing day')).toBeTruthy();
  expect(screen.queryByText('Routine wizard')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Set up my routine first' })).toBeNull();
});

it('preserves the saved-item handoff when Today exits first use after cache updates', () => {
  const view = render(<TodayView />);
  expect(screen.getByRole('textbox', { name: 'Capture anything' })).toBeTruthy();
  state.query.data = [{ id: 'persisted-item' }];
  view.rerender(<TodayView />);
  expect(screen.getByRole('link', { name: 'Review my tasks' })).toBeTruthy();
  view.rerender(<TodayView />);
  expect(screen.getByRole('link', { name: 'Review my tasks' })).toBeTruthy();
  expect(localStorage.getItem('atlas.firstCapture.done')).toBe('1');
});
