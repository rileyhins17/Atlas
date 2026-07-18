import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '@/components/ThemeToggle';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('toggles the document theme and persists the choice', async () => {
    render(<ThemeToggle />);

    // Mounts to reflect the current (default dark) theme.
    const button = await screen.findByRole('button', { name: 'Switch to light theme' });

    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('atlas-theme')).toBe('light');

    // Now it offers the way back.
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('atlas-theme')).toBe('dark');
  });
});
