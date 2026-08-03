import { redirect } from 'next/navigation';

/** Money is no longer a top-level section. The page and its data are untouched. */
export default function Page() {
  redirect('/finance');
}
