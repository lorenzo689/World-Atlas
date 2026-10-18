-- Durable, idempotent acknowledgement for each observation consumed from Kafka.
-- The primary key makes redelivery safe; the run_id prefix supports the monitor's count.
create table ingestion_receipt (
    run_id       uuid       not null references ingestion_run (id) on delete cascade,
    country_code varchar(3) not null,
    year         smallint   not null,
    primary key (run_id, country_code, year)
);
