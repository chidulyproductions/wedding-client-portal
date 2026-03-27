-- Trigger function: fires after INSERT or UPDATE on wedding_selections and
-- calls the notify-dj Edge Function via pg_net so the DJ gets an email.
-- Values are embedded in the SECURITY DEFINER function body because
-- ALTER DATABASE / ALTER ROLE for custom app.settings.* GUCs requires
-- superuser privileges not available to the Supabase migration login role.
-- Wrapped in BEGIN/EXCEPTION so a network error never blocks a client save.
create or replace function notify_dj_on_selection_change()
returns trigger
language plpgsql
security definer
as $$
declare
  _url      constant text := 'https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/notify-dj';
  -- anon key (public, safe to commit)
  _key      constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbmxmdHhxZGVsY3JtYmNlaW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzg5NDIsImV4cCI6MjA4ODUxNDk0Mn0._-XQuBtlKW0B87QDR6kF1wYU_0FQLjRnTPMJ7xIp59s';
  _payload  text;
begin
  -- Build JSON payload. OLD fields are null on INSERT — that's intentional and
  -- signals to the Edge Function that this is a brand-new selection.
  _payload := jsonb_build_object(
    'client_key',      NEW.client_key,
    'section_id',      NEW.section_id,
    'old_song_title',  OLD.song_title,
    'old_artist',      OLD.artist,
    'old_spotify_url', OLD.spotify_url,
    'new_song_title',  NEW.song_title,
    'new_artist',      NEW.artist,
    'new_spotify_url', NEW.spotify_url
  )::text;

  begin
    perform pg_net.http_post(
      url     := _url,
      body    := _payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _key
      )
    );
  exception when others then
    -- Log but never let trigger failures break a client save.
    raise warning 'notify_dj_on_selection_change: pg_net call failed: %', sqlerrm;
  end;

  return NEW;
end;
$$;

-- Attach the function as an AFTER INSERT OR UPDATE trigger on wedding_selections.
create or replace trigger notify_dj_trigger
  after insert or update
  on wedding_selections
  for each row
  execute function notify_dj_on_selection_change();
