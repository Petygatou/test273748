-- Comandante FC — schema do Lovable Cloud (Supabase)
-- Perfis, papéis (admin), comunidade (posts, curtidas, comentários, enquetes, stories),
-- alertas de mercado e prováveis escalações (alimentam o motor analítico).

-- ------------------------------------------------------------------ papéis
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- função SECURITY DEFINER evita recursão de RLS ao checar papéis
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "usuário lê os próprios papéis" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- ------------------------------------------------------------------ perfis
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text check (char_length(nome) <= 40),
  bio text check (char_length(bio) <= 160),
  avatar text not null default 'aguia'
    check (avatar in ('aguia','leao','astronauta','gladiador','robo','capitao','lobo','estrategista')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "perfis são públicos" on public.profiles for select using (true);
create policy "usuário cria o próprio perfil" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "usuário edita o próprio perfil" on public.profiles for update to authenticated using (auth.uid() = id);

-- ------------------------------------------------------------------ comunidade
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  author_avatar text not null default 'aguia',
  oficial boolean not null default false,
  texto text not null default '' check (char_length(texto) <= 2000),
  media_url text,
  media_kind text check (media_kind in ('image', 'video')),
  poll jsonb check (poll is null or jsonb_array_length(poll -> 'opcoes') between 2 and 4),
  created_at timestamptz not null default now()
);
create index posts_created_at_idx on public.posts (created_at desc);
alter table public.posts enable row level security;
create policy "feed é público" on public.posts for select using (true);
create policy "logado publica; oficial só admin" on public.posts for insert to authenticated
  with check (auth.uid() = user_id and (oficial = false or public.has_role(auth.uid(), 'admin')));
create policy "autor ou admin remove" on public.posts for delete to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
create policy "curtidas são públicas" on public.post_likes for select using (true);
create policy "curtir" on public.post_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "descurtir" on public.post_likes for delete to authenticated using (auth.uid() = user_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  author_avatar text not null default 'aguia',
  texto text not null check (char_length(texto) between 1 and 500),
  created_at timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;
create policy "comentários são públicos" on public.post_comments for select using (true);
create policy "comentar" on public.post_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "autor ou admin apaga comentário" on public.post_comments for delete to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create table public.poll_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  option smallint not null check (option between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.poll_votes enable row level security;
create policy "votos são públicos" on public.poll_votes for select using (true);
create policy "votar" on public.poll_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "trocar voto" on public.poll_votes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  author_avatar text not null default 'aguia',
  oficial boolean not null default false,
  media_url text not null,
  media_kind text not null check (media_kind in ('image', 'video')),
  meta jsonb not null default '{}'::jsonb, -- filtro + textos (posição, cor, tamanho)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.stories enable row level security;
create policy "stories ativos são públicos" on public.stories for select using (expires_at > now());
create policy "logado publica story; oficial só admin" on public.stories for insert to authenticated
  with check (auth.uid() = user_id and (oficial = false or public.has_role(auth.uid(), 'admin')));
create policy "autor ou admin remove story" on public.stories for delete to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------ painel ADM
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fechamento', 'lesao', 'desfalque', 'geral')),
  titulo text not null check (char_length(titulo) between 1 and 90),
  mensagem text not null check (char_length(mensagem) between 1 and 600),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.alerts enable row level security;
create policy "alertas são públicos" on public.alerts for select using (true);
create policy "admin dispara alerta" on public.alerts for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admin remove alerta" on public.alerts for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- prováveis escalações: lidas pelo servidor a cada análise (chance de jogar)
create table public.lineup_overrides (
  temporada int not null,
  rodada int not null,
  atleta_id int not null,
  status text not null check (status in ('titular', 'reserva', 'duvida', 'fora')),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (temporada, rodada, atleta_id)
);
alter table public.lineup_overrides enable row level security;
create policy "prováveis são públicas" on public.lineup_overrides for select using (true);
create policy "admin define prováveis" on public.lineup_overrides for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "admin atualiza prováveis" on public.lineup_overrides for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin limpa prováveis" on public.lineup_overrides for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------ storage (fotos e vídeos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 62914560, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

create policy "mídia é pública" on storage.objects for select using (bucket_id = 'media');
create policy "logado envia na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "dono remove a própria mídia" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------------ realtime (contagens ao vivo)
alter publication supabase_realtime add table public.posts, public.post_likes, public.post_comments, public.poll_votes, public.stories, public.alerts;

-- Para tornar alguém administrador (rode no SQL editor):
-- insert into public.user_roles (user_id, role) values ('<uuid do usuário>', 'admin');
