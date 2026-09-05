-- Rate anything, once a day, on a scale you define.
--
-- Generic on purpose: the request that produced this was for a bloating rating,
-- and the next one will be soreness, anxiety or skin. The primitive is what
-- gets stored.

CREATE TABLE "trackers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    -- higher_better | lower_better | neutral. Without it a tracker cannot be
    -- summarised: "up 2 points" is good for energy and bad for pain.
    "direction" TEXT NOT NULL DEFAULT 'neutral',
    "lowLabel" TEXT,
    "highLabel" TEXT,
    -- Archived rather than deleted, so its history survives.
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trackers_pkey" PRIMARY KEY ("id")
);

-- Keyed by LOCAL day, not by timestamp: a rating is a statement about a day,
-- and which day that is depends on the user's timezone rather than on UTC.
CREATE TABLE "tracker_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tracker_entries_pkey" PRIMARY KEY ("id")
);

-- One "Bloating" per person.
CREATE UNIQUE INDEX "trackers_userId_name_key" ON "trackers"("userId", "name");
CREATE INDEX "trackers_userId_position_idx" ON "trackers"("userId", "position");

-- What makes re-rating a day an edit rather than a second row.
CREATE UNIQUE INDEX "tracker_entries_trackerId_dayKey_key" ON "tracker_entries"("trackerId", "dayKey");
CREATE INDEX "tracker_entries_userId_dayKey_idx" ON "tracker_entries"("userId", "dayKey");

ALTER TABLE "trackers" ADD CONSTRAINT "trackers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tracker_entries" ADD CONSTRAINT "tracker_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tracker_entries" ADD CONSTRAINT "tracker_entries_trackerId_fkey"
    FOREIGN KEY ("trackerId") REFERENCES "trackers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
