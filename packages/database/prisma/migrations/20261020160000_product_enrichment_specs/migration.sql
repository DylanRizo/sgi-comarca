BEGIN;

-- ADR-023: Technical specifications, measurement charts, material descriptions and photo URLs
-- Nullable additions; existing product records and historic catalogs remain unchanged.
ALTER TABLE "products"
  ADD COLUMN "materials_description" TEXT,
  ADD COLUMN "measurement_chart" TEXT,
  ADD COLUMN "photos_url" VARCHAR(1024);

COMMIT;
