# Backend moved to Supabase

The current app uses Supabase Auth, Postgres, and Supabase Cron. See [Supabase setup](SUPABASE.md).

The former Firebase rules and GitHub Actions scheduler have been retired from the active source. Existing Firebase data remains in its original project; it has not been imported or deleted. No GitHub Firebase service-account secret is needed for the new scheduler.
