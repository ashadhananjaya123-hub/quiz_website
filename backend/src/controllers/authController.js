import { supabase, supabaseAdmin, isSupabaseConfigured } from "../config/supabase.js";

/**
 * Controller: Register a new user (Teacher or Student) in Supabase.
 */
export async function register(req, res) {
  const { email, password, role = "student", fullName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  const validRole = role === "teacher" ? "teacher" : "student";
  const name = fullName?.trim() || email.split("@")[0];

  try {
    if (!isSupabaseConfigured) {
      return res.json({
        success: true,
        message: "Registered (Local Mode)",
        token: `local_token_${Date.now()}`,
        profile: { id: `user_${Date.now()}`, role: validRole, full_name: name, email },
      });
    }

    // Create user in Supabase Auth via Admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: validRole, full_name: name },
    });

    if (authError) {
      return res.status(400).json({ success: false, message: authError.message });
    }

    const userId = authData.user.id;

    // Ensure profile row exists in public.profiles
    const { data: profile, error: pError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        role: validRole,
        full_name: name,
        email,
      })
      .select()
      .single();

    if (pError) {
      console.warn("Profile creation notice:", pError.message);
    }

    // Sign in to generate a real access token
    const { data: loginData } = await supabase.auth.signInWithPassword({ email, password });

    return res.status(201).json({
      success: true,
      message: "Account registered successfully.",
      token: loginData?.session?.access_token || "auth_token",
      profile: profile || { id: userId, role: validRole, full_name: name, email },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Sign In with email & password.
 */
export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  try {
    if (!isSupabaseConfigured) {
      return res.json({
        success: true,
        token: `local_token_${Date.now()}`,
        profile: { id: "00000000-0000-0000-0000-000000000001", role: "teacher", email, full_name: "Instructor" },
      });
    }

    const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !sessionData?.session) {
      return res.status(401).json({ success: false, message: authError?.message || "Invalid credentials." });
    }

    // Fetch profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", sessionData.user.id)
      .single();

    return res.json({
      success: true,
      token: sessionData.session.access_token,
      profile: profile || {
        id: sessionData.user.id,
        role: sessionData.user.user_metadata?.role || "student",
        full_name: sessionData.user.user_metadata?.full_name || email.split("@")[0],
        email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Controller: Quick One-Click Access for development/testing with real Supabase Auth.
 */
export async function quickAccess(req, res) {
  const role = req.body.role === "student" ? "student" : "teacher";
  const email = `${role}@college.edu`;
  const password = "Password123!";

  try {
    if (!isSupabaseConfigured) {
      return res.json({
        success: true,
        token: `dev_${role}_token`,
        profile: {
          id: role === "teacher" ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002",
          role,
          full_name: role === "teacher" ? "Prof. Alan Turing" : "Alex Student",
          email,
        },
      });
    }

    // Sign in with pre-seeded credentials
    const { data: sessionData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !sessionData?.session) {
      return res.status(500).json({ success: false, message: error?.message || "Quick access failed." });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", sessionData.user.id)
      .single();

    return res.json({
      success: true,
      token: sessionData.session.access_token,
      profile: profile || {
        id: sessionData.user.id,
        role,
        full_name: role === "teacher" ? "Prof. Alan Turing" : "Alex Student",
        email,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
