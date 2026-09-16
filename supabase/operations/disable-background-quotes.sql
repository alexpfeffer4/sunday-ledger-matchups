-- Approved emergency disable: preserves all other workers, quotas, shared data
-- and accepted bets. Re-enable only through the reviewed release gate.
begin;
update private.background_quote_settings set enabled=false,polling_enabled=false,revision=revision+1 where singleton;
commit;
-- In-flight provider responses still reconcile conservative accounting, but
-- the old revision cannot apply to leagues. Never reset counters or lower caps
-- beneath consumed usage. Committed applications require a forward repair.
