import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ATENCIÓN: usa la service_role key, que se salta Row Level Security.
// Solo se debe usar en Server Actions / código de servidor, nunca en el
// navegador. La clave nunca debe llevar el prefijo NEXT_PUBLIC_.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
