CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "friendships_userAId_userBId_key"
    ON "friendships"("userAId", "userBId");
CREATE INDEX "friendships_userAId_idx" ON "friendships"("userAId");
CREATE INDEX "friendships_userBId_idx" ON "friendships"("userBId");