-- Stop the same bill being entered twice.
--
-- Two different mistakes, so two rules:
--
-- 1. The same invoice, entered again. An invoice number is unique per
--    provider, so re-uploading the same PDF is caught exactly.
-- 2. A second bill of the same kind for the same property and period, even
--    with a different invoice number. This is what happens when a provider
--    re-issues, or when the same bill is typed in by hand and then uploaded.
--
-- Rejected bills are excluded: a rejected reading should not block the
-- corrected one that replaces it.

create unique index bills_one_per_invoice_number
  on public.bills (organization_id, provider, invoice_number)
  where invoice_number is not null
    and provider is not null
    and status <> 'rejected';

create unique index bills_one_per_property_type_period
  on public.bills (organization_id, property_id, bill_type, period_start)
  where property_id is not null
    and period_start is not null
    and status <> 'rejected';

insert into public.schema_migrations (version) values ('0012_no_duplicate_bills')
on conflict (version) do nothing;
