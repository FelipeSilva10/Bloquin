import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  ADMIN_HANDOFF_AUDIENCE,
  ADMIN_HANDOFF_PURPOSE,
  getAuthSessionIdFromJwt,
} from "./adminHandoffCore.ts";
import {
  publishableApiKey,
  secretApiKey,
} from "./supabaseApiKeys.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

export interface FunctionContext {
  admin: SupabaseClient;
  user: User;
  authSessionId: string;
}

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("BLOQUIN_ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders(request),
  });
}

export async function authenticateFunctionRequest(
  request: Request,
): Promise<FunctionContext | Response> {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse(request, { error: "origin_not_allowed" }, 403);
  }

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/iu);
  if (!match) {
    return jsonResponse(request, { error: "authentication_required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = publishableApiKey(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
  );
  const secretKey = secretApiKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse(request, { error: "server_not_configured" }, 500);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await userClient.auth.getUser(match[1]);
  if (error || !data.user) {
    return jsonResponse(request, { error: "invalid_session" }, 401);
  }
  const authSessionId = getAuthSessionIdFromJwt(match[1]);
  if (!authSessionId) {
    return jsonResponse(request, { error: "invalid_session" }, 401);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return { admin, user: data.user, authSessionId };
}

export function isFunctionContext(
  value: FunctionContext | Response,
): value is FunctionContext {
  return !(value instanceof Response);
}

export const handoffScope = {
  purpose: ADMIN_HANDOFF_PURPOSE,
  audience: ADMIN_HANDOFF_AUDIENCE,
} as const;
