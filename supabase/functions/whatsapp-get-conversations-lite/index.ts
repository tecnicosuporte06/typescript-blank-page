// ✅ VERSÃO ATUALIZADA: Separação de permissões operacionais vs administrativas
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-system-user-id, x-system-user-email, x-workspace-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Extrair informações do usuário dos headers
    const systemUserId = req.headers.get('x-system-user-id');
    const systemUserEmail = req.headers.get('x-system-user-email');
    const workspaceId = req.headers.get('x-workspace-id');

    console.log('🔍 WhatsApp Conversations Lite Request - User:', systemUserId, 'Workspace:', workspaceId);
    console.log('📋 Headers received:', {
      'x-system-user-id': systemUserId,
      'x-system-user-email': systemUserEmail,
      'x-workspace-id': workspaceId
    });

    const url = new URL(req.url);
    const limitFromQuery = parseInt(url.searchParams.get('limit') || '50');
    const cursorFromQuery = url.searchParams.get('cursor');
    const searchFromQuery = url.searchParams.get('search');

    // ✅ Aceitar paginação via body também (porque supabase.functions.invoke pode não preservar querystring)
    let limit = limitFromQuery;
    let cursor: string | null = cursorFromQuery;
    let search: string | null = typeof searchFromQuery === 'string' && searchFromQuery.length > 0 ? searchFromQuery : null;
    try {
      const maybeJson = await req.clone().json().catch(() => null);
      if (maybeJson && typeof maybeJson === 'object') {
        const bodyLimit = Number((maybeJson as any).limit);
        const bodyCursor = (maybeJson as any).cursor;
        const bodySearch = (maybeJson as any).search;
        if (!Number.isNaN(bodyLimit) && bodyLimit > 0) limit = bodyLimit;
        if (typeof bodyCursor === 'string' && bodyCursor.length > 0) cursor = bodyCursor;
        if (typeof bodySearch === 'string') search = bodySearch;
      }
    } catch (_e) {
      // ignora
    }
    
    search = (search ?? '').trim();
    if (search.length === 0) search = null;

    if (!workspaceId) {
      console.error('❌ Missing workspace_id in headers');
      return new Response(
        JSON.stringify({ error: 'workspace_id é obrigatório' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!systemUserId) {
      return new Response(
        JSON.stringify({ error: 'Autenticação é obrigatória' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Usar chave anônima para respeitar RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') || '',
        }
      }
    });

    // Definir contexto do usuário para as funções RLS
    const { error: contextError } = await supabase.rpc('set_current_user_context', {
      user_id: systemUserId,
      user_email: systemUserEmail
    });

    if (contextError) {
      console.error('Error setting user context:', contextError);
    }

    // Verificar o perfil do usuário para determinar filtros
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ✅ NÍVEL OPERACIONAL: Verificar apenas se o usuário está ativo
    // workspace_members é usado apenas para permissões ADMINISTRATIVAS (aba Workspace)
    const { data: userData } = await supabaseService
      .from('system_users')
      .select('profile, status')
      .eq('id', systemUserId)
      .single();

    const userProfile = userData?.profile;
    const userStatus = userData?.status;

    console.log('📋 User profile:', userProfile);
    console.log('🔒 User status:', userStatus);

    // Bloquear apenas usuários inativos (nível operacional)
    if (userStatus !== 'active') {
      console.error('❌ SECURITY: Inactive user', systemUserId, 'attempted to access conversations');
      return new Response(
        JSON.stringify({ error: 'Usuário inativo' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ User has operational access - Profile:', userProfile);

    let query = supabase
      .from('conversations')
      .select(`
        id,
        contact_id,
        connection_id,
        last_activity_at,
        unread_count,
        priority,
        status,
        assigned_user_id,
        agente_ativo,
        agent_active_id,
        contacts!inner(
          id,
          name,
          phone,
          profile_image_url
        ),
        connections!conversations_connection_id_fkey(
          id,
          instance_name,
          phone_number,
          status
        ),
        conversation_tags (
          id,
          tag_id,
          tags (
            id,
            name,
            color
          )
        )
      `)
      .eq('workspace_id', workspaceId);

    // ✅ CORREÇÃO: Apenas USER tem filtro de assigned_user_id
    // Master e Admin veem TUDO do workspace
    if (userProfile === 'user') {
      // Usuários normais veem apenas conversas atribuídas a eles ou sem atribuição
      query = query.or(`assigned_user_id.eq.${systemUserId},assigned_user_id.is.null`);
      console.log('🔒 User filtering: assigned to them OR unassigned');
      console.log('🔍 Applied filter: assigned_user_id = ', systemUserId, ' OR assigned_user_id IS NULL');
    } else {
      console.log('👑 Admin/Master: showing ALL conversations in workspace');
    }

    // ✅ Busca por banco (por contato) - evita conflito com o .or() do filtro de atribuição
    // Estratégia: primeiro encontra contact_ids no workspace via name/phone, depois filtra conversations.contact_id IN (...)
    if (search) {
      const digitsOnly = search.replace(/\D/g, '');
      const patterns: string[] = [];
      // PostgREST "or" usa: col.op.value, com % direto no value
      patterns.push(`name.ilike.%${search}%`);
      patterns.push(`phone.ilike.%${search}%`);
      if (digitsOnly.length >= 3 && digitsOnly !== search) {
        patterns.push(`phone.ilike.%${digitsOnly}%`);
      }

      const { data: contactMatches, error: contactErr } = await supabase
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .or(patterns.join(','))
        .limit(2000);

      if (contactErr) {
        console.error('❌ Error searching contacts:', contactErr);
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar contatos' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const contactIds = (contactMatches || []).map((c: any) => c.id).filter(Boolean);
      console.log('🔎 Search applied:', { search, matchedContacts: contactIds.length });

      if (contactIds.length === 0) {
        // Resultado vazio rápido
        return new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
            counts: { all: 0, mine: 0, unassigned: 0, unread: 0 }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      query = query.in('contact_id', contactIds);
    }

    console.log('📊 Query filters applied, fetching conversations...');
    console.log('🎯 WORKSPACE FILTER: conversations.workspace_id =', workspaceId);
    console.log('👤 USER FILTER:', userProfile !== 'master' && userProfile !== 'admin' ? `assigned_user_id = ${systemUserId} OR assigned_user_id IS NULL` : 'NONE (master/admin)');

    query = query
      .order('last_activity_at', { ascending: false, nullsLast: true })
      .order('id', { ascending: false })
      .limit(limit);

    // Apply cursor pagination if provided (sem sobrescrever filtros anteriores)
    // Cursor esperado: `${last_activity_at}|${id}` (last_activity_at pode ser null)
    if (cursor) {
      const [cursorDateRaw, cursorIdRaw] = cursor.split('|');
      const cursorId = cursorIdRaw;
      const cursorDate = cursorDateRaw === 'null' ? null : cursorDateRaw;

      if (cursorDate === null) {
        // Paginação dentro do bloco last_activity_at IS NULL (ordem por id DESC)
        query = query.is('last_activity_at', null);
        if (cursorId) query = query.lt('id', cursorId);
      } else {
        // ✅ Mantemos simples para não sobrescrever filtros .or() já aplicados (ex: filtro de usuário)
        // Isso evita loop de cursor repetido, mesmo que existam timestamps iguais.
        query = query.lt('last_activity_at', cursorDate);
      }
    }

    const { data: conversations, error } = await query;
    
    console.log(`✅ Query executed - Found ${conversations?.length || 0} conversations for workspace ${workspaceId}`);
    if (conversations && conversations.length > 0) {
      // Normalize joined data (Supabase may return arrays for joins)
      const firstContact = Array.isArray(conversations[0].contacts) 
        ? conversations[0].contacts[0] 
        : conversations[0].contacts;
      
      console.log('📋 First conversation sample:', {
        id: conversations[0].id,
        contact_name: firstContact?.name,
        last_activity: conversations[0].last_activity_at
      });
    }

    if (error) {
      console.error('Error fetching conversations:', error);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar conversas' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Buscar última mensagem e nome do usuário responsável para cada conversa
    const conversationsWithMessages = await Promise.all(
      (conversations || []).map(async (conv) => {
        const supabaseService = createClient(
          supabaseUrl,
          supabaseServiceRoleKey
        );

        // ✅ Garantir connection data de forma explícita
        // Normalize joined data (Supabase may return arrays for joins)
        let connectionData: any = Array.isArray(conv.connections) 
          ? conv.connections[0] 
          : conv.connections;
        
        if (!connectionData && conv.connection_id) {
          // Fallback: buscar connection diretamente se JOIN falhou
          const { data: connData } = await supabaseService
            .from('connections')
            .select('id, instance_name, phone_number, status')
            .eq('id', conv.connection_id)
            .single();
          
          connectionData = connData || null;
        }

        const { data: lastMessage } = await supabaseService
          .from('messages')
          .select('content, message_type, sender_type, created_at')
          .eq('conversation_id', conv.id)
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(1);

        // Buscar nome do usuário responsável se existe assigned_user_id
        let assignedUserName: string | null = null;
        if (conv.assigned_user_id) {
          const { data: userData } = await supabaseService
            .from('system_users')
            .select('name')
            .eq('id', conv.assigned_user_id)
            .single();
          
          assignedUserName = userData?.name || null;
        }

        // Extrair conversation_tags ANTES do spread para não perder
        const conversationTags = conv.conversation_tags || [];
        
        return {
          ...conv,
          connection_id: conv.connection_id,
          connection: connectionData || null, // ✅ Garantido
          last_message: lastMessage || [],
          assigned_user_name: assignedUserName,
          conversation_tags: conversationTags // ✅ Preservar tags explicitamente
        };
      })
    );

    // ✅ Contagens totais (para não depender do subset carregado)
    // Usamos queries "head: true" para não transferir linhas
    const countsBase = () => {
      let q = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);
      if (userProfile === 'user') {
        q = q.or(`assigned_user_id.eq.${systemUserId},assigned_user_id.is.null`);
      }
      return q;
    };

    const [allCountRes, mineCountRes, unassignedCountRes, unreadCountRes] = await Promise.all([
      countsBase(),
      countsBase().eq('assigned_user_id', systemUserId),
      countsBase().is('assigned_user_id', null),
      countsBase().gt('unread_count', 0)
    ]);

    const counts = {
      all: allCountRes.count ?? 0,
      mine: mineCountRes.count ?? 0,
      unassigned: unassignedCountRes.count ?? 0,
      unread: unreadCountRes.count ?? 0
    };

    // Generate next cursor if we have results
    let nextCursor = null;
    if (conversationsWithMessages && conversationsWithMessages.length === limit) {
      const lastConversation = conversationsWithMessages[conversationsWithMessages.length - 1];
      nextCursor = `${lastConversation.last_activity_at}|${lastConversation.id}`;
    }

    return new Response(
      JSON.stringify({
        items: conversationsWithMessages || [],
        nextCursor,
        counts
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});