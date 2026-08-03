import { redirect } from 'next/navigation';

/** Progress and History merged into one "Looking back" screen. */
export default function Page() {
  redirect('/looking-back');
}
