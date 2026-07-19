import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heatmap, Kbd, ProgressRing, Sparkline } from '../components/ui';
import { summarizeToolRuns } from '../components/atlas/CommandBar';
import { localDayKey } from '../lib/dates';

describe('Kbd', () => {
  it('renders a kbd element with the chip class', () => {
    render(<Kbd>⌘K</Kbd>);
    const el = screen.getByText('⌘K');
    expect(el.tagName).toBe('KBD');
    expect(el.className).toContain('kbd');
  });
});

describe('ProgressRing', () => {
  it('is exposed as a named image and clamps overflow to a full arc', () => {
    const { container } = render(<ProgressRing value={1.7} label="Gym: done" />);
    expect(screen.getByRole('img', { name: 'Gym: done' })).toBeInTheDocument();
    const arc = container.querySelector('[data-testid="ring-arc"]');
    // Clamped to 1 → zero dash offset (full circle drawn).
    expect(arc?.getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('draws a partial arc for partial progress', () => {
    const { container } = render(<ProgressRing value={0.5} label="Half" />);
    const arc = container.querySelector('[data-testid="ring-arc"]');
    const offset = Number(arc?.getAttribute('stroke-dashoffset'));
    const dash = Number(arc?.getAttribute('stroke-dasharray'));
    expect(offset).toBeCloseTo(dash / 2, 5);
  });
});

describe('Sparkline', () => {
  it('renders a line + endpoint dot for a series', () => {
    const { container } = render(<Sparkline points={[1, 3, 2]} label="Mood trend" />);
    expect(screen.getByRole('img', { name: 'Mood trend' })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="spark-line"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="spark-dot"]')).toBeInTheDocument();
  });

  it('draws no line for a single point (dot only)', () => {
    const { container } = render(<Sparkline points={[4]} label="One entry" />);
    expect(container.querySelector('[data-testid="spark-line"]')).toBeNull();
    expect(container.querySelector('[data-testid="spark-dot"]')).toBeInTheDocument();
  });
});

describe('Heatmap', () => {
  it('maps counts to intensity levels against the target', () => {
    const today = localDayKey(new Date());
    const { container } = render(
      <Heatmap counts={new Map([[today, 2]])} target={2} weeks={2} label="Check-ins" />,
    );
    expect(screen.getByRole('img', { name: 'Check-ins' })).toBeInTheDocument();
    // 14 cells over 2 weeks; today at full intensity.
    const cells = container.querySelectorAll('.heatmap-cell');
    expect(cells.length).toBe(14);
    const full = container.querySelectorAll('[data-level="3"]');
    expect(full.length).toBe(1);
  });

  it('marks days after today as future', () => {
    const { container } = render(<Heatmap counts={new Map()} weeks={1} label="Empty" />);
    // The current week always contains today; any trailing days are future.
    const future = container.querySelectorAll('[data-level="future"]').length;
    const day = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
    expect(future).toBe(6 - day);
  });
});

describe('summarizeToolRuns', () => {
  it('groups and pluralizes tool names into friendly labels', () => {
    expect(
      summarizeToolRuns(['tasks.create', 'tasks.create', 'journal.add']),
    ).toBe('2 tasks, 1 journal entry');
  });
  it('passes unknown tools through and handles empty runs', () => {
    expect(summarizeToolRuns(['custom.tool'])).toBe('1 custom.tool');
    expect(summarizeToolRuns([])).toBe('Nothing to file');
  });
});
