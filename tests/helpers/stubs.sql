-- Stand-ins for what Supabase provides, so the schema can be exercised in a
-- throwaway PostgreSQL without a Supabase project.
--
-- auth.uid() is SECURITY DEFINER here because the real one reads a JWT and
-- needs no table grants; without that the policies fail on schema permissions
-- rather than on the rule being tested.

create role authenticated;
create role anon;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Whoever the test is currently acting as.
create table auth._current (id uuid);

create or replace function auth.uid() returns uuid
language sql stable security definer as $$ select id from auth._current limit 1 $$;

create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
