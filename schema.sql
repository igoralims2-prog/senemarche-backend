-- ──────────────────────────────────────────────────────────────
--  SenéMarché — Schéma Supabase (PostgreSQL)
--  Colle ce script dans : Supabase → SQL Editor → Run
-- ──────────────────────────────────────────────────────────────

-- — Table : utilisateurs ————————————————————————————————————
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text not null,
  wallet      numeric(12,0) default 0,
  created_at  timestamptz default now()
);

-- — Table : annonces ————————————————————————————————————————
create table if not exists annonces (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null,
  prix         numeric(12,0) not null,
  cat          text,
  region       text,
  description  text,
  tel          text,
  emoji        text,
  vendeur_id   uuid references users(id) on delete set null,
  vendeur_name text,
  active       boolean default true,
  vues         integer default 0,
  created_at   timestamptz default now()
);

-- — Table : transactions ————————————————————————————————————
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  type        text,
  montant     numeric(12,0),
  commission  numeric(12,0) default 0,
  methode     text,
  annonce_id  uuid,
  label       text,
  created_at  timestamptz default now()
);

-- — Table : favoris ————————————————————————————————————————
create table if not exists favs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  annonce_id  uuid references annonces(id) on delete cascade,
  unique(user_id, annonce_id)
);

-- — Table : messages ————————————————————————————————————————
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid references users(id) on delete cascade,
  from_name   text,
  to_id       uuid references users(id) on delete cascade,
  annonce_id  uuid references annonces(id) on delete set null,
  texte       text,
  lu          boolean default false,
  created_at  timestamptz default now()
);

-- — Fonction incrément vues ————————————————————————————————
create or replace function increment_vues(ann_id uuid)
returns void as $$
  update annonces set vues = vues + 1 where id = ann_id;
$$ language sql;
