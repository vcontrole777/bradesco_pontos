import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('IPINFO_TOKEN');
    if (!token) {
      throw new Error('IPINFO_TOKEN not configured');
    }

    const res = await fetch(`https://ipinfo.io/json?token=${token}`);
    if (!res.ok) {
      throw new Error(`ipinfo API error: ${res.status}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify({
      ip: data.ip,
      city: data.city,
      region: data.region,
      country: data.country,
      org: data.org,
      privacy: data.privacy || { vpn: false, proxy: false, tor: false, relay: false, hosting: false },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ip-info error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
