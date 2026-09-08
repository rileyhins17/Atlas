# Overnight events in the mobile agenda

The reviewed Week PNGs from run 34265013675 showed an event from 11:52 PM to
1:52 AM only under its starting day, with the next day saying no events were
scheduled. The new component regression reproduced that one-row result before
the fix; it now requires two rows and continuation labels.

Shared `agendaDays` computes overlaps against the supplied calendar-day
boundaries using addDays, not fixed millisecond increments. End times are
exclusive, so an event ending exactly at midnight does not occupy the next
day. Events beginning before the visible range can still occupy a visible day.
The existing event object is preserved for editing from either segment.

The UI shows From/Until times and previous/next-day continuation labels. The
existing mobile browser case now seeds an overnight event on Tuesday of its
visible week and asserts both Wednesday/Tuesday segments in light and dark,
alongside the existing geometry, accessibility and editing assertions.

Focused verification passed three component cases and two new shared cases.
Full local gates and CI/browser results are recorded with the commit. The new
PNG result still requires inspection. Depends on unmerged invited-access work
through 0cd22ea; no production changes or additional migration are included.
