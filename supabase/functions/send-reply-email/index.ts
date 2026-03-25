import "@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { clientEmail, clientName, replyText } = await req.json();

    if (!clientEmail || !replyText) {
      return new Response(JSON.stringify({ error: "Missing clientEmail or replyText" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Chi Duly Productions <notifications@send.chiduly.com>",
        to: [clientEmail],
        subject: `Chi Duly responded to your note — ${clientName || "Wedding Music"}`,
        html: `
          <div style="font-family: 'Georgia', serif; max-width: 560px; margin: 0 auto; color: #1a1218;">
            <h2 style="color: #a07840; font-weight: 400; margin-bottom: 4px;">Chi Duly Productions</h2>
            <p style="color: #7a7385; font-size: 14px; margin-top: 0;">Wedding Music Program</p>
            <hr style="border: none; border-top: 1px solid #e0dce5; margin: 20px 0;" />
            <p style="font-size: 15px; line-height: 1.7;">Hi${clientName ? " " + clientName : ""},</p>
            <p style="font-size: 15px; line-height: 1.7;">Chi Duly has replied to your note:</p>
            <blockquote style="border-left: 3px solid #a07840; padding: 12px 16px; background: #faf6f1; margin: 16px 0; font-size: 15px; line-height: 1.7; white-space: pre-wrap;">${replyText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</blockquote>
            <p style="font-size: 15px; line-height: 1.7;">Visit your music portal to continue the conversation.</p>
            <hr style="border: none; border-top: 1px solid #e0dce5; margin: 20px 0;" />
            <p style="color: #7a7385; font-size: 12px;">&copy; 2026 Chi Duly Productions</p>
          </div>
        `,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.message || "Email send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
