import { createClient } from "@/lib/supabase/server";
import { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export async function getCurrentProfile(): Promise<{ userId: string; email: string; profile: Profile }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles_view")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  return { userId: user.id, email: user.email ?? "", profile: profile as Profile };
}
