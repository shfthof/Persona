-- Only these checked functions may award XP. No client has direct write grants.
create schema if not exists persona_private;
revoke all on schema persona_private from public, anon, authenticated;
grant usage on schema persona_private to authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,
 updated_at timestamptz not null default now()
);
create table public.challenges (id text primary key, stat text not null check(stat in ('Social','Guts','Smarts','Vitality')), xp integer not null check(xp > 0));
insert into public.challenges values ('compliment','Social',40),('speak','Guts',60),('study','Smarts',75),('walk','Vitality',50),('listen','Social',50),('build','Smarts',65);
create table public.competition (id boolean primary key default true check(id), data jsonb not null);
create table public.league_results (user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null);
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.competition enable row level security;
alter table public.league_results enable row level security;
revoke all on public.profiles, public.challenges, public.competition, public.league_results from anon, authenticated;
grant select on public.profiles, public.challenges, public.competition, public.league_results to authenticated;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy read_challenges on public.challenges for select to authenticated using (true);
create policy read_competition on public.competition for select to authenticated using (true);
create policy own_results on public.league_results for select to authenticated using ((select auth.uid()) = user_id);
create index profiles_ranked_league on public.profiles ((data->>'league')) where (data->>'joined')::boolean;

create function persona_private.new_competition(start_day integer) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('seasonId',start_day::text,'seasonStart',start_day::bigint*86400000,
 'seasonEnd',extract(epoch from ((date '1970-01-01'+start_day)::timestamp + interval '5 months'))::bigint*1000,
 'weekId',start_day::text,'weekStartDay',start_day,'weekEndDay',start_day+7);
$$;
create function persona_private.week_xp(p jsonb, start_day integer, end_day integer) returns integer language sql immutable set search_path='' as $$
 select coalesce(sum(coalesce((p->'earnings'->>d::text)::integer,0)),0)::integer from generate_series(start_day,end_day-1) d;
$$;
-- Invoked only by postgres cron; current time is never supplied by a client.
create function persona_private.rollover() returns void language plpgsql security invoker set search_path='' as $$
declare c jsonb; finish integer; today integer := floor(extract(epoch from now())/86400); leagues text[] := array['Bronze','Silver','Gold','Platinum','Diamond','Champions'];
begin
 perform pg_advisory_xact_lock(739182);
 select data into c from public.competition where id for update;
 if c is null then c := persona_private.new_competition(today); insert into public.competition values(true,c); end if;
 while today >= (c->>'weekEndDay')::integer loop
  finish := (c->>'weekEndDay')::integer;
  if finish::bigint*86400000 >= (c->>'seasonEnd')::bigint then
   update public.profiles set data=jsonb_set(data,'{league}','"Bronze"'),updated_at=now();
   delete from public.league_results;
   c := persona_private.new_competition(finish);
  else
   -- One snapshot across all leagues prevents double promotions in one week.
   with scores as (
    select id, data->>'league' league, persona_private.week_xp(data,(c->>'weekStartDay')::integer,finish) xp
    from public.profiles where (data->>'joined')::boolean
   ), ranked as (select *,row_number() over(partition by league order by xp desc,id desc) r from scores)
   insert into public.league_results(user_id,data)
   select id,jsonb_build_object('previousLeague',league,'league',
    case when league='Champions' then case when r<=15 and xp>0 then 'Champions' else 'Diamond' end
    when r<=15 and xp>0 then leagues[array_position(leagues,league)+1] else league end,
    'rank',r,'xp',xp,'weekId',c->>'weekId') from ranked
   on conflict(user_id) do update set data=excluded.data;
   update public.profiles p set data=jsonb_set(p.data,'{league}',r.data->'league'),updated_at=now()
    from public.league_results r where p.id=r.user_id and r.data->>'weekId'=c->>'weekId';
   c := c || jsonb_build_object('weekId',finish::text,'weekStartDay',finish,'weekEndDay',least(finish+7,((c->>'seasonEnd')::bigint/86400000)::integer));
  end if;
 end loop;
 update public.competition set data=c where id and data is distinct from c;
end;
$$;

