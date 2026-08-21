import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryState, type QueryLike } from '@/components/ui/QueryState';

/**
 * The four states of every list surface, in one place. The ordering is the part
 * worth pinning: a failed query has no data, so asking "is it empty" of a result
 * that never arrived reports "nothing here" for what is actually a broken
 * request. That exact confusion, in a different component, is what once put the
 * first-run setup wizard over an established account's day.
 */
const q = <T,>(over: Partial<QueryLike<T>> = {}): QueryLike<T> => ({
  isPending: false,
  isError: false,
  error: null,
  data: {} as T,
  refetch: vi.fn(),
  ...over,
});

const render4 = (query: QueryLike, empty?: React.ReactNode) =>
  render(
    <QueryState query={query} errorFallback="Failed to load" skeleton={<p>loading</p>} empty={empty}>
      <p>content</p>
    </QueryState>,
  );

describe('QueryState', () => {
  it('shows the skeleton while pending, and nothing else', () => {
    render4(q({ isPending: true }));
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('shows content when the query succeeded and is not empty', () => {
    render4(q());
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('shows the empty state instead of content', () => {
    render4(q(), <p>nothing yet</p>);
    expect(screen.getByText('nothing yet')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('prefers the ERROR state over the empty state', () => {
    // The dangerous case: a failed query has no rows, so an empty-first order
    // would tell the user they have nothing rather than that loading broke.
    render4(q({ isError: true, error: new Error('boom') }), <p>nothing yet</p>);
    expect(screen.queryByText('nothing yet')).not.toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(screen.getByText(/boom|Failed to load/)).toBeInTheDocument();
  });

  it('prefers PENDING over both, so a refetch never flashes "nothing here"', () => {
    render4(q({ isPending: true, isError: true }), <p>nothing yet</p>);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('nothing yet')).not.toBeInTheDocument();
  });

  it('offers a retry wired to the query', async () => {
    const refetch = vi.fn();
    render4(q({ isError: true, error: new Error('boom'), refetch }));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('wraps whichever state is shown when given a wrapper', () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <div data-testid="wrap">{children}</div>
    );
    render(
      <QueryState
        query={q({ isPending: true })}
        errorFallback="Failed to load"
        skeleton={<p>loading</p>}
        wrapper={Wrapper}
      >
        <p>content</p>
      </QueryState>,
    );
    expect(screen.getByTestId('wrap')).toContainElement(screen.getByText('loading'));
  });

  it('hands the resolved data to the children function', () => {
    render(
      <QueryState
        query={q<{ name: string }>({ data: { name: 'Ada' } })}
        errorFallback="Failed to load"
        skeleton={<p>loading</p>}
      >
        {(d) => <p>hello {d.name}</p>}
      </QueryState>,
    );
    expect(screen.getByText('hello Ada')).toBeInTheDocument();
  });

  it('lets the empty state be decided FROM the data, which is the whole point', () => {
    // Progress asks "is there any activity in this window?" — a question about
    // the shape of the response, not a row count the caller already has. The
    // node form is evaluated while data is still possibly-undefined, so this
    // check could not have been hoisted out of the panel without the function.
    render(
      <QueryState
        query={q<number[]>({ data: [0, 0, 0] })}
        errorFallback="Failed to load"
        skeleton={<p>loading</p>}
        empty={(d) => d.every((n) => n === 0) && <p>nothing yet</p>}
      >
        {(d) => <p>sum {d.reduce((a, b) => a + b, 0)}</p>}
      </QueryState>,
    );
    expect(screen.getByText('nothing yet')).toBeInTheDocument();
  });

  it('keeps waiting when a settled query still has no data, rather than claiming empty', () => {
    // Not reachable through TanStack's own contract, but the render-prop form
    // has nothing to call. Inventing "you have nothing" from a value that never
    // arrived is exactly the failure the error-before-empty order exists to stop.
    render4(q({ data: undefined }), <p>nothing yet</p>);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('nothing yet')).not.toBeInTheDocument();
  });
});
