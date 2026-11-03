"use client";

import { createClient } from "../../utils/supabase/client";

export default function AccessDeniedPage() {
  async function signOut() { await createClient().auth.signOut(); window.location.assign("/login"); }
  return <main className="login-page"><section className="login-card">
    <p className="eyebrow">Access denied</p><h1>Your account is not an administrator.</h1>
    <p>Ask an existing database administrator to grant your profile the <code>is_superadmin</code> role.</p>
    <button className="secondary" onClick={signOut}>Sign out</button>
  </section></main>;
}
