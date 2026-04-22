alter table if exists ai_conversation
    add column if not exists mode varchar(20) not null default 'chat';

alter table if exists ai_conversation
    add column if not exists captain_selection_mode varchar(32);

update ai_conversation
set mode = case
               when coalesce(nullif(btrim(compare_models_json), ''), '[]') <> '[]' then 'compare'
               else 'chat'
    end
where mode is null
   or btrim(mode) = '';

update ai_conversation
set mode = 'compare'
where mode = 'chat'
  and coalesce(nullif(btrim(compare_models_json), ''), '[]') <> '[]';
