import { redirect } from 'next/navigation';

// The app lives on section routes (/today, /habits, …); the root just lands
// on the default section. Auth is handled inside the dashboard shell.
export default function Home() {
  redirect('/today');
}
