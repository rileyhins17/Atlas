/** A page's title + optional warm one-line subtitle. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-head">
      <h2 className="page-title">{title}</h2>
      {subtitle ? <p className="page-sub">{subtitle}</p> : null}
    </header>
  );
}
