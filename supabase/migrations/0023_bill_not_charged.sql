-- A bill type can be declared irrelevant to a lease.
--
-- Not every property has district heating or a building fee, and until now the
-- lease form forced one of two answers for all six types: we pay it, or the
-- tenant pays it. Both are wrong for a bill that does not exist, and the
-- landlord had to pick one anyway.
--
-- Why a third payer value rather than simply leaving the row out:
--
--   A missing row already means something else. paidByLandlordFromTerm() reads
--   absence as "assume we pay", because a bill filed against a property with no
--   active lease still costs us money. If "not charged" were expressed by
--   absence, it would be indistinguishable from a term nobody has answered yet,
--   and the form's rule that every type is answered explicitly - the rule that
--   keeps a wrong default out of a tenant statement - would have nothing left
--   to check.
--
-- Collection stays 'not_applicable', the same as for a landlord-paid bill:
-- there is nothing to collect either way.

alter table public.lease_bill_terms
  drop constraint lease_bill_terms_payer_check;

alter table public.lease_bill_terms
  add constraint lease_bill_terms_payer_check
  check (payer in ('landlord', 'tenant', 'not_charged'));

alter table public.lease_bill_terms
  drop constraint lease_bill_terms_collection_matches_payer;

alter table public.lease_bill_terms
  add constraint lease_bill_terms_collection_matches_payer check (
    -- A bill we pay is never collected from the tenant, a bill the tenant pays
    -- must say how, and a bill that is not charged has nothing to collect.
    (payer = 'landlord' and collection = 'not_applicable')
    or (payer = 'tenant' and collection in ('via_rent', 'direct'))
    or (payer = 'not_charged' and collection = 'not_applicable')
  );

-- Nothing is migrated. Every existing term was answered deliberately, and
-- guessing which of them the landlord meant as "not charged" would be exactly
-- the silent assumption this column exists to prevent.

insert into public.schema_migrations (version) values ('0023_bill_not_charged')
on conflict (version) do nothing;
