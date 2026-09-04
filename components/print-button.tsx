"use client";

export function PrintButton({ label = "PDF / печат" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm font-medium text-neutral-900 hover:underline"
    >
      {label}
    </button>
  );
}
