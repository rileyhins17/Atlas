import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InstallPrompt } from '@/components/InstallPrompt';

const BANNER = /Install Atlas/;

beforeEach(() => localStorage.clear());

describe('InstallPrompt', () => {
  it('stays hidden until the browser fires beforeinstallprompt', () => {
    render(<InstallPrompt />);
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    expect(screen.getByText(BANNER)).toBeInTheDocument();
  });

  it('"Not now" hides it and remembers the dismissal', () => {
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(localStorage.getItem('atlas-install-dismissed')).toBe('1');
  });

  it('never appears again once dismissed', () => {
    localStorage.setItem('atlas-install-dismissed', '1');
    render(<InstallPrompt />);
    act(() => {
      window.dispatchEvent(new Event('beforeinstallprompt'));
    });
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });
});
