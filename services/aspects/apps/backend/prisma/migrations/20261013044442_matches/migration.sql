ALTER TABLE "Match"
  ALTER COLUMN "player1Id" DROP NOT NULL,
  ALTER COLUMN "player2Id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "player1Name"  TEXT NOT NULL DEFAULT 'Аноним',
  ADD COLUMN IF NOT EXISTS "player2Name"  TEXT NOT NULL DEFAULT 'Аноним',
  ADD COLUMN IF NOT EXISTS "winnerReason" TEXT,
  ADD COLUMN IF NOT EXISTS "packId"       TEXT NOT NULL DEFAULT 'azeroth',
  ADD COLUMN IF NOT EXISTS "turnNumber"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "durationMs"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "p1BotName"    TEXT,
  ADD COLUMN IF NOT EXISTS "p2BotName"    TEXT;

DROP TABLE IF EXISTS "MatchEvent";

CREATE TABLE IF NOT EXISTS "MatchDeck" (
  "matchId" TEXT NOT NULL,
  "player"  INTEGER NOT NULL,
  "cardIds" TEXT[] NOT NULL DEFAULT '{}',
  CONSTRAINT "MatchDeck_pkey" PRIMARY KEY ("matchId", "player"),
  CONSTRAINT "MatchDeck_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "MatchCommand" (
  "id"        BIGSERIAL PRIMARY KEY,
  "matchId"   TEXT NOT NULL,
  "sequence"  INTEGER NOT NULL,
  "playerId"  TEXT NOT NULL,
  "command"   JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchCommand_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchCommand_matchId_sequence_key"
  ON "MatchCommand"("matchId", "sequence");

CREATE INDEX IF NOT EXISTS "MatchCommand_matchId_idx"
  ON "MatchCommand"("matchId");

CREATE INDEX IF NOT EXISTS "Match_startedAt_idx"
  ON "Match"("startedAt");