import { supabaseAdmin, supabase, isSupabaseConfigured } from "../config/supabase.js";

/**
 * Extracts the bearer token from the Authorization header.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}

/**
 * Middleware: Requires a valid Supabase authenticated user.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);

    // In local development mode when Supabase is not configured yet
    if (!isSupabaseConfigured) {
      const devRole = req.headers["x-dev-role"] || (token?.includes("student") ? "student" : "teacher");
      const devUserId = req.headers["x-dev-user-id"] || "00000000-0000-0000-0000-000000000001";
      req.user = { id: devUserId, email: `${devRole}@college.edu` };
      req.profile = { id: devUserId, role: devRole, full_name: `Prof. Turing (${devRole})`, email: `${devRole}@college.edu` };
      return next();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Missing Bearer token.",
      });
    }

    // Verify token with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication session.",
        error: authError?.message,
      });
    }

    // Get user profile (role, full_name)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      // Auto-fallback: use metadata or default to student
      req.profile = {
        id: user.id,
        role: user.user_metadata?.role || "student",
        full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        email: user.email,
      };
    } else {
      req.profile = profile;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server authentication error.",
    });
  }
}

/**
 * Middleware: Requires the user to have the 'teacher' role.
 */
export function requireTeacher(req, res, next) {
  requireAuth(req, res, () => {
    if (req.profile?.role !== "teacher") {
      return res.status(403).json({
        success: false,
        message: "Access forbidden. Teacher privileges required.",
      });
    }
    next();
  });
}

/**
 * Middleware: Requires the user to have the 'student' role.
 */
export function requireStudent(req, res, next) {
  requireAuth(req, res, () => {
    if (req.profile?.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Access forbidden. Student privileges required.",
      });
    }
    next();
  });
}
