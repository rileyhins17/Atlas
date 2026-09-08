import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsSection } from '@/components/panels/SettingsSection';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/settings');
  Element.prototype.scrollIntoView = vi.fn();
});

it('opens the requested section when the hash changes on the same page', () => {
  render(<SettingsSection id="routine" title="Your week"><p>Routine editor</p></SettingsSection>);
  expect(screen.queryByText('Routine editor')).toBeNull();
  window.history.replaceState({}, '', '/settings#routine');
  fireEvent(window, new HashChangeEvent('hashchange'));
  expect(screen.getByText('Routine editor')).toBeTruthy();
});

it('keeps a valid controlled region id while a section is closed', () => {
  render(<SettingsSection id="routine" title="Your week"><p>Routine editor</p></SettingsSection>);
  const button = screen.getByRole('button', { name: 'Your week' });
  expect(document.getElementById(button.getAttribute('aria-controls')!)).not.toBeNull();
  expect(screen.queryByText('Routine editor')).toBeNull();
});
