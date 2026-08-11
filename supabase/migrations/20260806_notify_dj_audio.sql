-- Adds audio_url to the notify-dj payload. Without it the Edge Function sees a
-- null spotify_url on an audio-only moment and reports it as "(removed)".
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
  _payload := jsonb_build_object(
    'client_key',      NEW.client_key,
    'section_id',      NEW.section_id,
    'old_song_title',  OLD.song_title,
    'old_artist',      OLD.artist,
    'old_spotify_url', OLD.spotify_url,
    'old_audio_url',   OLD.audio_url,
    'new_song_title',  NEW.song_title,
    'new_artist',      NEW.artist,
    'new_spotify_url', NEW.spotify_url,
    'new_audio_url',   NEW.audio_url
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
    raise warning 'notify_dj_on_selection_change: pg_net call failed: %', sqlerrm;
  end;

  return NEW;
end;
$$;
