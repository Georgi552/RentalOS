-- Fix: deleting a document or a property was impossible.
--
-- These four foreign keys are composite, on (child_id, organization_id), which
-- is what stops a row being attached to another organization's record. But a
-- plain ON DELETE SET NULL nulls EVERY column in the key, including
-- organization_id, which is NOT NULL. So the delete failed with
-- "null value in column organization_id violates not-null constraint"
-- instead of just clearing the reference.
--
-- ON DELETE SET NULL (column) limits it to the column that should be cleared,
-- keeping the cross-organization guarantee intact.

alter table public.documents drop constraint documents_property_fkey;
alter table public.documents add constraint documents_property_fkey
  foreign key (property_id, organization_id)
  references public.properties (id, organization_id)
  on delete set null (property_id);

alter table public.bills drop constraint bills_document_fkey;
alter table public.bills add constraint bills_document_fkey
  foreign key (document_id, organization_id)
  references public.documents (id, organization_id)
  on delete set null (document_id);

alter table public.expenses drop constraint expenses_document_fkey;
alter table public.expenses add constraint expenses_document_fkey
  foreign key (document_id, organization_id)
  references public.documents (id, organization_id)
  on delete set null (document_id);

alter table public.meter_readings drop constraint meter_readings_bill_fkey;
alter table public.meter_readings add constraint meter_readings_bill_fkey
  foreign key (bill_id, organization_id)
  references public.bills (id, organization_id)
  on delete set null (bill_id);
