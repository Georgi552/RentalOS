"use client";

export function ConfirmDeleteButton({
  action,
  confirmMessage,
  label = "Изтрий",
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <button type="submit" className="text-sm text-red-600 hover:underline">
        {label}
      </button>
    </form>
  );
}
