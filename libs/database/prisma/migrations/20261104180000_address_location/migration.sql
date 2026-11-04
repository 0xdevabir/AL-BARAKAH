-- Map pins for delivery addresses. Nullable, so older addresses keep working on text alone.
ALTER TABLE "Address" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Address" ADD COLUMN "lng" DOUBLE PRECISION;
