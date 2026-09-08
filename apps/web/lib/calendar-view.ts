import { calendarWeekdayShort, calendarRangeLabel } from '@atlas/shared';
import { displayTimezone } from './dates';
export { DURATION_PRESETS, addDays, startOfWeek, weekDays, countsByDay, bucketByDay, dateFromDayKey, nextSlot, toTimeValue, combineLocal, minutesBetween, formatCalendarDuration as formatDuration, findOverlaps, nowMarkerIndex, isLive, visibleHourRange, placeDayEvents, type DayBucket, type HourWindow, type PlacedEvent } from '@atlas/shared';

export function weekdayShort(d: Date): string {
  return calendarWeekdayShort(d, displayTimezone());
}
export function rangeLabel(days: Date[]): string {
  return calendarRangeLabel(days, displayTimezone());
}
