import { prisma } from "../lib/prisma";

let postgisCachedStatus: boolean | null = null;

/**
 * Checks whether the PostGIS extension is installed and active in PostgreSQL.
 * Caches the result in memory so it does not query pg_extension on every request.
 */
export async function checkPostgisInstalled(
  forceRefresh = false,
): Promise<boolean> {
  if (postgisCachedStatus !== null && !forceRefresh) {
    return postgisCachedStatus;
  }

  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'postgis'
      ) as "exists";
    `;
    postgisCachedStatus = Boolean(result[0]?.exists);
    return postgisCachedStatus;
  } catch (error) {
    postgisCachedStatus = false;
    return false;
  }
}

export interface NearbyServiceResult {
  id: string;
  distance: number; // in meters
}

/**
 * Finds services within maxDistMeters of a target (userLat, userLng).
 * Automatically uses indexed PostGIS ST_DWithin if PostGIS is installed,
 * or safely uses pure SQL Haversine calculation if PostGIS is not installed.
 */
export async function findNearbyServices(
  userLat: number,
  userLng: number,
  maxDistMeters: number,
  excludeServiceProviderId?: string,
): Promise<{ services: NearbyServiceResult[]; usedPostgis: boolean }> {
  const hasPostgis = await checkPostgisInstalled();

  if (hasPostgis) {
    try {
      const results = await prisma.$queryRaw<NearbyServiceResult[]>`
        SELECT s.id,
               ST_Distance(
                 ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography,
                 ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography
               ) AS distance
        FROM "Service" s
        JOIN "ServiceProviderProfile" sp ON s."serviceProviderId" = sp.id
        WHERE s."isActive" = true 
          AND s."isDeleted" = false
          AND sp."isDisabled" = false
          AND s."serviceMode" = 'IN_PERSON'
          AND (${excludeServiceProviderId ?? null}::text IS NULL OR s."serviceProviderId" <> ${excludeServiceProviderId ?? null})
          AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography,
                ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography,
                ${maxDistMeters}
              )
        ORDER BY distance ASC
      `;
      return { services: results, usedPostgis: true };
    } catch (err) {
      console.warn(
        "PostGIS query error, switching to Haversine fallback:",
        err,
      );
      postgisCachedStatus = false;
    }
  }

  // Pure PostgreSQL Haversine fallback without requiring any extension
  const results = await prisma.$queryRaw<NearbyServiceResult[]>`
    SELECT s.id,
           (6371000 * acos(
             least(1.0, greatest(-1.0,
               cos(radians(${userLat})) * cos(radians(s.latitude)) *
               cos(radians(s.longitude) - radians(${userLng})) +
               sin(radians(${userLat})) * sin(radians(s.latitude))
             ))
           )) AS distance
    FROM "Service" s
    JOIN "ServiceProviderProfile" sp ON s."serviceProviderId" = sp.id
    WHERE s."isActive" = true
      AND s."isDeleted" = false
      AND sp."isDisabled" = false
      AND s."serviceMode" = 'IN_PERSON'
      AND (${excludeServiceProviderId ?? null}::text IS NULL OR s."serviceProviderId" <> ${excludeServiceProviderId ?? null})
      AND (6371000 * acos(
             least(1.0, greatest(-1.0,
               cos(radians(${userLat})) * cos(radians(s.latitude)) *
               cos(radians(s.longitude) - radians(${userLng})) +
               sin(radians(${userLat})) * sin(radians(s.latitude))
             ))
           )) <= ${maxDistMeters}
    ORDER BY distance ASC
  `;

  return { services: results, usedPostgis: false };
}
