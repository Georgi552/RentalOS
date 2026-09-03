"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputClass } from "@/components/form";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  documentStoragePath,
} from "@/lib/documents";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { createClient } from "@/lib/supabase/client";
import { recordDocument } from "./actions";

export function UploadForm({
  organizationId,
  properties,
}: {
  organizationId: string;
  properties: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const propertyId = String(formData.get("property_id") ?? "") || null;

    if (!(file instanceof File) || file.size === 0) {
      setError("Избери файл.");
      return;
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError("Допускаме само PDF или снимка (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Файлът е над 10 MB.");
      return;
    }

    setBusy(true);

    // The file goes to Storage first, so a failed upload never leaves a row
    // pointing at a file that does not exist.
    const documentId = crypto.randomUUID();
    const storagePath = documentStoragePath(organizationId, documentId, file.name);
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setBusy(false);
      setError(`Качването не успя: ${uploadError.message}`);
      return;
    }

    const result = await recordDocument({
      documentId,
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      propertyId,
    });

    if (!result.ok) {
      // Do not leave an orphan file behind if the record could not be saved.
      await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
      setBusy(false);
      setError(result.error);
      return;
    }

    router.push("/documents");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <label className="block">
        <span className="text-sm font-medium">
          Файл <span className="text-red-600">*</span>
        </span>
        <input
          type="file"
          name="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          required
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          PDF или снимка, до 10 MB.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">Имот</span>
        <select name="property_id" defaultValue="" className={inputClass}>
          <option value="">Още не знам</option>
          {properties.map((property) => (
            <option key={property.value} value={property.value}>
              {property.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-neutral-500">
          Може да се остави празно и да се уточни по-късно.
        </span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "Качване..." : "Качи документ"}
        </button>
        <Link href="/documents" className="text-sm text-neutral-500 hover:text-neutral-900">
          Отказ
        </Link>
      </div>
    </form>
  );
}
