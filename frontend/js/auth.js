// Session Management
const Auth = {
  getToken() {
    return localStorage.getItem("quiz_auth_token") || "";
  },

  getProfile() {
    const raw = localStorage.getItem("quiz_auth_profile");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setSession(token, profile) {
    if (token) localStorage.setItem("quiz_auth_token", token);
    if (profile) localStorage.setItem("quiz_auth_profile", JSON.stringify(profile));
  },

  clearSession() {
    localStorage.removeItem("quiz_auth_token");
    localStorage.removeItem("quiz_auth_profile");
    window.location.href = "index.html";
  },

  /**
   * Returns authorization headers for fetch requests.
   */
  getHeaders() {
    const headers = {};
    const token = this.getToken();
    const profile = this.getProfile();

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else if (profile && profile.role) {
      // Dev mode fallback
      headers["x-dev-role"] = profile.role;
      headers["x-dev-user-id"] = profile.id || "00000000-0000-0000-0000-000000000001";
    }

    return headers;
  },

  /**
   * Guards a page to ensure only users with the given role can view it.
   */
  protectPage(requiredRole) {
    const profile = this.getProfile();

    if (!profile) {
      window.location.href = "index.html";
      return false;
    }

    if (requiredRole && profile.role !== requiredRole) {
      if (profile.role === "teacher") {
        window.location.href = "teacher-dashboard.html";
      } else {
        window.location.href = "student-dashboard.html";
      }
      return false;
    }

    // Populate user profile UI in sidebar/navbar if present
    const userNameElements = document.querySelectorAll(".user-name");
    const userRoleElements = document.querySelectorAll(".user-role-tag");
    const userAvatarElements = document.querySelectorAll(".user-avatar");

    userNameElements.forEach((el) => (el.textContent = profile.full_name || profile.email));
    userRoleElements.forEach((el) => (el.textContent = profile.role.toUpperCase()));
    userAvatarElements.forEach((el) => {
      const initial = (profile.full_name || profile.email || "U")[0].toUpperCase();
      el.textContent = initial;
    });

    return true;
  },
};
