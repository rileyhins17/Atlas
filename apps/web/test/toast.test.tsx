import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/ui/Toast';

function Trigger() {
  const { toast } = useToast();
  return (
    <button onClick={() => toast('Saved', 'success')}>fire</button>
  );
}

describe('Toast', () => {
  it('shows a toast with its tone class, then auto-dismisses', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByText('fire'));

      // The message sits in a <span> so an optional action button can sit
      // beside it, so assert against the toast element itself.
      const label = screen.getByText('Saved');
      expect(label).toBeInTheDocument();
      expect(label.closest('.toast')).toHaveClass('toast', 'success');

      // TTL is 4s; after it, the toast is gone.
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws when used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
