-- Run with psql or Supabase SQL Editor after 202611220001_report_photo_visibility.sql.
-- Mirrors PUBLIC_PHOTO_STATUSES in src/lib/report-photo-access.ts.
do $$
begin
  if public.report_photos_are_public('private', 'Verified') then
    raise exception 'Photo visibility test failed: private photos must never be public';
  end if;
  if public.report_photos_are_public('public', 'Submitted')
    or public.report_photos_are_public('public', 'Under review')
    or public.report_photos_are_public('public', 'Additional information requested') then
    raise exception 'Photo visibility test failed: public photos must wait for verification';
  end if;
  if public.report_photos_are_public('public', 'Rejected') or public.report_photos_are_public('public', 'Duplicate') then
    raise exception 'Photo visibility test failed: rejected and duplicate reports stay private';
  end if;
  if not public.report_photos_are_public('public', 'Verified')
    or not public.report_photos_are_public('public', 'In progress')
    or not public.report_photos_are_public('public', 'Awaiting verification')
    or not public.report_photos_are_public('public', 'Resolved')
    or not public.report_photos_are_public('public', 'Closed') then
    raise exception 'Photo visibility test failed: verified public photos should be shown';
  end if;
  if public.is_public_report_photo('no-such-user/no-such-photo.jpg') then
    raise exception 'Photo visibility test failed: an unknown path must not be public';
  end if;
end;
$$;
