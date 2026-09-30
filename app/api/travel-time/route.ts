import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CACHE_DAYS = 30;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const originPropertyId = String(
      body?.originPropertyId ?? "",
    ).trim();

    const destinationPropertyId = String(
      body?.destinationPropertyId ?? "",
    ).trim();

    if (!originPropertyId || !destinationPropertyId) {
      return NextResponse.json(
        {
          error:
            "originPropertyId and destinationPropertyId are required.",
        },
        { status: 400 },
      );
    }

    if (originPropertyId === destinationPropertyId) {
      return NextResponse.json({
        ok: true,
        originPropertyId,
        destinationPropertyId,
        travelMinutes: 0,
        distanceMiles: 0,
        source: "same-property",
        cached: true,
      });
    }

    const supabase = getAdminClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);

    const { data: cached } = await supabase
      .from("property_travel_times")
      .select(`
        travel_minutes,
        distance_miles,
        source,
        calculated_at
      `)
      .eq("origin_property_id", originPropertyId)
      .eq(
        "destination_property_id",
        destinationPropertyId,
      )
      .gte("calculated_at", cutoff.toISOString())
      .maybeSingle();

    if (
      cached &&
      cached.travel_minutes !== null &&
      cached.distance_miles !== null
    ) {
      return NextResponse.json({
        ok: true,
        originPropertyId,
        destinationPropertyId,
        travelMinutes: Number(cached.travel_minutes),
        distanceMiles: Number(cached.distance_miles),
        source: cached.source ?? "cache",
        cached: true,
      });
    }

    const { data: properties, error: propertyError } =
      await supabase
        .from("properties")
        .select(`
          id,
          latitude,
          longitude
        `)
        .in("id", [
          originPropertyId,
          destinationPropertyId,
        ]);

    if (propertyError) {
      return NextResponse.json(
        { error: propertyError.message },
        { status: 500 },
      );
    }

    const origin = properties?.find(
      (property) => property.id === originPropertyId,
    );

    const destination = properties?.find(
      (property) =>
        property.id === destinationPropertyId,
    );

    if (
      !origin ||
      origin.latitude === null ||
      origin.longitude === null
    ) {
      return NextResponse.json(
        {
          error:
            "Origin property is missing coordinates.",
        },
        { status: 400 },
      );
    }

    if (
      !destination ||
      destination.latitude === null ||
      destination.longitude === null
    ) {
      return NextResponse.json(
        {
          error:
            "Destination property is missing coordinates.",
        },
        { status: 400 },
      );
    }

    const coordinatePair =
      `${origin.longitude},${origin.latitude};` +
      `${destination.longitude},${destination.latitude}`;

    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${coordinatePair}?overview=false&steps=false`;

    const routeResponse = await fetch(osrmUrl, {
      cache: "no-store",
      headers: {
        "User-Agent": "Bakersss-OS/1.0",
      },
    });

    if (!routeResponse.ok) {
      throw new Error(
        `Routing provider returned HTTP ${routeResponse.status}.`,
      );
    }

    const routePayload = await routeResponse.json();
    const route = routePayload?.routes?.[0];

    const durationSeconds = Number(route?.duration);
    const distanceMeters = Number(route?.distance);

    if (
      !Number.isFinite(durationSeconds) ||
      !Number.isFinite(distanceMeters)
    ) {
      return NextResponse.json(
        {
          error:
            "Routing provider did not return a usable route.",
        },
        { status: 502 },
      );
    }

    const travelMinutes = Math.max(
      1,
      Math.ceil(durationSeconds / 60),
    );

    const distanceMiles =
      Math.round(
        (distanceMeters / 1609.344) * 100,
      ) / 100;

    const calculatedAt = new Date().toISOString();

    const { error: cacheError } = await supabase
      .from("property_travel_times")
      .upsert(
        {
          origin_property_id: originPropertyId,
          destination_property_id:
            destinationPropertyId,
          travel_minutes: travelMinutes,
          distance_miles: distanceMiles,
          source: "OSRM",
          calculated_at: calculatedAt,
        },
        {
          onConflict:
            "origin_property_id,destination_property_id",
        },
      );

    if (cacheError) {
      return NextResponse.json(
        { error: cacheError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      originPropertyId,
      destinationPropertyId,
      travelMinutes,
      distanceMiles,
      source: "OSRM",
      cached: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to calculate travel time.",
      },
      { status: 500 },
    );
  }
}