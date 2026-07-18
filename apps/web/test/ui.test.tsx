import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge, Button, EmptyState, ErrorState, ListSkeleton } from '@/components/ui';

describe('Button', () => {
  it('maps variants to the token .btn classes', () => {
    const { rerender } = render(<Button>Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn');

    rerender(<Button variant="danger">Del</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn', 'danger');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn', 'ghost');
  });

  it('defaults type to button so it never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Badge', () => {
  it('applies the tone as an extra pill class', () => {
    render(<Badge tone="HIGH">HIGH</Badge>);
    expect(screen.getByText('HIGH')).toHaveClass('pill', 'HIGH');
  });
});

describe('EmptyState', () => {
  it('renders the title and hint', () => {
    render(<EmptyState title="No tasks yet" hint="Add one above" />);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.getByText('Add one above')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('shows the message and no button without onRetry', () => {
    render(<ErrorState message="Failed to load" />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Failed to load" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ListSkeleton', () => {
  it('renders the requested number of placeholder rows', () => {
    const { container } = render(<ListSkeleton rows={4} />);
    expect(container.querySelectorAll('.task')).toHaveLength(4);
  });
});
