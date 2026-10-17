-- ---------------------------------------------------------------------------------------------
-- Transactional outbox: domain events are written here in the same transaction as the business
-- change and relayed to Kafka afterwards (see common/events/OutboxRelay).
-- ---------------------------------------------------------------------------------------------
create table outbox_event (
    id          uuid         primary key,
    topic       varchar(80)  not null,
    msg_key     varchar(120) not null,
    type        varchar(200) not null,   -- Java class of the event, used to deserialise the payload
    payload     text         not null,   -- the event as JSON
    created_at  timestamptz  not null default now(),
    sent_at     timestamptz,
    attempts    integer      not null default 0,
    last_error  text
);
-- the relay only ever looks at unsent rows, oldest first
create index outbox_pending_idx on outbox_event (created_at) where sent_at is null;

-- ---------------------------------------------------------------------------------------------
-- Accounts: e-mail verification
-- ---------------------------------------------------------------------------------------------
alter table app_user add column email_verified boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- Achievements, daily streaks and per-country quiz knowledge
-- ---------------------------------------------------------------------------------------------
create table achievement (
    user_id     uuid        not null references app_user (id) on delete cascade,
    code        varchar(40) not null,
    unlocked_at timestamptz not null default now(),
    primary key (user_id, code)
);

create table user_streak (
    user_id        uuid    primary key references app_user (id) on delete cascade,
    current_streak integer not null default 0,
    best_streak    integer not null default 0,
    last_played    date
);

-- how often a player answered a question about a country correctly / wrongly
create table player_country_stats (
    user_id      uuid       not null references app_user (id) on delete cascade,
    country_code varchar(3) not null,
    correct      integer    not null default 0,
    wrong        integer    not null default 0,
    primary key (user_id, country_code)
);

-- ---------------------------------------------------------------------------------------------
-- Quiz challenges ("duels"): a shareable link, everybody gets the same questions
-- ---------------------------------------------------------------------------------------------
create table quiz_challenge (
    id           uuid        primary key,
    slug         varchar(12) not null unique,
    creator_id   uuid        references app_user (id) on delete set null,
    creator_name varchar(40) not null,
    seed         bigint      not null,
    region       varchar(40),
    rounds       integer     not null,
    created_at   timestamptz not null default now()
);

alter table quiz_result add column challenge_id uuid references quiz_challenge (id) on delete set null;
create index quiz_result_challenge_idx on quiz_result (challenge_id, score desc);
