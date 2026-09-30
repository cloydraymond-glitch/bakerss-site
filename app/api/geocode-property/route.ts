import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function normalizeAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

async function geocodeAddress(address: string) {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    format: "json",
  });

  const response = await fetch(
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params.toString()}`,
    {
      headers: {
        "User-Agent": "Bakersss-OS/1.0",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Census Geocoder returned HTTP ${response.status}.`,
    );
  }

  const payload = await response.json();
  const match = payload?.result?.addressMatches?.[0];

  const longitude = Number(match?.coordinates?.x);
  const latitude = Number(match?.coordinates?.y);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const propertyId = String(body?.propertyId ?? "").trim();

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required." },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const { data: property, error: propertyError } =
      await supabase
        .from("properties")
        .select(`
          id,
          street_address,
          city,
          state
        `)
        .eq("id", propertyId)
        .single();

    if (propertyError || !property) {
      return NextResponse.json(
        {
          error:
            propertyError?.message ??
            "Property was not found.",
        },
        { status: 404 },
      );
    }

    const address = normalizeAddress([
      property.street_address,
      property.city,
      property.state,
    ]);

    if (!address) {
      return NextResponse.json(
        {
          error:
            "Property does not have enough address information to geocode.",
        },
        { status: 400 },
      );
    }

    const coordinates = await geocodeAddress(address);

    if (!coordinates) {
      return NextResponse.json(
        {
          error:
            "No coordinate match was found for this property address.",
        },
        { status: 404 },
      );
    }

    const { error: updateError } = await supabase
      .from("properties")
      .update({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        geocoded_at: new Date().toISOString(),
        geocode_source: "US Census Geocoder",
      })
      .eq("id", propertyId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      propertyId,
      address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: "US Census Geocoder",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to geocode property.",
      },
      { status: 500 },
    );
  }
}