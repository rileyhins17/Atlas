-- Wearables: what a Fitbit or Pixel Watch measured, via the Google Health API.
--
-- Additive only — two new tables, nothing existing is touched. Until this is
-- applied, only the wearables endpoints fail; the rest of Atlas is unaffected.

-- One LOCAL day of measurements. Every metric is nullable: missing means
-- unknown, never zero.
CREATE TABLE "wearable_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "steps" INTEGER,
    "restingHeartRate" INTEGER,
    "hrvMs" DOUBLE PRECISION,
    "sleepMinutes" INTEGER,
    "sleepStart" TIMESTAMP(3),
    "sleepEnd" TIMESTAMP(3),
    "deepMinutes" INTEGER,
    "remMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wearable_days_pkey" PRIMARY KEY ("id")
);

-- Workouts the watch recorded. Separate from "workouts", which are sets a
-- person logged and vouches for.
CREATE TABLE "wearable_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "activeMinutes" INTEGER,
    "calories" INTEGER,
    "avgHeartRate" INTEGER,
    "distanceMeters" INTEGER,
    "steps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wearable_activities_pkey" PRIMARY KEY ("id")
);

-- What makes a re-sync an update rather than a second row.
CREATE UNIQUE INDEX "wearable_days_userId_dayKey_key" ON "wearable_days"("userId", "dayKey");
CREATE UNIQUE INDEX "wearable_activities_userId_externalId_key" ON "wearable_activities"("userId", "externalId");
CREATE INDEX "wearable_activities_userId_startAt_idx" ON "wearable_activities"("userId", "startAt");

ALTER TABLE "wearable_days" ADD CONSTRAINT "wearable_days_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wearable_activities" ADD CONSTRAINT "wearable_activities_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
