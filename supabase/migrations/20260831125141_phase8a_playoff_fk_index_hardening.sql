-- Phase 8A follow-up: restore the covering index that was previously supplied
-- by the retired one-snapshot-per-season uniqueness constraint.

create index playoff_publications_week14_standings_snapshot_id_idx
  on private.playoff_publications (week14_standings_snapshot_id);
