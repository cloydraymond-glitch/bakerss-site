import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";
import { isAdminRole, normalizeRole } from "../../../../lib/access";

const allowedRoles = new Set(["admin", "manager", "technician", "employee"]);

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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim();
    const role = String(body.role || "").trim().toLowerCase();
    if (!employeeId) return NextResponse.json({ error: "Employee ID is required." }, { status: 400 });
    if (!allowedRoles.has(role)) return NextResponse.json({ error: "Select a valid app role." }, { status: 400 });

    const { data: employee, error: employeeError } = await auth.admin
      .from("employees")
      .select("id, profile_id, full_name, email, employment_status")
      .eq("id", employeeId)
      .single();

    if (employeeError || !employee) return NextResponse.json({ error: employeeError?.message || "Employee not found." }, { status: 404 });
    if (employee.profile_id) return NextResponse.json({ error: "This employee already has a linked login." }, { status: 409 });
    if (employee.employment_status && employee.employment_status !== "active") {
      return NextResponse.json({ error: "Only active employees can be given a login." }, { status: 400 });
    }

    const email = String(employee.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Add an email address to the employee record before creating a login." }, { status: 400 });

    const origin = request.headers.get("origin") || new URL(request.url).origin;
    const { data: inviteData, error: inviteError } = await auth.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/reset-password`,
      data: { full_name: employee.full_name, employee_id: employee.id, role },
    });

    if (inviteError || !inviteData.user) {
      return NextResponse.json({ error: inviteError?.message || "Supabase could not create the employee login." }, { status: 400 });
    }

    const userId = inviteData.user.id;
    const { error: profileError } = await auth.admin.from("profiles").upsert(
      { id: userId, full_name: employee.full_name, email, role },
      { onConflict: "id" },
    );
    if (profileError) return NextResponse.json({ error: `Login was invited, but the profile could not be linked: ${profileError.message}` }, { status: 500 });

    const { error: linkError } = await auth.admin.from("employees").update({ profile_id: userId }).eq("id", employee.id);
    if (linkError) return NextResponse.json({ error: `Login was created, but the employee record could not be linked: ${linkError.message}` }, { status: 500 });

    return NextResponse.json({ ok: true, profileId: userId, email, role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Employee login could not be created." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

    const body = await request.json();
    const employeeId = String(body.employeeId || "").trim();
    const action = String(body.action || "").trim();
    const role = String(body.role || "").trim().toLowerCase();

    const { data: employee, error: employeeError } = await auth.admin
      .from("employees")
      .select("id, profile_id")
      .eq("id", employeeId)
      .single();
    if (employeeError || !employee?.profile_id) return NextResponse.json({ error: "This employee does not have a linked login." }, { status: 404 });

    if (action === "role") {
      if (!allowedRoles.has(role)) return NextResponse.json({ error: "Select a valid app role." }, { status: 400 });
      const { error } = await auth.admin.from("profiles").update({ role }).eq("id", employee.profile_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, role });
    }

    if (action === "disable") {
      const { error } = await auth.admin.from("profiles").update({ role: "disabled" }).eq("id", employee.profile_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const { error: banError } = await auth.admin.auth.admin.updateUserById(employee.profile_id, { ban_duration: "876000h" });
      if (banError) return NextResponse.json({ error: `Role was disabled, but the Auth account could not be suspended: ${banError.message}` }, { status: 400 });
      return NextResponse.json({ ok: true, role: "disabled" });
    }

    if (action === "enable") {
      const nextRole = allowedRoles.has(role) ? role : "technician";
      const { error: authError } = await auth.admin.auth.admin.updateUserById(employee.profile_id, { ban_duration: "none" });
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
      const { error } = await auth.admin.from("profiles").update({ role: nextRole }).eq("id", employee.profile_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, role: nextRole });
    }

    return NextResponse.json({ error: "Unsupported access action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Employee access could not be updated." }, { status: 500 });
  }
}
