import { supabaseClient } from './supabaseClient';

// O scraper-service agora exige login (sessão Supabase válida) em toda rota /api —
// antes disso qualquer pessoa com a URL (pública no bundle do site) conseguia
// chamar scrape/discovery direto. Esse helper injeta o token da sessão atual.
export async function scraperFetch(url, options = {}) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = { ...(options.headers || {}) };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return fetch(url, { ...options, headers });
}
