-- A document follows its bill when the landlord corrects the bill's property.
--
-- 0026 only ever filled an empty value. That left a wrong automatic match
-- stranded: Софийска вода prints the same КЛИЕНТСКИ НОМЕР on the invoices for
-- two of the landlord's houses, a Драгалевци invoice was written onto Шеовица,
-- and the trigger copied Шеовица onto the document. Correcting the bill then
-- moved the bill and not the document, and there is no screen to move a
-- document. The Шеовица tenant would have gone on seeing the Драгалевци invoice
-- in the portal.
--
-- The document moves only when it sat on the property the bill is leaving, and
-- no other live bill on the same document still points there. A document filed
-- by hand against a third property keeps its answer, as 0026 promised. A
-- document filed by hand against the very property the bill is leaving cannot be
-- told apart from one that inherited it; the landlord has just said that
-- property is wrong for this invoice, so following them is the right call.

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

    if tg_op = 'UPDATE'
       and old.document_id is not distinct from new.document_id
       and old.property_id is not null
       and old.property_id is distinct from new.property_id then
      update public.documents d
      set property_id = new.property_id
      where d.id = new.document_id
        and d.organization_id = new.organization_id
        and d.property_id = old.property_id
        and not exists (
          select 1 from public.bills b
          where b.document_id = new.document_id
            and b.id <> new.id
            and b.property_id = old.property_id
            and b.status <> 'rejected'
        );
    end if;
  end if;

  return new;
end;
$$;

insert into public.schema_migrations (version) values ('0027_document_follows_corrected_bill')
on conflict (version) do nothing;
