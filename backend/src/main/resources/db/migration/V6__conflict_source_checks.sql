alter table conflict_revision add column source_checked_at timestamptz;
alter table conflict_revision add column source_check_status varchar(20);
