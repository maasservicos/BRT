import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = "https://ooudzxszovimsmfypckz.supabase.co";
const SUPABASE_KEY = "sb_publishable_8WyuhLagGwQZFaaWKqXqYA_UJ6toANR";

// Cria a conexão e exporta para o ordemdeservico.js usar
export const client = createClient(SUPABASE_URL, SUPABASE_KEY);

// === TESTE DE CONEXÃO ===
console.log("Cliente Supabase inicializado:", client);