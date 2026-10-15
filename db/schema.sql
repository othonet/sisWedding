-- Estrutura do banco (PostgreSQL / Supabase).
-- No Supabase: SQL Editor → cole este arquivo → Run. Depois rode o seed.sql (opcional).

create table if not exists gifts (
  id          serial primary key,
  name        text not null,
  description text not null default '',
  image_url   text not null default '',
  quantity    integer not null default 1 check (quantity >= 0),
  reserved    integer not null default 0 check (reserved >= 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint gifts_reserved_le_quantity check (reserved <= quantity)
);

create table if not exists guests (
  id          serial primary key,
  first_name  text not null,
  last_name   text not null,
  name_key    text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists selections (
  id          serial primary key,
  guest_id    integer not null references guests(id) on delete cascade,
  gift_id     integer not null references gifts(id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  created_at  timestamptz not null default now()
);

-- O campo "valor" foi retirado do sistema; remove a coluna de bancos antigos.
alter table gifts drop column if exists price;

create index if not exists selections_guest_idx on selections(guest_id);
create index if not exists selections_gift_idx on selections(gift_id);

-- O acesso é feito só pelo backend (conexão direta). Ativar RLS sem políticas
-- impede que as tabelas fiquem expostas pela API pública do Supabase.
alter table gifts enable row level security;
alter table guests enable row level security;
alter table selections enable row level security;
