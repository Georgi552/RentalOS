import Link from "next/link";
import { createProperty } from "../actions";
import { PropertyForm } from "../property-form";

export default function NewPropertyPage() {
  return (
    <div>
      <Link href="/properties" className="text-sm text-neutral-500 hover:text-neutral-900">
        &larr; Properties
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add property</h1>

      <PropertyForm
        action={createProperty}
        submitLabel="Create property"
        cancelHref="/properties"
      />
    </div>
  );
}
