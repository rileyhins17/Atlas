import { redirect } from 'next/navigation';

/** A section is its first tab. The bare section URL exists so the nav has a
 *  stable href and so /money is a valid thing to type or bookmark. */
export default function Page() {
  redirect('/finance');
}
