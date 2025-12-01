-- CHECK FOR TRIGGERS
SELECT 
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    action_statement as statement
FROM information_schema.triggers
WHERE event_object_table IN ('bills', 'bill_translations')
ORDER BY event_object_table, event_manipulation;
