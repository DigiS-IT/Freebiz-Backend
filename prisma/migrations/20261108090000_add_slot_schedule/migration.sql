ALTER TABLE "ServiceSlot"
  ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "perSlotCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "perPersonMaxRegistration" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "weeklySchedule" JSONB,
  ADD COLUMN "timeSlots" JSONB;

ALTER TABLE "ServiceSlot"
  ADD CONSTRAINT "ServiceSlot_slotIntervalMinutes_check" CHECK ("slotIntervalMinutes" > 0),
  ADD CONSTRAINT "ServiceSlot_perSlotCount_check" CHECK ("perSlotCount" > 0),
  ADD CONSTRAINT "ServiceSlot_perPersonMaxRegistration_check" CHECK ("perPersonMaxRegistration" > 0);

ALTER TABLE "Booking"
  ADD COLUMN "registrationCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_registrationCount_check" CHECK ("registrationCount" > 0);

ALTER TABLE "Booking"
  ADD COLUMN "bookingTimeStart" TEXT,
  ADD COLUMN "bookingTimeEnd" TEXT;

CREATE INDEX "Booking_slotId_bookingDate_bookingTimeStart_status_idx"
  ON "Booking" ("slotId", "bookingDate", "bookingTimeStart", "status");
