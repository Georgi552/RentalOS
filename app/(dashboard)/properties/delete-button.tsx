"use client";

import { deleteProperty } from "./actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteProperty.bind(null, id)}
      onSubmit={(event) => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-red-600 hover:underline">
        Delete
      </button>
    </form>
  );
}
