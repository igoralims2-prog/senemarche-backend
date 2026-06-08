-- ═══════════════════════════════════════════════════════════════
--  SenéMarché — Schéma Supabase (PostgreSQL)
--  Colle ce script dans : Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- ── Table : utilisateurs ────────────────────────────────────
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text not null,
  wallet      numeric(12,0) default 0,
  created_at  timestamptz default now()
);

-- ── Table : annonces ────────────────────────────────────────
create table if not exists annonces (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null,
  prix         numeric(12,0) not null,
  cat          text not null,
  region       text not null,
  desc         text,
  tel          text,
  emoji        text default '📦',
  vendeur_id   uuid references users(id) on delete set null,
  vendeur_name text,
  active       boolean default true,
  vues         int default 0,
  created_at   timestamptz default now()
);

-- ── Table : favoris ─────────────────────────────────────────
create table if not exists favs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  annonce_id  uuid references annonces(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(user_id, annonce_id)
);

-- ── Table : transactions ────────────────────────────────────
create table if not exists transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  type        text not null,   -- 'recharge' | 'paiement' | 'commission'
  montant     numeric(12,0) not null,
  commission  numeric(12,0) default 0,
  methode     text,            -- 'Wave' | 'Orange Money'
  annonce_id  uuid references annonces(id) on delete set null,
  label       text,
  created_at  timestamptz default now()
);

-- ── Table : messages ────────────────────────────────────────
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid references users(id) on delete cascade,
  from_name   text,
  to_id       uuid references users(id) on delete cascade,
  annonce_id  uuid references annonces(id) on delete set null,
  texte       text not null,
  lu          boolean default false,
  created_at  timestamptz default now()
);

-- ── Fonction : incrémenter les vues ─────────────────────────
create or replace function increment_vues(ann_id uuid)
returns void language sql as $$
  update annonces set vues = vues + 1 where id = ann_id;
$$;

-- ── RLS (Row Level Security) ─────────────────────────────────
-- Les utilisateurs ne voient que leurs propres données sensibles
alter table users        enable row level security;
alter table transactions enable row level security;
alter table messages     enable row level security;
alter table favs         enable row level security;
alter table annonces     enable row level security;

-- Annonces : lecture publique, écriture authentifiée
create policy "annonces_public_read"  on annonces for select using (active = true);
create policy "annonces_auth_insert"  on annonces for insert with check (auth.uid() = vendeur_id);
create policy "annonces_auth_update"  on annonces for update using (auth.uid() = vendeur_id);

-- Utilisateurs : lecture de son propre profil
create policy "users_own"  on users for all using (auth.uid() = id);

-- Transactions : accès à ses propres transactions
create policy "txs_own"    on transactions for all using (auth.uid() = user_id);

-- Messages : accès à ses propres messages
create policy "msgs_own"   on messages for all
  using (auth.uid() = from_id or auth.uid() = to_id);

-- Favoris : accès à ses propres favoris
create policy "favs_own"   on favs for all using (auth.uid() = user_id);

-- ── Index pour performances ──────────────────────────────────
create index if not exists idx_annonces_cat    on annonces(cat);
create index if not exists idx_annonces_region on annonces(region);
create index if not exists idx_annonces_date   on annonces(created_at desc);
create index if not exists idx_txs_user        on transactions(user_id);
create index if not exists idx_msgs_to         on messages(to_id);
