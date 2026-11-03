"use client";

import { useState } from "react";
import { createClient } from "../../utils/supabase/client";

export default function LoginButton() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError("");
    setLoading(true);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
    const { data, error: signInError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    if (data.url) window.location.assign(data.url);
  }

  return <><button className="primary" type="button" onClick={signIn} disabled={loading}>
    {loading ? "Taking you to Google…" : "Continue with Google"}
  </button>{error && <p className="error">{error}</p>}</>;
}
