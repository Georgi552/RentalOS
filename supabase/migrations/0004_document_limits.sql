-- Enforce upload limits in Storage itself (context doc section 42).
--
-- The browser uploads straight to Supabase Storage, so client-side checks are
-- only a convenience. These two settings are what actually stops a 500 MB file
-- or an executable from being stored.

update storage.buckets
set
  file_size_limit = 10485760, -- 10 MB
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
where id = 'documents';
