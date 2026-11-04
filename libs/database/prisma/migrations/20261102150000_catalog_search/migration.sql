-- Rank the browse list and search ties by real demand, and let customers search by company.
ALTER TABLE "Medicine" ADD COLUMN "popularity" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Medicine_popularity_name_idx" ON "Medicine" ("popularity" DESC, "name");
CREATE INDEX "Medicine_manufacturer_trgm_idx" ON "Medicine" USING GIN ("manufacturer" gin_trgm_ops);
