import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspaceId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`Getting default instance for workspace: ${workspaceId}`);

    // Get the first available connection as default instance
    const { data: connections, error } = await supabase
      .from('connections')
      .select('instance_name, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'connected')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Error getting default instance:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to get default instance' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const defaultInstance = connections && connections.length > 0 ? connections[0].instance_name : null;
    console.log('Default instance retrieved:', defaultInstance);

    return new Response(
      JSON.stringify({ defaultInstance }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-default-instance:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});