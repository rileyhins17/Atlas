import { redirect } from 'next/navigation';

/** Plan became Week. Kept so an old bookmark still lands somewhere sensible. */
export default function Page() {
  redirect('/week');
}
