import { redirect } from 'next/navigation';

/** Life is no longer a section; its pages live under Everything. */
export default function Page() {
  redirect('/everything');
}
