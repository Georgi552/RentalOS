-- A bill tells the document which property it belongs to.
--
-- The upload form allows "Още не знам" for the property, and the automatic path
-- then writes the property onto the bill and never back onto the document. In
-- production 21 of 22 documents had property_id null while every one of their
-- bills knew the property perfectly well.
--
-- Nothing noticed, because every reader that mattered went through bills. The
-- tenant portal was the first thing to read documents directly: it scopes a
-- tenant's documents by property (migration 0024), so the tenant saw one invoice
-- out of eight.
--
-- Why a trigger rather than two lines in autoCreateBill: the same gap exists in
-- the manual bill form and in anything added later. One rule in the database
-- answers for all of them, and this is a fact about the data rather than a
-- decision about a workflow.
--
-- It only ever fills an empty value. A landlord who has deliberately filed a
-- document against one property keeps that answer even if a bill says otherwise,
-- because the document is the thing they looked at and the bill is a guess made
-- from its text.

create or replace function public.bill_fills_document_property()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_id is not null and new.property_id is not null then
    -- Scoped by organization as well as by id. bills_document_fkey already
    -- guarantees the two share one organization, so this cannot reach outside
    -- it; stating it means the definer's rights are not what is holding the
    -- line.
    update public.documents
    set property_id = new.property_id
    where id = new.document_id
      and organization_id = new.organization_id
      and property_id is null;
  end if;

  return new;
end;
$$;

create trigger bills_fill_document_property
  after insert or update of property_id, document_id on public.bills
  for each row execute function public.bill_fills_document_property();

-- The 18 documents already filed. Only where the answer is not a guess: every
-- non-rejected bill pointing at the document has to agree on one property.
--
-- One document in production had two bills on two different properties - a
-- heating invoice for one flat with an electricity bill for another attached to
-- it. That is a mistake in the data, and this migration leaves it alone rather
-- than picking a side; it stays invisible in the portal until somebody decides.
update public.documents d
set property_id = agreed.property_id
from (
  select b.document_id,
         -- min() and max() are not defined for uuid, and the having clause below
         -- has already reduced this to one value.
         (array_agg(distinct b.property_id))[1] as property_id
  from public.bills b
  where b.document_id is not null
    and b.property_id is not null
    and b.status <> 'rejected'
  group by b.document_id
  having count(distinct b.property_id) = 1
) agreed
where d.id = agreed.document_id
  and d.property_id is null;

insert into public.schema_migrations (version) values ('0026_document_property_from_bill')
on conflict (version) do nothing;
