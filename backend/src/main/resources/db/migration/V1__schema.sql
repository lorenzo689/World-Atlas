-- World Explorer schema. Owned by Flyway; Hibernate only validates it (ddl-auto: validate).

-- ---------------------------------------------------------------------------------------------
-- Reference data: countries (seeded from the frontend's public/data/countries.json)
-- ---------------------------------------------------------------------------------------------
create table country (
    code          varchar(3)      primary key,           -- ISO 3166-1 alpha-3
    code2         varchar(2)      not null unique,       -- ISO 3166-1 alpha-2
    numeric_code  varchar(3),
    name          varchar(120) not null,
    official_name varchar(200) not null,
    capitals      text[]       not null default '{}',
    region        varchar(40)  not null,
    subregion     varchar(60),
    independent   boolean      not null default false,
    un_member     boolean      not null default false,
    landlocked    boolean      not null default false,
    area_km2      double precision,
    lat           double precision,
    lng           double precision,
    borders       text[]       not null default '{}',
    languages     text[]       not null default '{}',
    flag_emoji    varchar(16),
    demonym       varchar(80)
);
create index country_region_idx on country (region);

create table country_currency (
    country_code varchar(3)     not null references country (code) on delete cascade,
    code         varchar(8)  not null,
    name         varchar(80) not null,
    symbol       varchar(16),
    primary key (country_code, code)
);

-- ---------------------------------------------------------------------------------------------
-- Users (accounts and guests). Refresh tokens live in Redis, not here.
-- ---------------------------------------------------------------------------------------------
create table app_user (
    id            uuid         primary key,
    email         varchar(254),
    display_name  varchar(40)  not null,
    password_hash varchar(100),
    roles         text[]       not null default '{USER}',
    guest         boolean      not null default false,
    created_at    timestamptz  not null default now(),
    last_login_at timestamptz
);
-- case-insensitive uniqueness for e-mails, guests have none
create unique index app_user_email_uq on app_user (lower(email)) where email is not null;

-- ---------------------------------------------------------------------------------------------
-- Data platform: indicator observations + ingestion bookkeeping
-- ---------------------------------------------------------------------------------------------
create table indicator_value (
    country_code  varchar(3)          not null,
    indicator_key varchar(40)      not null,
    year          smallint         not null,
    value         double precision not null,
    updated_at    timestamptz      not null default now(),
    primary key (indicator_key, country_code, year)
);
-- "latest value per country" and "all countries in a year" queries
create index indicator_value_year_idx on indicator_value (indicator_key, year);

create table ingestion_run (
    id            uuid        primary key,
    indicator_key varchar(40) not null,
    trigger       varchar(20) not null,     -- MANUAL | SCHEDULED | BOOTSTRAP
    status        varchar(20) not null,     -- FETCHING | PUBLISHED | COMPLETED | FAILED
    fetched       integer     not null default 0,
    stored        integer     not null default 0,
    error         text,
    started_at    timestamptz not null default now(),
    finished_at   timestamptz
);
create index ingestion_run_started_idx on ingestion_run (started_at desc);

-- ---------------------------------------------------------------------------------------------
-- Personal atlas
-- ---------------------------------------------------------------------------------------------
create table favorite (
    user_id      uuid        not null references app_user (id) on delete cascade,
    country_code varchar(3)     not null references country (code),
    created_at   timestamptz not null default now(),
    primary key (user_id, country_code)
);

create table travel_entry (
    user_id      uuid        not null references app_user (id) on delete cascade,
    country_code varchar(3)     not null references country (code),
    status       varchar(16) not null,       -- VISITED | LIVED | WISHLIST
    visited_on   date,
    rating       smallint check (rating between 1 and 5),
    updated_at   timestamptz not null default now(),
    primary key (user_id, country_code)
);

create table note (
    id           uuid         primary key,
    user_id      uuid         not null references app_user (id) on delete cascade,
    country_code varchar(3)      not null references country (code),
    title        varchar(140) not null,
    body         text         not null default '',
    version      bigint       not null default 0,   -- optimistic locking (@Version)
    created_at   timestamptz  not null default now(),
    updated_at   timestamptz  not null default now()
);
create index note_user_idx on note (user_id, updated_at desc);

create table saved_view (
    id               uuid         primary key,
    user_id          uuid         not null references app_user (id) on delete cascade,
    slug             varchar(16)  not null unique,  -- share link: /views/{slug}
    name             varchar(80)  not null,
    mode             varchar(16)  not null,          -- satellite | political | data
    metric           varchar(40),
    lat              double precision not null,
    lng              double precision not null,
    altitude         double precision not null,
    selected_country varchar(3),
    public           boolean      not null default false,
    created_at       timestamptz  not null default now()
);
create index saved_view_user_idx on saved_view (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Quiz + multiplayer results, player statistics
-- ---------------------------------------------------------------------------------------------
create table quiz_result (
    id           uuid         primary key,
    user_id      uuid         references app_user (id) on delete set null,
    player_name  varchar(40)  not null,
    mode         varchar(16)  not null,   -- CLASSIC | DAILY
    region       varchar(40),
    score        integer      not null,
    correct      integer      not null,
    total        integer      not null,
    duration_ms  bigint       not null,
    finished_at  timestamptz  not null default now()
);
create index quiz_result_user_idx on quiz_result (user_id, finished_at desc);
create index quiz_result_score_idx on quiz_result (mode, score desc);

create table multiplayer_game (
    id          uuid        primary key,
    room_code   varchar(8)  not null,
    rounds      integer     not null,
    finished_at timestamptz not null default now()
);

create table multiplayer_participant (
    game_id   uuid        not null references multiplayer_game (id) on delete cascade,
    user_id   uuid        not null references app_user (id) on delete cascade,
    name      varchar(40) not null,
    score     integer     not null,
    placement integer     not null,
    primary key (game_id, user_id)
);

create table player_stats (
    user_id          uuid    primary key references app_user (id) on delete cascade,
    games            integer not null default 0,
    total_score      bigint  not null default 0,
    best_score       integer not null default 0,
    answered         integer not null default 0,
    correct          integer not null default 0,
    multiplayer_games integer not null default 0,
    multiplayer_wins  integer not null default 0,
    updated_at       timestamptz not null default now()
);

-- Idempotent Kafka consumers: an event id is processed at most once per consumer.
create table processed_event (
    consumer     varchar(60) not null,
    event_id     varchar(80) not null,
    processed_at timestamptz not null default now(),
    primary key (consumer, event_id)
);
