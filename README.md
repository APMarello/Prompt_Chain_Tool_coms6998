# COMS6998 Admin Panel

A Next.js 14 admin console for the COMS6998 Hello World Supabase project.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the same publishable/anon key used by the main application.
3. Install dependencies with `npm install`, then run `npm run dev`.
4. Add `http://localhost:3000/auth/callback` to Supabase Auth redirect URLs.

## Vercel setup

Create this directory as a separate Vercel project. Add the three variables from `.env.example` to Vercel's Production, Preview, and Development environments. Set `NEXT_PUBLIC_SITE_URL` to the stable production URL (`https://coms-6998-admin-panel-iota.vercel.app`), not a Vercel deployment-preview URL. Add that URL plus `/auth/callback` to Supabase Auth redirect URLs.

The app has two independent protections: Next.js middleware redirects unauthenticated or non-superadmin users before rendering routes, and Supabase RLS permits the sensitive database operations only for `profiles.is_superadmin = true`.
