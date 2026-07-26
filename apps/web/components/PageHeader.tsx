import type { ReactNode } from 'react';

/** A page's title + optional warm one-line subtitle, and an optional action. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h2 className="page-title">{title}</h2>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {action ? <div className="page-head-action">{action}</div> : null}
    </header>
  );
}
