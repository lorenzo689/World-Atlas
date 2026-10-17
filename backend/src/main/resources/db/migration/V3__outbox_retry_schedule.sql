alter table outbox_event add column next_attempt_at timestamptz not null default now();
create index outbox_retry_idx on outbox_event (next_attempt_at, created_at)
    where sent_at is null;
