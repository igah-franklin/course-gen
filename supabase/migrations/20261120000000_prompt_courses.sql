-- Courses generated from a written brief (no source material).
alter table public.courses drop constraint courses_source_type_check;
alter table public.courses add constraint courses_source_type_check
  check (source_type in ('youtube', 'video_upload', 'document', 'article', 'prompt'));
