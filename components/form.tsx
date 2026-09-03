import Link from "next/link";

export const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

function Label({
  label,
  required,
  children,
  hint,
  error,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  error,
  required,
  hint,
  maxLength,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "date" | "number";
  defaultValue?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <Label label={label} required={required} hint={hint} error={error}>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        className={inputClass}
        aria-invalid={error ? true : undefined}
      />
    </Label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  error,
  required,
  hint,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Label label={label} required={required} hint={hint} error={error}>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
        aria-invalid={error ? true : undefined}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Label>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <Label label={label}>
      <textarea name={name} rows={rows} defaultValue={defaultValue} className={inputClass} />
    </Label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
  );
}

export function SubmitRow({
  pending,
  submitLabel,
  cancelHref,
}: {
  pending: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {pending ? "Записване..." : submitLabel}
      </button>
      <Link href={cancelHref} className="text-sm text-neutral-500 hover:text-neutral-900">
        Отказ
      </Link>
    </div>
  );
}
