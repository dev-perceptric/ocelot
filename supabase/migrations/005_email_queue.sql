-- Milestone 1, part D: a task can fail for good (a bad address won't fix itself), so the worker can stop
-- retrying it. Retries back off 2, 4, 8, 16 minutes and stop after 5 tries.
drop function public.finish_queue(bigint, text);

create function public.finish_queue(p_id bigint, p_error text default null, p_final boolean default false) returns void
language sql security definer set search_path = public as $$
  update jobs_queue set
    done_at = case when p_error is null or p_final then now() end,
    locked_at = null,
    error = p_error,
    run_at = case when p_error is null or p_final then run_at else now() + (interval '1 minute' * power(2, attempts)) end
  where id = p_id
$$;

revoke execute on function public.finish_queue(bigint, text, boolean) from public, anon, authenticated;
