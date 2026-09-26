-- ===========================================================================
-- Reminder markers and one-off duration extensions
-- ===========================================================================
--
-- Two columns on "Member", both about how the priest follows up rather than
-- about the confession itself. Nothing here records what was said, to whom it
-- was confessed, or what was decided: the product's rule is that this table
-- holds attendance dates and administrative facts and nothing else, and these
-- two are administrative facts.
--
-- reminderSentAt
--   A timestamp, not a boolean, because "has been reminded" is not a useful
--   answer to the question a priest is actually asking. The question is "who do
--   I still need to chase", and the answer needs a date to reason about: a
--   reminder from last week and one from last March are not the same follow-up.
--
--   The reminder message itself is deliberately not stored. It already exists
--   in the parish's settings, and it already exists in the recipient's
--   WhatsApp, where the priest typed it and where the provider can see it.
--   Writing a second copy here would add a place for the text of a spiritual
--   reminder to leak from without adding a single thing the priest needs.
--
-- extendedUntil
--   A calendar date, matching "lastConfessionDate", rather than a number of
--   days to be decremented somewhere. Storing the deadline the priest chose
--   means the grace expires on its own: there is no counter to run down, no
--   job to notice the day has come, and no state that can drift out of step
--   with the date. Once this date is in the past it stops influencing the
--   calculation and the member is late again, which is what "I gave him more
--   time, and when that time is up he is overdue again" has to mean.
--
--   Both columns are nullable and both default to NULL, so an existing tenant
--   behaves exactly as it did before this migration: no member has been
--   reminded yet, and no member has been given an extension. The deployment
--   changes what the interface can do and nothing about the data already
--   recorded.
--
-- The indexes follow the ones already on this table. Neither column is ever
-- sorted or filtered on directly by the interface — the overdue queue is sorted
-- by "lastConfessionDate", which is indexed already — so these are here for the
-- one thing a tenant-wide dashboard does constantly: ask about every member it
-- holds.

ALTER TABLE "Member" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "extendedUntil" TEXT;

CREATE INDEX "Member_tenantId_reminderSentAt_idx" ON "Member"("tenantId", "reminderSentAt");
CREATE INDEX "Member_tenantId_extendedUntil_idx" ON "Member"("tenantId", "extendedUntil");
