-- Per-user spaced practice. Updates are derived from idempotently consumed quiz events.
create table learning_progress (
    user_id uuid not null references app_user(id) on delete cascade,
    question_type varchar(20) not null,
    country_code varchar(3) not null references country(code),
    correct integer not null default 0,
    wrong integer not null default 0,
    repetitions integer not null default 0,
    interval_days integer not null default 0,
    ease double precision not null default 2.5,
    due_at timestamptz not null,
    last_answered_at timestamptz not null,
    primary key(user_id, question_type, country_code)
);
create index learning_progress_due_idx on learning_progress(user_id, due_at);

-- Published revisions are immutable. Drafts are kept separately until an admin publishes them.
create table conflict_revision (
    id uuid primary key,
    brief_id varchar(60) not null,
    version integer not null,
    content jsonb not null,
    source_date date not null,
    source_url text not null,
    created_at timestamptz not null default now(),
    published_at timestamptz,
    editor_id uuid references app_user(id) on delete set null,
    unique(brief_id, version)
);
create index conflict_revision_published_idx on conflict_revision(brief_id, published_at desc)
    where published_at is not null;
