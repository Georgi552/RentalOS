import type { SupabaseClient } from "@supabase/supabase-js";

export async function documentOptions(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, filename")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`Не мога да заредя документите: ${error.message}`);

  return (data ?? []).map((doc) => ({ value: doc.id, label: doc.filename }));
}
