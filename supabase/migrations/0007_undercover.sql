-- listener: Undercover, the daily guess-the-cover game.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- One row per player per puzzle. Only the pattern of guesses is stored (X wrong, S skipped, O correct), never the
-- guesses themselves, so reading someone's result can't spoil the answer.

create table public.game_results (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  puzzle     int not null check (puzzle > 0),
  marks      text not null check (marks ~ '^[XS]{0,5}O?$' and char_length(marks) between 1 and 5),
  solved     boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, puzzle),
  check (solved = (right(marks, 1) = 'O')),
  check (solved or char_length(marks) = 5)
);
create index game_results_puzzle_idx on public.game_results (puzzle, created_at desc);

alter table public.game_results enable row level security;
create policy "results are public"     on public.game_results for select using (true);
create policy "record your own result" on public.game_results for insert to authenticated with check (user_id = auth.uid());

grant select on public.game_results to anon, authenticated;
grant insert on public.game_results to authenticated;
