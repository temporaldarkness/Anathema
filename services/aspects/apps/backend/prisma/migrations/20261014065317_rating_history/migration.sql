-- CreateTable
CREATE TABLE "rating_history" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "opponentId" TEXT NOT NULL,
    "opponentName" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "rdBefore" DOUBLE PRECISION NOT NULL,
    "rdAfter" DOUBLE PRECISION NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rating_history_userId_playedAt_idx"
    ON "rating_history"("userId", "playedAt" DESC);