import { redirect } from 'next/navigation';

// The Timeline is no longer a separate page — it IS the home stream.
export default function TimelinePage() {
  redirect('/today');
}
