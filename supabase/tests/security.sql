begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare p jsonb; n integer;
begin
 p:=public.save_progress('ensure');
 if p->>'league'<>'Bronze' then raise exception 'Default league failed'; end if;
 p:=public.save_progress('profile',null,'Test player');
 p:=public.save_progress('complete','study');
 if p->>'totalXp'<>'75' or p->'earnings'<>'{}'::jsonb then raise exception 'Unranked award failed'; end if;
 p:=public.save_progress('join');
 p:=public.save_progress('complete','walk');
 p:=public.save_progress('complete','compliment');
 p:=public.save_progress('complete','build');
 if p->>'level'<>'2' or p->>'totalXp'<>'230' then raise exception 'Level save failed'; end if;
 if (select xp from public.get_leaderboard('Bronze') where id=auth.uid())<>155 then raise exception 'Ranked xp incorrect'; end if;
 begin perform public.save_progress('complete','study'); raise exception 'Duplicate allowed'; exception when raise_exception then if sqlerrm='Duplicate allowed' then raise; end if; end;
 begin perform public.save_progress('complete','fake'); raise exception 'Unknown allowed'; exception when raise_exception then if sqlerrm='Unknown allowed' then raise; end if; end;
 begin update public.profiles set data='{}' where id=auth.uid(); raise exception 'Write allowed'; exception when insufficient_privilege then null; end;
 begin perform persona_private.rollover(); raise exception 'Rollover allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.profiles) then raise exception 'Cross-user read allowed'; end if;
 perform public.save_progress('ensure');
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin perform public.save_progress('ensure'); raise exception 'Unauthenticated allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Advance a controlled week within this rolled-back transaction.
update public.competition set data=data || jsonb_build_object('weekStartDay',floor(extract(epoch from now())/86400)::integer-7,'weekEndDay',floor(extract(epoch from now())/86400)::integer);
update public.profiles set data=jsonb_set(data,'{earnings}',jsonb_build_object((floor(extract(epoch from now())/86400)::integer-1)::text,155)) where id='10000000-0000-4000-8000-000000000001';
select persona_private.rollover();
do $$ begin
 if (select data->>'league' from public.profiles where id='10000000-0000-4000-8000-000000000001')<>'Silver' then raise exception 'Promotion failed'; end if;
end $$;
select persona_private.rollover();
do $$ begin
 if (select data->>'league' from public.profiles where id='10000000-0000-4000-8000-000000000001')<>'Silver' then raise exception 'Idempotency failed'; end if;
end $$;

-- Sixteen Bronze players: exactly fifteen advance, once each.
do $$
declare i integer; uid uuid; template jsonb;
begin
 select data into template from public.profiles where id='10000000-0000-4000-8000-000000000001';
 for i in 1..16 loop
  uid := ('20000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
  insert into auth.users(id) values(uid);
  insert into public.profiles(id,data) values(uid,template || jsonb_build_object('league','Bronze','earnings',jsonb_build_object((floor(extract(epoch from now())/86400)::integer-1)::text,i)));
 end loop;
end $$;
update public.competition set data=data || jsonb_build_object('weekStartDay',floor(extract(epoch from now())/86400)::integer-7,'weekEndDay',floor(extract(epoch from now())/86400)::integer);
select persona_private.rollover();
do $$ begin
 if (select count(*) from public.profiles where id::text like '20000000-%' and data->>'league'='Silver')<>15 then raise exception 'Top fifteen promotion failed'; end if;
 if (select count(*) from public.profiles where id::text like '20000000-%' and data->>'league'='Bronze')<>1 then raise exception 'Bronze remainder failed'; end if;
end $$;
-- Champions keeps fifteen active players; remainder demotes.
update public.profiles set data=jsonb_set(data,'{league}','"Champions"') where id::text like '20000000-%';
update public.competition set data=data || jsonb_build_object('weekStartDay',floor(extract(epoch from now())/86400)::integer-7,'weekEndDay',floor(extract(epoch from now())/86400)::integer);
select persona_private.rollover();
do $$ begin
 if (select count(*) from public.profiles where id::text like '20000000-%' and data->>'league'='Champions')<>15 then raise exception 'Champions retention failed'; end if;
 if (select count(*) from public.profiles where id::text like '20000000-%' and data->>'league'='Diamond')<>1 then raise exception 'Champions demotion failed'; end if;
end $$;
-- Season boundary takes priority, preserving lifetime levels and XP.
update public.competition set data=data || jsonb_build_object('seasonEnd',floor(extract(epoch from now())/86400)::bigint*86400000,'weekEndDay',floor(extract(epoch from now())/86400)::integer);
select persona_private.rollover();
do $$ begin
 if exists(select 1 from public.profiles where data->>'league'<>'Bronze') then raise exception 'Season reset failed'; end if;
 if (select data->>'totalXp' from public.profiles where id='10000000-0000-4000-8000-000000000001')<>'230' then raise exception 'Lifetime XP lost'; end if;
 if (select data->>'level' from public.profiles where id='10000000-0000-4000-8000-000000000001')<>'2' then raise exception 'Lifetime level lost'; end if;
end $$;

rollback;
select 'All database integration checks passed; test data rolled back.' as result;
