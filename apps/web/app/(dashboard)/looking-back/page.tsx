import { redirect } from 'next/navigation';

/**
 * "Looking back" was the old name. It described when you would open the page
 * rather than what it tells you, and the page it named led with "193 things
 * happened" over six charts with no axis. Both are gone; the URL stays so a
 * bookmark or an old link still lands somewhere.
 */
export default function LookingBackPage(): never {
  redirect('/progress');
}
