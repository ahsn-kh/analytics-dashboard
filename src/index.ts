import { createClient } from '@supabase/supabase-js'

export default {
  async fetch(request, env) { // <--- ADD 'env' parameter here
    const supabase = createClient(
      env.SUPABASE_URL, // <--- Access the URL from env
      env.SUPABASE_ANON_KEY // <--- Access the Key from env
    );

    const ref = request.headers.get('Referer') ?? 'direct'
    await supabase.from('pageviews').insert({
      site_id: 'demo',
      ref
    })
    return new Response('ok')
  }
}