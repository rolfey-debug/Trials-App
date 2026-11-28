-- Data pack for tools/report/render_report.ts. Replace :trial_id.
select json_build_object(
 'trial', (select row_to_json(t) from trials t where id = :trial_id),
 'site', (select row_to_json(s) from sites s where s.id = (select site_id from trials where id = :trial_id)),
 'treatments', (select json_agg(json_build_object('n',n,'name',name,'recipe',recipe,'b_spray',b_spray,'components',components) order by n) from treatments where trial_id = :trial_id),
 'assessments', (select json_agg(json_build_object('n',n,'timing',timing,'measures',measures,'blind',blind) order by n) from assessments where trial_id = :trial_id),
 'scores', (select json_agg(json_build_object('id',id,'assessment',assessment,'plot',plot,'measure',measure,'value',value,'note',note,'recorded_at',recorded_at)) from scores where trial_id = :trial_id),
 'corrections', (select json_agg(json_build_object('plot',plot,'kind',kind,'measure',measure,'old_value',old_value,'new_value',new_value,'reason',reason,'made_at',made_at)) from corrections where trial_id = :trial_id),
 'operations', (select json_agg(row_to_json(o)) from operations o where trial_id = :trial_id),
 'photos', (select json_object_agg(plot, n) from (select plot, count(*) n from photos where trial_id = :trial_id group by plot) p)
)::text;

-- plots.json (stored plot polygons, drawn on the site map)
select json_agg(json_build_object('plot',plot,'row',row,'position',position,'kind',kind,'treatment',treatment,'rep',rep,'geojson',geojson,'area_m2',area_m2,'planned',planned) order by plot)::text
from plots where trial_id = :trial_id;

-- weather.json (daily site weather)
select json_agg(json_build_object('date',date,'min_temp',min_temp,'max_temp',max_temp,'rain',rain,'source',source) order by date)::text
from site_weather where site_id = (select site_id from trials where id = :trial_id);

-- measures.json (definitions for every measure the trial uses)
select json_agg(row_to_json(m))::text from measures m
where key in (select distinct measure from scores where trial_id = :trial_id) or key = 'yield_t_ha';
