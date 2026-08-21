// supabase/functions/delete-account/index.ts
//
// Deletes the calling user's Supabase Auth account entirely — email
// registration and all. This can't be done from the browser: deleting an
// auth user requires the service_role key, which must never reach client
// code. This function is the one place that key is used anywhere in the
// system, and it never leaves this server-side environment.
//
// Deleting the auth user cascades automatically to entries, toil_taken,
// settings, and user_keys — every one of those tables' user_id column
// references auth.users(id) with "on delete cascade", so nothing else
// needs to be deleted explicitly here.

import { serve } from 'https://deno.land/std@0.182.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Scoped to the caller's own session via their auth header — used only
    // to establish who's asking. Never used to perform the deletion itself.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Separate admin client — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
    // injected automatically for every Edge Function, no manual secret
    // setup needed for these two specifically.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message ?? 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
