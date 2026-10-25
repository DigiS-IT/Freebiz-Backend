CREATE EXTENSION IF NOT EXISTS postgis;

-- Match the geography expression used by ST_DWithin in src/utils/geo.ts.
-- This lets PostGIS use a GiST index for the 5 km service-radius lookup.
CREATE INDEX IF NOT EXISTS "Service_location_geog_gix"
ON "Service"
USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography))
WHERE "isDeleted" = false;
