"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_BUCKET,
  MAX_UPLOAD_BYTES,
  safeFileName,
} from "@/lib/documents";

export type RecordDocumentResult = { ok: true } | { ok: false; error: string };

// The browser uploads straight to Storage, then calls this to record the file.
// Everything is re-checked here, because a client can claim anything.
export async function recordDocument(input: {
  documentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  propertyId: string | null;
}): Promise<RecordDocumentResult> {
  const { supabase, organizationId } = await requireOrganization();

  if (!/^[0-9a-f-]{36}$/.test(input.documentId)) {
    return { ok: false, error: "Невалиден идентификатор на документ." };
  }

  const expectedPath = `${organizationId}/${input.documentId}/${safeFileName(input.fileName)}`;
  if (input.storagePath !== expectedPath) {
    return { ok: false, error: "Пътят на файла не съответства на организацията." };
  }

  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return { ok: false, error: "Допускаме само PDF или снимка (JPG, PNG, WEBP)." };
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { ok: false, error: "Файлът изглежда празен." };
  }

  if (input.fileSize > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Файлът е над 10 MB." };
  }

  const { error } = await supabase.from("documents").insert({
    id: input.documentId,
    organization_id: organizationId,
    property_id: input.propertyId || null,
    storage_path: input.storagePath,
    filename: safeFileName(input.fileName),
    mime_type: input.mimeType,
    file_size: input.fileSize,
    processing_status: "uploaded",
  });

  if (error) {
    const message =
      error.code === "23503"
        ? "Избраният имот вече не съществува."
        : error.code === "23505"
          ? "Този файл вече е записан."
          : error.message;
    return { ok: false, error: message };
  }

  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteDocument(id: string) {
  const { supabase, organizationId } = await requireOrganization();

  const { data: document, error: readError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (readError) {
    redirect(`/documents?error=${encodeURIComponent(readError.message)}`);
  }
  if (!document) redirect("/documents");

  // Remove the row first: bills reference documents with ON DELETE SET NULL,
  // so a refused delete must not leave the file already gone.
  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (deleteError) {
    redirect(`/documents?error=${encodeURIComponent(deleteError.message)}`);
  }

  const { error: storageError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .remove([document.storage_path]);

  if (storageError) {
    redirect(
      `/documents?error=${encodeURIComponent(
        `Записът е изтрит, но файлът остана в хранилището: ${storageError.message}`,
      )}`,
    );
  }

  revalidatePath("/documents");
  redirect("/documents");
}