create function persona_private.progress(action text, challenge_id text default null, display_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); p jsonb; receipts jsonb; stat_name text; reward integer; n integer; s text; total integer:=0; d text:=floor(extract(epoch from now())/86400)::text;
begin
 if uid is null then raise exception 'Sign in to save your progress.' using errcode='42501'; end if;
 if action is null or action not in ('ensure','profile','join','complete') then raise exception 'Unknown action.'; end if;
 -- Serializes week boundaries with ranked earnings. Profile row locks serialize devices.
 perform pg_advisory_xact_lock_shared(739182);
 select jsonb_object_agg(id,jsonb_build_object('count',0,'lastDay',-1)) into receipts from public.challenges;
 insert into public.profiles(id,data) values(uid,jsonb_build_object('schemaVersion',2,'name','Explorer','joined',false,'league','Bronze',
 'baseXp','{"Social":0,"Guts":0,"Smarts":0,"Vitality":0}'::jsonb,'xp','{"Social":0,"Guts":0,"Smarts":0,"Vitality":0}'::jsonb,
 'levels','{"Social":1,"Guts":1,"Smarts":1,"Vitality":1}'::jsonb,'totalXp',0,'level',1,'receipts',receipts,'earnings','{}'::jsonb,'activityDays','{}'::jsonb)) on conflict(id) do nothing;
 select data into p from public.profiles where id=uid for update;
 if action='profile' then
  if display_name is null or char_length(btrim(display_name)) not between 2 and 24 then raise exception 'Use a name with 2–24 characters.'; end if;
  p:=jsonb_set(p,'{name}',to_jsonb(btrim(display_name)));
 elsif action='join' then p:=jsonb_set(p,'{joined}','true');
 elsif action='complete' then
  select stat,xp into stat_name,reward from public.challenges where id=challenge_id;
  if not found then raise exception 'Unknown challenge.'; end if;
  if (p->'receipts'->challenge_id->>'lastDay')::integer >= d::integer then raise exception 'This challenge has already been completed today.'; end if;
  n:=(p->'receipts'->challenge_id->>'count')::integer+1;
  p:=jsonb_set(p,array['receipts',challenge_id],jsonb_build_object('count',n,'lastDay',d::integer));
  p:=jsonb_set(p,array['xp',stat_name],to_jsonb((p->'xp'->>stat_name)::integer+reward));
  p:=jsonb_set(p,array['activityDays',d],'true');
  if (p->>'joined')::boolean then p:=jsonb_set(p,array['earnings',d],to_jsonb(coalesce((p->'earnings'->>d)::integer,0)+reward)); end if;
 end if;
 foreach s in array array['Social','Guts','Smarts','Vitality'] loop
  n:=(p->'xp'->>s)::integer; total:=total+n;
  p:=jsonb_set(p,array['levels',s],to_jsonb(n/200+1));
 end loop;
 p:=p || jsonb_build_object('totalXp',total,'level',total/200+1);
 update public.profiles set data=p,updated_at=now() where id=uid;
 return p;
end;
$$;
create function public.save_progress(action text, challenge_id text default null, display_name text default null) returns jsonb language sql security invoker set search_path='' as $$
 select persona_private.progress(action,challenge_id,display_name);
$$;
create function persona_private.leaderboard(league_name text) returns table(id uuid,name text,xp integer,level integer)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to see rankings.' using errcode='42501'; end if;
 return query select p.id,p.data->>'name',persona_private.week_xp(p.data,(c.data->>'weekStartDay')::integer,(c.data->>'weekEndDay')::integer),(p.data->>'level')::integer
 from public.profiles p cross join public.competition c where (p.data->>'joined')::boolean and p.data->>'league'=league_name
 order by 3 desc,p.id desc limit 100;
end;
$$;
create function public.get_leaderboard(league_name text) returns table(id uuid,name text,xp integer,level integer) language sql security invoker set search_path='' as $$ select * from persona_private.leaderboard(league_name); $$;
create function public.server_time() returns double precision language sql stable security invoker set search_path='' as $$ select extract(epoch from now())::double precision*1000; $$;
revoke all on all functions in schema persona_private from public,anon,authenticated;
grant execute on function persona_private.progress(text,text,text), persona_private.leaderboard(text) to authenticated;
revoke all on function public.save_progress(text,text,text), public.get_leaderboard(text), public.server_time() from public,anon,authenticated;
grant execute on function public.save_progress(text,text,text), public.get_leaderboard(text), public.server_time() to authenticated;
select persona_private.rollover();
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('persona-leagues','*/5 * * * *','select persona_private.rollover()');
alter publication supabase_realtime add table public.profiles, public.competition;
