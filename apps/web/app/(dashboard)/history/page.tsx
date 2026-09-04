import { redirect } from 'next/navigation';

/** The feed is the bottom half of Progress now, folded away. */
export default function HistoryPage(): never {
  redirect('/progress');
}
