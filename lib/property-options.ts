import type { SupabaseClient } from "@supabase/supabase-js";

export async function propertyOptions(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw new Error(`Не мога да заредя имотите: ${error.message}`);

  return (data ?? []).map((property) => ({ value: property.id, label: property.name }));
}
