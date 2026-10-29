-- Milestone 3, part 2: tasks and interviews. Private to their owner (policies from 001 check the card is theirs).

alter table public.tasks
  add constraint tasks_title_length check (length(trim(title)) between 1 and 200);
create index tasks_user_open on public.tasks(user_id, due_at) where done_at is null;

alter table public.interviews
  add column title text check (title is null or length(title) <= 120),
  add constraint interviews_link check (meeting_url is null or (meeting_url ~* '^https?://' and length(meeting_url) <= 2000)),
  add constraint interviews_notes_length check (length(notes) <= 5000);
create index interviews_user_next on public.interviews(user_id, starts_at);

create or replace function public.limit_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; cap int := tg_argv[0]::int;
begin
  execute format('select count(*) from %I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= cap then raise exception 'You have reached the limit of % here. Delete some old ones first.', cap; end if;
  return new;
end $$;
create trigger tasks_limit before insert on public.tasks for each row execute function public.limit_rows('2000');
create trigger interviews_limit before insert on public.interviews for each row execute function public.limit_rows('500');

-- An interview on a card that's Saved or Applied moves it to Interviewing (never backwards), and is logged.
create or replace function public.interview_added() returns trigger
language plpgsql set search_path = public as $$
begin
  update tracker_items set stage = 'interviewing' where id = new.item_id and stage in ('saved', 'applied');
  insert into tracker_events (item_id, user_id, kind, detail)
  values (new.item_id, new.user_id, 'interview', jsonb_build_object('starts_at', new.starts_at, 'title', new.title));
  return null;
end $$;
create trigger interviews_added after insert on public.interviews for each row execute function public.interview_added();
