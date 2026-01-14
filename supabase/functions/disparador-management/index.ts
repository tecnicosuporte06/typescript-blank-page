import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS (inline) - deploy individual sem _shared
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type Action =
  | "contacts.import"
  | "contacts.list"
  | "contacts.update"
  | "contacts.delete"
  | "campaigns.list"
  | "campaigns.create"
  | "campaigns.get"
  | "campaigns.update"
  | "campaigns.report"
  | "campaigns.delete"
  | "dashboard.get";

type RequestPayload = {
  action: Action;
  workspaceId: string;

  // contacts.import
  documentName?: string;
  rows?: Array<{ name: string; phone: string; tag: string }>;

  // contacts.list
  limit?: number;
  search?: string; // nome ou telefone
  tag?: string; // etiqueta
  documentName?: string;
  createdFrom?: string; // ISO ou yyyy-mm-dd
  createdTo?: string;   // ISO ou yyyy-mm-dd

  // contacts.update/delete
  contactId?: string;
  contactPatch?: { name?: string; phone?: string; tag?: string; document_name?: string };

  // campaigns.create
  name?: string;
  startAt?: string | null; // ISO
  messages?: Array<{ variation: 1 | 2 | 3; content: string }>;
  contactIds?: string[];

  // campaigns.get/update/delete/report
  campaignId?: string;
};

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizePhone(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeDateBoundary(input: string, endOfDay: boolean) {
  const v = String(input || "").trim();
  if (!v) return null;
  // aceita yyyy-mm-dd ou ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString();
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sanitizeSearch(input: string) {
  // remove caracteres que quebram a sintaxe do postgrest .or()
  return String(input || "")
    .replace(/[%(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function requireSystemUser(supabase: any, req: Request) {
  const systemUserId = req.headers.get("x-system-user-id");
  const systemUserEmail = req.headers.get("x-system-user-email");

  if (!systemUserId || !systemUserEmail) {
    throw new Error("AUTH_REQUIRED");
  }

  const { data, error } = await supabase
    .from("system_users")
    .select("id, email, status")
    .eq("id", systemUserId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data || data.email !== systemUserEmail) {
    throw new Error("INVALID_USER");
  }

  return { systemUserId, systemUserEmail };
}

async function requireWorkspaceMember(supabase: any, workspaceId: string, systemUserId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", systemUserId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("NOT_WORKSPACE_MEMBER");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const payload = (await req.json().catch(() => null)) as RequestPayload | null;
    if (!payload?.action || !payload?.workspaceId) {
      return json(400, { success: false, error: "INVALID_PAYLOAD" });
    }

    const { systemUserId } = await requireSystemUser(supabase, req);
    await requireWorkspaceMember(supabase, payload.workspaceId, systemUserId);

    // ---- contacts.import
    if (payload.action === "contacts.import") {
      const documentName = String(payload.documentName || "").trim();
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      if (!documentName) return json(400, { success: false, error: "documentName obrigatório" });
      if (rows.length === 0) return json(400, { success: false, error: "rows vazio" });

      const upsertRows = rows
        .map((r) => ({
          workspace_id: payload.workspaceId,
          name: String(r.name || "").trim(),
          phone: sanitizePhone(String(r.phone || "")),
          tag: String(r.tag || "").trim(),
          document_name: documentName,
          created_by: systemUserId,
        }))
        .filter((r) => r.name && r.phone && r.tag);

      if (upsertRows.length === 0) {
        return json(400, { success: false, error: "Nenhuma linha válida (nome/telefone/tag obrigatórios)" });
      }

      const { error } = await supabase
        .from("disparador_contacts_imported")
        .upsert(upsertRows, { onConflict: "workspace_id,phone,tag,document_name" });

      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, imported: upsertRows.length, documentName });
    }

    // ---- contacts.list
    if (payload.action === "contacts.list") {
      const limit = Number(payload.limit || 500);
      let q = supabase
        .from("disparador_contacts_imported")
        .select("id, name, phone, tag, document_name, created_at")
        .eq("workspace_id", payload.workspaceId);

      const tag = String(payload.tag || "").trim();
      if (tag && tag !== "all") q = q.eq("tag", tag);

      const doc = String(payload.documentName || "").trim();
      if (doc && doc !== "all") q = q.eq("document_name", doc);

      const fromIso = payload.createdFrom ? normalizeDateBoundary(String(payload.createdFrom), false) : null;
      const toIso = payload.createdTo ? normalizeDateBoundary(String(payload.createdTo), true) : null;
      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lte("created_at", toIso);

      const search = sanitizeSearch(String(payload.search || ""));
      if (search) {
        const phoneDigits = sanitizePhone(search);
        const phoneNeedle = phoneDigits || search;
        // OR: name ilike OR phone ilike
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${phoneNeedle}%`);
      }

      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(Math.max(1, Math.min(2000, limit)));

      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, contacts: data || [] });
    }

    // ---- contacts.update
    if (payload.action === "contacts.update") {
      const contactId = String(payload.contactId || "");
      if (!contactId) return json(400, { success: false, error: "contactId obrigatório" });
      const p = payload.contactPatch || {};

      const patch: any = {};
      if (p.name !== undefined) patch.name = String(p.name || "").trim();
      if (p.phone !== undefined) patch.phone = sanitizePhone(String(p.phone || ""));
      if (p.tag !== undefined) patch.tag = String(p.tag || "").trim();
      if (p.document_name !== undefined) patch.document_name = String(p.document_name || "").trim();

      // validação mínima: se campos vierem, não podem ficar vazios
      if ("name" in patch && !patch.name) return json(400, { success: false, error: "name não pode ser vazio" });
      if ("phone" in patch && !patch.phone) return json(400, { success: false, error: "phone não pode ser vazio" });
      if ("tag" in patch && !patch.tag) return json(400, { success: false, error: "tag não pode ser vazio" });
      if ("document_name" in patch && !patch.document_name) return json(400, { success: false, error: "document_name não pode ser vazio" });

      const { error } = await supabase
        .from("disparador_contacts_imported")
        .update(patch)
        .eq("workspace_id", payload.workspaceId)
        .eq("id", contactId);

      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true });
    }

    // ---- contacts.delete
    if (payload.action === "contacts.delete") {
      const contactId = String(payload.contactId || "");
      if (!contactId) return json(400, { success: false, error: "contactId obrigatório" });
      const { error } = await supabase
        .from("disparador_contacts_imported")
        .delete()
        .eq("workspace_id", payload.workspaceId)
        .eq("id", contactId);
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true });
    }

    // ---- campaigns.list
    if (payload.action === "campaigns.list") {
      const { data, error } = await supabase
        .from("disparador_campaigns")
        .select("id, name, status, start_at, created_at, updated_at")
        .eq("workspace_id", payload.workspaceId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true, campaigns: data || [] });
    }

    // ---- campaigns.create
    if (payload.action === "campaigns.create") {
      const name = String(payload.name || "").trim();
      const contactIds = Array.isArray(payload.contactIds) ? payload.contactIds.filter(Boolean) : [];
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const startAt = payload.startAt ? String(payload.startAt) : null;

      if (!name) return json(400, { success: false, error: "name obrigatório" });
      if (contactIds.length === 0) return json(400, { success: false, error: "contactIds vazio" });
      if (!messages.some((m) => String(m?.content || "").trim())) {
        return json(400, { success: false, error: "Ao menos uma mensagem é obrigatória" });
      }

      const { data: campaign, error: campErr } = await supabase
        .from("disparador_campaigns")
        .insert({
          workspace_id: payload.workspaceId,
          name,
          status: "nao_configurada",
          start_at: startAt,
          created_by: systemUserId,
          user_id: systemUserId,
        })
        .select("id")
        .single();

      if (campErr || !campaign?.id) return json(500, { success: false, error: campErr?.message || "Falha ao criar campanha" });
      const campaignId = campaign.id as string;

      try {
        const msgRows = messages
          .map((m) => ({ variation: Number(m.variation), content: String(m.content || "").trim() }))
          .filter((m) => m.content)
          .map((m) => ({ campaign_id: campaignId, variation: m.variation, content: m.content }));

        if (msgRows.length > 0) {
          const { error: msgErr } = await supabase.from("disparador_campaign_messages").insert(msgRows);
          if (msgErr) throw msgErr;
        }

        const linkRows = contactIds.map((cid) => ({
          campaign_id: campaignId,
          contact_id: cid,
          created_by: systemUserId,
        }));

        const { error: linkErr } = await supabase.from("disparador_campaign_contacts").insert(linkRows);
        if (linkErr) throw linkErr;

        return json(200, { success: true, campaignId });
      } catch (e) {
        // rollback best-effort
        await supabase.from("disparador_campaigns").delete().eq("id", campaignId).eq("workspace_id", payload.workspaceId);
        const msg = e instanceof Error ? e.message : String(e);
        return json(500, { success: false, error: msg });
      }
    }

    // ---- campaigns.get
    if (payload.action === "campaigns.get") {
      const campaignId = String(payload.campaignId || "");
      if (!campaignId) return json(400, { success: false, error: "campaignId obrigatório" });

      const { data: campaign, error: campErr } = await supabase
        .from("disparador_campaigns")
        .select("id, name, status, start_at, created_at, updated_at")
        .eq("workspace_id", payload.workspaceId)
        .eq("id", campaignId)
        .maybeSingle();

      if (campErr) return json(500, { success: false, error: campErr.message });
      if (!campaign) return json(404, { success: false, error: "CAMPAIGN_NOT_FOUND" });

      const { data: msgs, error: msgErr } = await supabase
        .from("disparador_campaign_messages")
        .select("variation, content")
        .eq("campaign_id", campaignId)
        .order("variation", { ascending: true });
      if (msgErr) return json(500, { success: false, error: msgErr.message });

      const { data: links, error: linkErr } = await supabase
        .from("disparador_campaign_contacts")
        .select("contact_id")
        .eq("campaign_id", campaignId);
      if (linkErr) return json(500, { success: false, error: linkErr.message });

      const contactIds = (links || []).map((l: any) => l.contact_id).filter(Boolean);

      return json(200, { success: true, campaign, messages: msgs || [], contactIds });
    }

    // ---- campaigns.update
    if (payload.action === "campaigns.update") {
      const campaignId = String(payload.campaignId || "");
      const name = String(payload.name || "").trim();
      const contactIds = Array.isArray(payload.contactIds) ? payload.contactIds.filter(Boolean) : [];
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const startAt = payload.startAt ? String(payload.startAt) : null;

      if (!campaignId) return json(400, { success: false, error: "campaignId obrigatório" });
      if (!name) return json(400, { success: false, error: "name obrigatório" });
      if (contactIds.length === 0) return json(400, { success: false, error: "contactIds vazio" });
      if (!messages.some((m) => String(m?.content || "").trim())) {
        return json(400, { success: false, error: "Ao menos uma mensagem é obrigatória" });
      }

      // garante que a campanha pertence ao workspace
      const { data: existing, error: existsErr } = await supabase
        .from("disparador_campaigns")
        .select("id")
        .eq("workspace_id", payload.workspaceId)
        .eq("id", campaignId)
        .maybeSingle();
      if (existsErr) return json(500, { success: false, error: existsErr.message });
      if (!existing) return json(404, { success: false, error: "CAMPAIGN_NOT_FOUND" });

      const { error: updErr } = await supabase
        .from("disparador_campaigns")
        .update({ name, start_at: startAt, updated_at: new Date().toISOString() })
        .eq("workspace_id", payload.workspaceId)
        .eq("id", campaignId);
      if (updErr) return json(500, { success: false, error: updErr.message });

      try {
        // mensagens: recria
        await supabase.from("disparador_campaign_messages").delete().eq("campaign_id", campaignId);
        const msgRows = messages
          .map((m) => ({ variation: Number(m.variation), content: String(m.content || "").trim() }))
          .filter((m) => m.content)
          .map((m) => ({ campaign_id: campaignId, variation: m.variation, content: m.content }));
        if (msgRows.length > 0) {
          const { error: msgErr } = await supabase.from("disparador_campaign_messages").insert(msgRows);
          if (msgErr) throw msgErr;
        }

        // contatos: recria vínculos
        await supabase.from("disparador_campaign_contacts").delete().eq("campaign_id", campaignId);
        const linkRows = contactIds.map((cid) => ({ campaign_id: campaignId, contact_id: cid, created_by: systemUserId }));
        const { error: linkErr } = await supabase.from("disparador_campaign_contacts").insert(linkRows);
        if (linkErr) throw linkErr;

        return json(200, { success: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return json(500, { success: false, error: msg });
      }
    }

    // ---- campaigns.report
    if (payload.action === "campaigns.report") {
      const campaignId = String(payload.campaignId || "");
      if (!campaignId) return json(400, { success: false, error: "campaignId obrigatório" });
      const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

      const { data: campaign, error: campErr } = await supabase
        .from("disparador_campaigns")
        .select("id, name, status, start_at, created_at, updated_at")
        .eq("workspace_id", payload.workspaceId)
        .eq("id", campaignId)
        .maybeSingle();
      if (campErr) return json(500, { success: false, error: campErr.message });
      if (!campaign) return json(404, { success: false, error: "CAMPAIGN_NOT_FOUND" });

      const { data: links, error: linkErr } = await supabase
        .from("disparador_campaign_contacts")
        .select("contact_id")
        .eq("campaign_id", campaignId);
      if (linkErr) return json(500, { success: false, error: linkErr.message });
      const contactIds = (links || []).map((l: any) => l.contact_id).filter(Boolean);

      const { data: contactsData, error: contactsErr } = contactIds.length === 0
        ? { data: [], error: null }
        : await supabase
          .from("disparador_contacts_imported")
          .select("id, name, phone, tag, document_name")
          .eq("workspace_id", payload.workspaceId)
          .in("id", contactIds)
          .limit(2000);
      if (contactsErr) return json(500, { success: false, error: contactsErr.message });

      const { data: sends, error: sendsErr } = await supabase
        .from("disparador_send_events")
        .select("contact_id, status, occurred_at")
        .eq("workspace_id", payload.workspaceId)
        .eq("campaign_id", campaignId);
      if (sendsErr) return json(500, { success: false, error: sendsErr.message });

      const { data: resps, error: respsErr } = await supabase
        .from("disparador_response_events")
        .select("contact_id, kind, occurred_at")
        .eq("workspace_id", payload.workspaceId)
        .eq("campaign_id", campaignId);
      if (respsErr) return json(500, { success: false, error: respsErr.message });

      const sendByContact = new Map<string, any>();
      (sends || []).forEach((s: any) => sendByContact.set(s.contact_id, s));
      const respByContact = new Map<string, any>();
      (resps || []).forEach((r: any) => respByContact.set(r.contact_id, r));

      const totalContatos = contactIds.length;
      // Preferir a tabela nova (disparador_campaign_message_send) para total de enviadas.
      // Observação: como essa tabela não tem workspace_id, aqui filtramos diretamente por campaign_id.
      let totalEnviadas = 0;
      try {
        const { count } = await supabase
          .from("disparador_campaign_message_send")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaignId);
        totalEnviadas = Number(count || 0);
      } catch {
        // fallback: caso a tabela não exista ainda ou dê erro, usa send_events
        totalEnviadas = (sends || []).filter((s: any) => s.status === "sent").length;
      }
      const totalFalhas = (sends || []).filter((s: any) => s.status === "failed").length;
      const totalQueued = (sends || []).filter((s: any) => s.status === "queued").length;

      const totalRespostas = (resps || []).length;
      const respostasPositivas = (resps || []).filter((r: any) => r.kind === "positive").length;
      const respostasNegativas = (resps || []).filter((r: any) => r.kind === "negative").length;

      const conversaoPositivaPct = pct(respostasPositivas, totalEnviadas);
      const conversaoNegativaPct = pct(respostasNegativas, totalEnviadas);

      const contacts = (contactsData || [])
        .map((c: any) => {
          const s = sendByContact.get(c.id);
          const r = respByContact.get(c.id);
          return {
            ...c,
            send_status: s?.status || null,
            response_kind: r?.kind || null,
          };
        })
        .sort((a: any, b: any) => String(a.document_name || "").localeCompare(String(b.document_name || "")));

      return json(200, {
        success: true,
        campaign,
        kpis: {
          totalContatos,
          totalEnviadas,
          totalRespostas,
          totalFalhas,
          respostasPositivas,
          conversaoPositivaPct,
          respostasNegativas,
          conversaoNegativaPct,
        },
        sendStatus: {
          queued: totalQueued,
          sent: totalEnviadas,
          failed: totalFalhas,
        },
        contacts,
      });
    }

    // ---- campaigns.delete
    if (payload.action === "campaigns.delete") {
      const campaignId = String(payload.campaignId || "");
      if (!campaignId) return json(400, { success: false, error: "campaignId obrigatório" });
      const { error } = await supabase
        .from("disparador_campaigns")
        .delete()
        .eq("workspace_id", payload.workspaceId)
        .eq("id", campaignId);
      if (error) return json(500, { success: false, error: error.message });
      return json(200, { success: true });
    }

    // ---- dashboard.get
    if (payload.action === "dashboard.get") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();
      const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0);

      const [activeRes, campaignIdsRes, totalFailedRes, respRes] = await Promise.all([
        supabase
          .from("disparador_campaigns")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", payload.workspaceId)
          .neq("status", "concluida"),
        supabase
          .from("disparador_campaigns")
          .select("id")
          .eq("workspace_id", payload.workspaceId),
        supabase
          .from("disparador_send_events")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", payload.workspaceId)
          .eq("status", "failed"),
        supabase
          .from("disparador_response_events")
          .select("id, kind")
          .eq("workspace_id", payload.workspaceId),
      ]);

      const campanhasAtivas = Number(activeRes?.count || 0);
      const totalFalhas = Number(totalFailedRes?.count || 0);

      // Envios hoje / total enviadas:
      // Preferir a tabela nova disparador_campaign_message_send (quando existir) para alimentar o card.
      // Como essa tabela não tem workspace_id, filtramos por campanhas do workspace.
      let enviosHoje = 0;
      let totalEnviadas = 0;
      const campaignIds = (Array.isArray(campaignIdsRes?.data) ? campaignIdsRes.data : [])
        .map((r: any) => r?.id)
        .filter(Boolean);

      if (campaignIds.length > 0) {
        try {
          const [sentTodayFromMsgSend, totalSentFromMsgSend] = await Promise.all([
            supabase
              .from("disparador_campaign_message_send")
              .select("id", { count: "exact", head: true })
              .in("campaign_id", campaignIds)
              .gte("created_at", todayIso),
            supabase
              .from("disparador_campaign_message_send")
              .select("id", { count: "exact", head: true })
              .in("campaign_id", campaignIds),
          ]);

          enviosHoje = Number(sentTodayFromMsgSend?.count || 0);
          totalEnviadas = Number(totalSentFromMsgSend?.count || 0);
        } catch {
          // fallback silencioso (mantém 0) caso a tabela não exista ou dê erro
          enviosHoje = 0;
          totalEnviadas = 0;
        }
      }

      const respRows: any[] = Array.isArray(respRes?.data) ? (respRes.data as any[]) : [];
      const totalRespostas = respRows.length;
      const respostasPositivas = respRows.filter((r) => r.kind === "positive").length;
      const respostasNegativas = respRows.filter((r) => r.kind === "negative").length;

      const taxaRespostaTotalPct = pct(totalRespostas, totalEnviadas);
      const conversaoPositivaPct = pct(respostasPositivas, totalEnviadas);
      const conversaoNegativaPct = pct(respostasNegativas, totalEnviadas);

      const { data: sendsData } = await supabase
        .from("disparador_send_events")
        .select("triggered_by, status, campaign_id, contact_id")
        .eq("workspace_id", payload.workspaceId);

      const { data: respData } = await supabase
        .from("disparador_response_events")
        .select("campaign_id, contact_id, kind")
        .eq("workspace_id", payload.workspaceId);

      const sends: any[] = Array.isArray(sendsData) ? (sendsData as any[]) : [];
      const resps: any[] = Array.isArray(respData) ? (respData as any[]) : [];
      const respKey = new Map<string, any>();
      resps.forEach((r) => respKey.set(`${r.campaign_id}:${r.contact_id}`, r));

      const agg = new Map<string, any>();
      sends.forEach((s) => {
        const uid = s.triggered_by || "unknown";
        if (!agg.has(uid)) agg.set(uid, { user_id: uid, sent: 0, failed: 0, responses: 0, positive: 0, negative: 0 });
        const a = agg.get(uid);
        if (s.status === "sent") a.sent += 1;
        if (s.status === "failed") a.failed += 1;
        const r = respKey.get(`${s.campaign_id}:${s.contact_id}`);
        if (r) {
          a.responses += 1;
          if (r.kind === "positive") a.positive += 1;
          if (r.kind === "negative") a.negative += 1;
        }
      });

      const userIds = Array.from(agg.keys()).filter((id) => id !== "unknown");
      const userNames = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: usersData } = await supabase.from("system_users").select("id, name").in("id", userIds);
        (usersData || []).forEach((u: any) => userNames.set(u.id, u.name));
      }

      const userPerf = Array.from(agg.values())
        .map((r) => {
          const sent = Number(r.sent || 0);
          const responses = Number(r.responses || 0);
          const positive = Number(r.positive || 0);
          const negative = Number(r.negative || 0);
          return {
            ...r,
            user_name: r.user_id === "unknown" ? "Sistema/Desconhecido" : (userNames.get(r.user_id) || r.user_id),
            responseRatePct: pct(responses, sent),
            positiveConvPct: pct(positive, sent),
            negativeConvPct: pct(negative, sent),
          };
        })
        .sort((a, b) => (b.sent || 0) - (a.sent || 0));

      return json(200, {
        success: true,
        kpis: {
          campanhasAtivas,
          enviosHoje,
          taxaRespostaTotalPct,
          respostasPositivas,
          respostasNegativas,
          conversaoPositivaPct,
          conversaoNegativaPct,
          totalEnviadas,
          totalFalhas,
        },
        userPerf,
      });
    }

    return json(400, { success: false, error: "UNKNOWN_ACTION" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      msg === "AUTH_REQUIRED" ? 401 :
      msg === "INVALID_USER" ? 401 :
      msg === "NOT_WORKSPACE_MEMBER" ? 403 :
      500;
    return json(status, { success: false, error: msg });
  }
});

