alter table public.guest_report_access
  add column contact_phone text
    check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');

-- Existing guest rows may predate required contact details. Enforce the
-- requirement for all new and updated rows without invalidating that history.
alter table public.guest_report_access
  add constraint guest_report_access_contact_required
    check (contact_email is not null or contact_phone is not null) not valid;
