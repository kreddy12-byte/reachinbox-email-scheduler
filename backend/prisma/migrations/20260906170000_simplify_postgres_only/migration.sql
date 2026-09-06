-- Drop BullMQ job id (queue removed)
DROP INDEX IF EXISTS "emails_bullJobId_key";
ALTER TABLE "emails" DROP COLUMN IF EXISTS "bullJobId";

-- Faster due-email polling
CREATE INDEX IF NOT EXISTS "emails_status_scheduledAt_idx" ON "emails"("status", "scheduledAt");

-- Slack OAuth CSRF state (replaces Redis)
CREATE TABLE IF NOT EXISTS "slack_oauth_states" (
    "state" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_oauth_states_pkey" PRIMARY KEY ("state")
);

CREATE INDEX IF NOT EXISTS "slack_oauth_states_expiresAt_idx" ON "slack_oauth_states"("expiresAt");

-- Per-sender min-delay send slots (replaces Redis)
CREATE TABLE IF NOT EXISTS "sender_send_slots" (
    "senderId" UUID NOT NULL,
    "nextSendAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_send_slots_pkey" PRIMARY KEY ("senderId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sender_send_slots_senderId_fkey'
  ) THEN
    ALTER TABLE "sender_send_slots"
      ADD CONSTRAINT "sender_send_slots_senderId_fkey"
      FOREIGN KEY ("senderId") REFERENCES "senders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Slack rate-limit notify dedupe (replaces Redis NX)
CREATE TABLE IF NOT EXISTS "slack_rate_limit_notifies" (
    "id" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "hourKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_rate_limit_notifies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "slack_rate_limit_notifies_senderId_hourKey_key"
  ON "slack_rate_limit_notifies"("senderId", "hourKey");
