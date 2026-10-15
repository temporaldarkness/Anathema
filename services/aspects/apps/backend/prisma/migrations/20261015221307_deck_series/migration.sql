-- Add series column
ALTER TABLE "Deck"
  ADD COLUMN "series" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill existing rows: series = [packId]
UPDATE "Deck"
  SET "series" = ARRAY["packId"]::TEXT[]
  WHERE cardinality("series") = 0;