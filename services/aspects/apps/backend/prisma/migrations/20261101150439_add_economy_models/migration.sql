/*
  Warnings:

  - You are about to drop the column `packId` on the `Deck` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_player1Id_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_player2Id_fkey";

-- DropForeignKey
ALTER TABLE "MatchCommand" DROP CONSTRAINT "MatchCommand_matchId_fkey";

-- DropForeignKey
ALTER TABLE "MatchDeck" DROP CONSTRAINT "MatchDeck_matchId_fkey";

-- AlterTable
ALTER TABLE "Deck" DROP COLUMN "packId";

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "player1Name" DROP DEFAULT,
ALTER COLUMN "player2Name" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MatchDeck" ALTER COLUMN "cardIds" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ShardBalance" (
    "userId" TEXT NOT NULL,
    "shardType" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL DEFAULT '',
    "rarity" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShardBalance_pkey" PRIMARY KEY ("userId","shardType","seriesId","rarity")
);

-- CreateTable
CREATE TABLE "UserCollection" (
    "userId" TEXT NOT NULL,
    "cardDefId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "hasBlueprint" BOOLEAN NOT NULL DEFAULT false,
    "upgradeLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserCollection_pkey" PRIMARY KEY ("userId","cardDefId")
);

-- CreateTable
CREATE TABLE "BoosterRecipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredShards" JSONB NOT NULL,
    "dropWeights" JSONB NOT NULL,
    "poolSeries" TEXT[],
    "cardsPerPack" INTEGER NOT NULL DEFAULT 5,
    "activeFrom" TIMESTAMP(3) NOT NULL,
    "activeUntil" TIMESTAMP(3),

    CONSTRAINT "BoosterRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EconomyTransaction" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EconomyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShardBalance_userId_idx" ON "ShardBalance"("userId");

-- CreateIndex
CREATE INDEX "UserCollection_userId_idx" ON "UserCollection"("userId");

-- CreateIndex
CREATE INDEX "BoosterRecipe_activeFrom_activeUntil_idx" ON "BoosterRecipe"("activeFrom", "activeUntil");

-- CreateIndex
CREATE INDEX "EconomyTransaction_userId_createdAt_idx" ON "EconomyTransaction"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeck" ADD CONSTRAINT "MatchDeck_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCommand" ADD CONSTRAINT "MatchCommand_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
