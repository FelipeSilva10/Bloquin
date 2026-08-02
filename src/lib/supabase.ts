import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (
  !supabaseUrl
  || !supabasePublishableKey?.startsWith("sb_publishable_")
) {
  throw new Error("Faltam as variáveis de ambiente do Supabase no arquivo .env");
}

// Conexão principal (usada pelo app inteiro). As opções explícitas tornam o
// contrato da sessão do desktop independente de mudanças nos defaults da SDK.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Conexão secundária (usada APENAS pelo professor para cadastrar alunos sem ser deslogado)
export const supabaseHelper = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
