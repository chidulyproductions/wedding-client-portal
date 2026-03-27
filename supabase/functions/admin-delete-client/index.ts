import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ADMIN_DELETE_ALLOWED_EMAILS = (Deno.env.get("ADMIN_DELETE_ALLOWED_EMAILS") || "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function deriveClientKey(name: string, date: string) {
  return `${name}-${date}`.toLowerCase().replace(/[^a-z0-9-]/g, "-")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Server config is incomplete" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: authData, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const adminEmail = (authData.user.email || "").toLowerCase()
    if (ADMIN_DELETE_ALLOWED_EMAILS.length > 0 && !ADMIN_DELETE_ALLOWED_EMAILS.includes(adminEmail)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { clientId, confirmText, action } = await req.json()
    const requestedAction = String(action || "").toLowerCase()

    if (!clientId || !["archive", "restore", "purge"].includes(requestedAction)) {
      return new Response(JSON.stringify({ error: "Missing clientId or invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (requestedAction === "purge" && String(confirmText || "").toUpperCase() !== "DELETE") {
      return new Response(JSON.stringify({ error: "Confirmation text must be DELETE" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: client, error: fetchClientErr } = await adminClient
      .from("clients")
      .select("id, name, wedding_date, email, deleted_at")
      .eq("id", clientId)
      .maybeSingle()

    if (fetchClientErr) {
      return new Response(JSON.stringify({ error: `Client lookup failed: ${fetchClientErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const clientKey = deriveClientKey(client.name, client.wedding_date)

    if (requestedAction === "archive") {
      if (client.deleted_at) {
        return new Response(JSON.stringify({ error: "Client is already archived" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const { error: archiveErr } = await adminClient
        .from("clients")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", client.id)
        .is("deleted_at", null)

      if (archiveErr) {
        return new Response(JSON.stringify({ error: `Archive failed: ${archiveErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      return new Response(JSON.stringify({
        success: true,
        action: "archive",
        clientId: client.id,
        clientKey,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (requestedAction === "restore") {
      if (!client.deleted_at) {
        return new Response(JSON.stringify({ error: "Client is not archived" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const { error: restoreErr } = await adminClient
        .from("clients")
        .update({ deleted_at: null })
        .eq("id", client.id)

      if (restoreErr) {
        return new Response(JSON.stringify({ error: `Restore failed: ${restoreErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      return new Response(JSON.stringify({
        success: true,
        action: "restore",
        clientId: client.id,
        clientKey,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!client.deleted_at) {
      return new Response(JSON.stringify({ error: "Client must be archived before purge" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: existingRows, error: rowsErr } = await adminClient
      .from("wedding_selections")
      .select("section_id, spotify_url, song_title, artist, notes")
      .eq("client_key", clientKey)

    if (rowsErr) {
      return new Response(JSON.stringify({ error: `Selection read failed: ${rowsErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const auditClientKey = `admin-delete-audit-${Date.now()}-${String(client.id).slice(0, 8)}`
    const auditPayload = {
      deleted_client: {
        id: client.id,
        name: client.name,
        wedding_date: client.wedding_date,
        email: client.email,
        client_key: clientKey,
      },
      deleted_by: adminEmail || "unknown",
      deleted_at: new Date().toISOString(),
      selection_count: existingRows?.length || 0,
      selection_preview: (existingRows || []).slice(0, 8),
    }

    const { error: auditErr } = await adminClient.from("wedding_selections").upsert({
      client_key: auditClientKey,
      section_id: "admin-delete-audit",
      spotify_url: null,
      song_title: "__admin_delete_audit__",
      artist: null,
      notes: JSON.stringify(auditPayload),
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_key,section_id" })

    if (auditErr) {
      return new Response(JSON.stringify({ error: `Audit write failed: ${auditErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { error: delSelectionsErr } = await adminClient
      .from("wedding_selections")
      .delete()
      .eq("client_key", clientKey)

    if (delSelectionsErr) {
      return new Response(JSON.stringify({ error: `Failed deleting selections: ${delSelectionsErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: selectionCheck, error: selectionCheckErr } = await adminClient
      .from("wedding_selections")
      .select("section_id")
      .eq("client_key", clientKey)
      .limit(1)

    if (selectionCheckErr) {
      return new Response(JSON.stringify({ error: `Selection verification failed: ${selectionCheckErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (selectionCheck && selectionCheck.length > 0) {
      return new Response(JSON.stringify({ error: "Selection verification failed: rows remain" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { error: delClientErr } = await adminClient
      .from("clients")
      .delete()
      .eq("id", client.id)

    if (delClientErr) {
      return new Response(JSON.stringify({ error: `Failed deleting client: ${delClientErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: clientCheck, error: clientCheckErr } = await adminClient
      .from("clients")
      .select("id")
      .eq("id", client.id)
      .maybeSingle()

    if (clientCheckErr) {
      return new Response(JSON.stringify({ error: `Client verification failed: ${clientCheckErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (clientCheck) {
      return new Response(JSON.stringify({ error: "Client verification failed: row remains" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      action: "purge",
      deletedClientId: client.id,
      deletedClientKey: clientKey,
      deletedSelectionCount: existingRows?.length || 0,
      auditClientKey,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
