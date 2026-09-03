export const DOCUMENT_BUCKET = "documents";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  uploaded: "Качен",
  processing: "Обработва се",
  processed: "Обработен",
  failed: "Неуспешна обработка",
  needs_review: "За проверка",
};

// Storage paths are <organization_id>/<document id>/<file name>. The storage
// policies check that first segment, so the prefix is what enforces isolation.
export function documentStoragePath(
  organizationId: string,
  documentId: string,
  fileName: string,
) {
  return `${organizationId}/${documentId}/${safeFileName(fileName)}`;
}

// Storage keys allow a limited character set, and a name is not a place to
// accept path traversal.
export function safeFileName(fileName: string) {
  const base = fileName.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120) || "file";
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
