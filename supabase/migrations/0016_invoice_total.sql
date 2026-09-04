-- Records the invoice's own headline total next to the amount that counts.
--
-- A Топлофикация invoice charged 41.34 for the month while nothing was
-- payable, because a 75.84 equalisation credit covered it. Whichever figure
-- the landlord records, the other one has to stay visible: otherwise the bill
-- disagrees with the PDF it came from and looks like a parsing error.
--
-- bills.amount stays the figure the money is built on. invoice_total is
-- reference only and never enters the ledger.

alter table public.bills add column invoice_total numeric(12, 2)
  check (invoice_total is null or invoice_total >= 0);

comment on column public.bills.invoice_total is
  'The invoice headline total, when it differs from the amount recorded. Reference only.';

insert into public.schema_migrations (version) values ('0016_invoice_total')
on conflict (version) do nothing;
