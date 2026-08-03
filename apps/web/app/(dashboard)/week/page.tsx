import { CalendarPanel } from '@/components/panels/CalendarPanel';

/**
 * What is coming. The calendar already had a week scope; this makes it the
 * destination rather than something you reach by changing a setting on a page
 * you had to find first.
 */
export default function WeekPage() {
  return <CalendarPanel initialScope="week" />;
}
