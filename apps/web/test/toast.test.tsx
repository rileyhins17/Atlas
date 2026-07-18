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

      const toast = screen.getByText('Saved');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveClass('toast', 'success');

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
