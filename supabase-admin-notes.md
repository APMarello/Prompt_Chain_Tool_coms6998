# Admin-panel authorization notes

The Next.js app uses the project's **publishable** Supabase key only, supplied through Vercel environment variables. It never contains a service-role key.

## First administrator

1. Configure Google as a Supabase Auth provider and add the deployed URL to Auth redirect URLs.
2. Sign in once with Google so Auth and the profile-creation flow create your `profiles` row.
3. From the Supabase SQL editor (or the provided database-management connection), promote that exact row:

```sql
update public.profiles
set is_superadmin = true
where email = 'your-google-account@example.com';
```

This works because direct database-management access runs as an administrator; normal app users cannot alter `is_superadmin` due to the trigger installed with the migration.

The admin UI has a client-side login gate for its routes, while Supabase RLS policies provide the authoritative gate for every database query.
