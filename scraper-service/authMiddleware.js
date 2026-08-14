// Exige uma sessão Supabase válida em toda rota /api.
// Antes disso, qualquer pessoa com a URL do serviço (que fica pública no
// bundle do site, mesmo sem login) conseguia chamar scrape/discovery/offers
// direto. Agora cada requisição precisa do access_token de um usuário
// autenticado — verificado contra o próprio Supabase (não é uma senha fixa).
import { supabase } from './supabaseService.js';

export async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ success: false, error: 'Login necessário' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada' });
    }

    req.user = data.user;
    next();
}
