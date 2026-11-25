-- 011 — Three more generated document kinds: the draft trial site
-- agreement, the grower information sheet and the WHS site pack.
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('spray-map','mixing-plan','arm-export','protocol','other',
                  'trial-plan','spray-plan','plot-signs','site-sign','assessment-sheet','report',
                  'agreement','grower-info','whs'));
