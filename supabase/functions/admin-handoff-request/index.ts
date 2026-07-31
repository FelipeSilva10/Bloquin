import "@supabase/functions-js/edge-runtime.d.ts";
import {
  generateOpaqueCode,
  isSourceSessionToken,
  sha256Hex,
} from "../_shared/adminHandoffCore.ts";
import {
  authenticateFunctionRequest,
  corsHeaders,
  handoffScope,
  isFunctionContext,
  jsonResponse,
} from "../_shared/adminHandoffHttp.ts";

interface HandoffBody {
  sessionToken?: unknown;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "POST") {
      return jsonResponse(request, { error: "method_not_allowed" }, 405);
    }

    const context = await authenticateFunctionRequest(request);
    if (!isFunctionContext(context)) return context;

    let body: HandoffBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(request, { error: "invalid_json" }, 400);
    }
    if (!isSourceSessionToken(body.sessionToken)) {
      return jsonResponse(request, { error: "invalid_source_session" }, 400);
    }

    const code = generateOpaqueCode();
    const [codeHash, sourceSessionHash] = await Promise.all([
      sha256Hex(code),
      sha256Hex(body.sessionToken),
    ]);

    const { data, error } = await context.admin.rpc(
      "issue_admin_panel_handoff",
      {
        p_actor_id: context.user.id,
        p_source_auth_session_id: context.authSessionId,
        p_code_hash: codeHash,
        p_source_session_token_hash: sourceSessionHash,
        p_purpose: handoffScope.purpose,
        p_audience: handoffScope.audience,
      },
    );

    if (error || !Array.isArray(data) || data.length !== 1) {
      const status = error?.code === "42501" ? 403 : 500;
      return jsonResponse(
        request,
        { error: status === 403 ? "teacher_not_authorized" : "handoff_failed" },
        status,
      );
    }

    return jsonResponse(request, {
      code,
      actorId: context.user.id,
      expiresAt: data[0].expires_at,
    });
  },
};
