import Link from "next/link";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { requireOrganization } from "@/lib/auth";
import { PROCESSING_STATUS_LABELS, formatBytes } from "@/lib/documents";
import { label } from "@/lib/labels";
import { deleteDocument } from "./actions";

type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  processing_status: string;
  created_at: string;
  property: { id: string; name: string } | null;
};

export default async function DocumentsPage({
  searchParams,
}: PageProps<"/documents">) {
  const { error: actionError } = await searchParams;
  const { supabase, organizationId } = await requireOrganization();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, filename, mime_type, file_size, processing_status, created_at, property:properties(id, name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Не мога да заредя документите: ${error.message}`);

  const documents = (data ?? []) as unknown as DocumentRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Документи</h1>
        <Link
          href="/documents/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Качи документ
        </Link>
      </div>

      {typeof actionError === "string" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {documents.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-500">
            Още няма документи. Качи фактура или договор.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center justify-between px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{document.filename}</span>
                <span className="block text-sm text-neutral-500">
                  {document.property?.name ?? "Без имот"}
                  {" · "}
                  {formatBytes(document.file_size)}
                  {" · "}
                  {label(PROCESSING_STATUS_LABELS, document.processing_status)}
                </span>
              </span>
              <span className="ml-4 flex shrink-0 items-center gap-4">
                {document.mime_type === "application/pdf" && (
                  <Link
                    href={`/bills/new?document=${document.id}`}
                    className="text-sm font-medium text-neutral-900 hover:underline"
                  >
                    Създай сметка
                  </Link>
                )}
                <a
                  href={`/documents/${document.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-neutral-900 hover:underline"
                >
                  Отвори
                </a>
                <ConfirmDeleteButton
                  action={deleteDocument.bind(null, document.id)}
                  confirmMessage={`Да изтрия ли „${document.filename}“? Файлът се маха окончателно.`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
