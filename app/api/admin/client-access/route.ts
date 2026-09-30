import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";
import { isAdminRole, normalizeRole } from "../../../../lib/access";

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { error: "Missing administrator session." } as const;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { error: "Supabase public environment variables are missing." } as const;

  const publicClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await publicClient.auth.getUser(token);
  if (userError || !userData.user) return { error: "Administrator session is invalid or expired." } as const;

  const admin = createSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !isAdminRole(normalizeRole(profile.role))) {
    return { error: "Administrator or manager access is required." } as const;
  }

  return { admin, actorId: userData.user.id } as const;
}

async function loadClientAccess(admin: ReturnType<typeof createSupabaseAdmin>, clientId: string) {
  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, client_name, email, phone")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return { error: clientError?.message || "Customer not found." } as const;
  }

  const { data: links, error: linksError } = await admin
    .from("client_portal_users")
    .select("id, client_id, profile_id, portal_role, is_active, created_at, updated_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (linksError) return { error: linksError.message } as const;

  const profileIds = (links || []).map((link) => link.profile_id).filter(Boolean);
  let profiles: Array<{ id: string; full_name: string | null; email: string | null; role: string | null }> = [];
  if (profileIds.length > 0) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", profileIds);
    if (error) return { error: error.message } as const;
    profiles = data || [];
  }

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const access = (links || []).map((link) => ({
    ...link,
    profile: profileMap.get(link.profile_id) || null,
  }));

  return { client, access } as const;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

    const clientId = String(new URL(request.url).searchParams.get("clientId") || "").trim();
    if (!clientId) return NextResponse.json({ error: "Customer ID is required." }, { status: 400 });

    const result = await loadClientAccess(auth.admin, clientId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Client portal access could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

    const body = await request.json();
    const clientId = String(body.clientId || "").trim();
    const requestedEmail = String(body.email || "").trim().toLowerCase();
    const portalRole = String(body.portalRole || "owner").trim().toLowerCase();
    if (!clientId) return NextResponse.json({ error: "Customer ID is required." }, { status: 400 });
    if (!new Set(["owner", "manager", "billing"]).has(portalRole)) {
      return NextResponse.json({ error: "Select a valid portal role." }, { status: 400 });
    }

    const { data: client, error: clientError } = await auth.admin
      .from("clients")
      .select("id, client_name, email")
      .eq("id", clientId)
      .single();
    if (clientError || !client) return NextResponse.json({ error: clientError?.message || "Customer not found." }, { status: 404 });

    const email = requestedEmail || String(client.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Add an email address before sending portal access." }, { status: 400 });

    const { data: existingLink } = await auth.admin
      .from("client_portal_users")
      .select("id, profile_id, is_active")
      .eq("client_id", clientId)
      .maybeSingle();
    if (existingLink) {
      return NextResponse.json({ error: "This customer already has portal access. Use Resend Invitation or manage the existing access instead." }, { status: 409 });
    }

    const origin = request.headers.get("origin") || new URL(request.url).origin;
    const { data: inviteData, error: inviteError } = await auth.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/reset-password`,
      data: { full_name: client.client_name, client_id: client.id, role: "client" },
    });

    if (inviteError || !inviteData.user) {
      return NextResponse.json({ error: inviteError?.message || "Supabase could not send the client invitation." }, { status: 400 });
    }

    const userId = inviteData.user.id;
    const { error: profileError } = await auth.admin.from("profiles").upsert(
      { id: userId, full_name: client.client_name, email, role: "client" },
      { onConflict: "id" },
    );
    if (profileError) return NextResponse.json({ error: `Invitation was sent, but the client profile could not be linked: ${profileError.message}` }, { status: 500 });

    const { error: linkError } = await auth.admin.from("client_portal_users").insert({
      client_id: client.id,
      profile_id: userId,
      portal_role: portalRole,
      is_active: true,
    });
    if (linkError) return NextResponse.json({ error: `Invitation was sent, but portal access could not be linked: ${linkError.message}` }, { status: 500 });

    return NextResponse.json({ ok: true, email, profileId: userId, portalRole });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Client invitation could not be created." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

    const body = await request.json();
    const clientId = String(body.clientId || "").trim();
    const profileId = String(body.profileId || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    if (!clientId || !profileId) return NextResponse.json({ error: "Customer and profile IDs are required." }, { status: 400 });

    const { data: link, error: linkError } = await auth.admin
      .from("client_portal_users")
      .select("id, client_id, profile_id, is_active")
      .eq("client_id", clientId)
      .eq("profile_id", profileId)
      .single();
    if (linkError || !link) return NextResponse.json({ error: linkError?.message || "Portal access not found." }, { status: 404 });

    const { data: profile, error: profileError } = await auth.admin
      .from("profiles")
      .select("id, email")
      .eq("id", profileId)
      .single();
    if (profileError || !profile) return NextResponse.json({ error: profileError?.message || "Client profile not found." }, { status: 404 });

    if (action === "disable") {
      const { error } = await auth.admin.from("client_portal_users").update({ is_active: false }).eq("id", link.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const { error: banError } = await auth.admin.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });
      if (banError) return NextResponse.json({ error: `Portal access was disabled, but the Auth account could not be suspended: ${banError.message}` }, { status: 400 });
      return NextResponse.json({ ok: true, isActive: false });
    }

    if (action === "enable") {
      const { error: authError } = await auth.admin.auth.admin.updateUserById(profileId, { ban_duration: "none" });
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
      const { error } = await auth.admin.from("client_portal_users").update({ is_active: true }).eq("id", link.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, isActive: true });
    }

    if (action === "resend") {
      const email = String(profile.email || "").trim().toLowerCase();
      if (!email) return NextResponse.json({ error: "This client profile does not have an email address." }, { status: 400 });
      const origin = request.headers.get("origin") || new URL(request.url).origin;
      const { error } = await auth.admin.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, email });
    }

    return NextResponse.json({ error: "Unsupported portal access action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Client portal access could not be updated." }, { status: 500 });
  }
}
