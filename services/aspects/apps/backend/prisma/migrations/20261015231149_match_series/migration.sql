ALTER TABLE "Match"
  ADD COLUMN "series" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill legacy: заполняем series из packId.
UPDATE "Match"
  SET "series" = ARRAY["packId"]::TEXT[]
  WHERE cardinality("series") = 0 AND "packId" IS NOT NULL;