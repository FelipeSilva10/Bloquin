import "@supabase/functions-js/edge-runtime.d.ts";
import {
  isSourceSessionToken,
  sha256Hex,
} from "../_shared/adminHandoffCore.ts";
import {
  authenticateFunctionRequest,
  corsHeaders,
  isFunctionContext,
  jsonResponse,
} from "../_shared/adminHandoffHttp.ts";

interface RevokeBody {
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

    let body: RevokeBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(request, { error: "invalid_json" }, 400);
    }
    if (!isSourceSessionToken(body.sessionToken)) {
      return jsonResponse(request, { error: "invalid_source_session" }, 400);
    }

    const sourceSessionHash = await sha256Hex(body.sessionToken);
    const { data, error } = await context.admin.rpc(
      "revoke_admin_panel_access",
      {
        p_actor_id: context.user.id,
        p_source_session_token_hash: sourceSessionHash,
        p_reason: "bloquin_logout",
      },
    );

    if (error) {
      return jsonResponse(request, { error: "revocation_failed" }, 500);
    }

    return jsonResponse(request, {
      ok: true,
      revokedSessions: typeof data === "number" ? data : 0,
    });
  },
};
