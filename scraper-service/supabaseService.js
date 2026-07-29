import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_KEY devem estar definidas no .env');
    process.exit(1);
}

// Cliente Supabase com service key (bypassa RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Busca todas as ofertas que têm link da biblioteca do Facebook
 * @returns {Promise<Array>}
 */
export async function getOffersWithFacebookLinks() {
    try {
        const { data, error } = await supabase
            .from('offers')
            .select('*')
            .not('link', 'is', null)
            .neq('link', '')
            .eq('is_archived', false);
        
        if (error) throw error;
        
        // Filtra apenas links do Facebook Ads Library
        const facebookOffers = data.filter(offer => 
            offer.link && offer.link.includes('facebook.com/ads/library')
        );
        
        console.log(`[SUPABASE] Encontradas ${facebookOffers.length} ofertas com links do Facebook Ads Library`);
        return facebookOffers;
        
    } catch (error) {
        console.error('[SUPABASE] Erro ao buscar ofertas:', error);
        return [];
    }
}

/**
 * Atualiza o contador de anúncios de uma oferta
 * IMPORTANTE: Também cria um registro em ad_counts para manter o histórico.
 * adCount = 0 é VÁLIDO (oferta morta) e DEVE ser gravado.
 * @param {string} offerId - ID da oferta
 * @param {number} adCount - Número de anúncios (0 = morta)
 * @param {{oldestAdDate?: string|null, daysRunning?: number|null}} [meta] - sinais de vitalidade
 * @returns {Promise<boolean>}
 */
export async function updateOfferAdCount(offerId, adCount, meta = {}) {
    try {
        const timestamp = new Date().toISOString();

        // 1. Busca a oferta para pegar o user_id
        const { data: offer, error: fetchError } = await supabase
            .from('offers')
            .select('user_id')
            .eq('id', offerId)
            .single();

        if (fetchError) throw fetchError;
        if (!offer) throw new Error('Oferta não encontrada');

        // 2. Cria registro em ad_counts (HISTÓRICO para gráficos)
        const { error: insertError } = await supabase
            .from('ad_counts')
            .insert([{
                offer_id: offerId,
                user_id: offer.user_id,
                count: adCount,
                timestamp: timestamp
            }]);

        if (insertError) {
            console.error(`[SUPABASE] Erro ao criar registro em ad_counts:`, insertError);
            throw insertError;
        }

        console.log(`[SUPABASE] ✓ Registro criado em ad_counts: ${adCount} anúncios`);

        // 3. Atualiza a tabela offers com os últimos valores
        const { error: updateError } = await supabase
            .from('offers')
            .update({
                last_ad_count: adCount,
                last_ad_count_timestamp: timestamp
            })
            .eq('id', offerId);

        if (updateError) throw updateError;

        // 4. Best-effort: grava sinais de vitalidade (data do anúncio mais antigo /
        //    dias rodando / status). Não falha o job se as colunas ainda não existirem.
        const enrich = {};
        if (meta.oldestAdDate !== undefined && meta.oldestAdDate !== null) {
            enrich.oldest_ad_date = String(meta.oldestAdDate).split('T')[0];
        }
        if (meta.daysRunning !== undefined && meta.daysRunning !== null) {
            enrich.days_running = meta.daysRunning;
        }
        enrich.last_scrape_status = adCount === 0 ? 'dead' : 'active';

        if (Object.keys(enrich).length > 0) {
            const { error: enrichError } = await supabase
                .from('offers')
                .update(enrich)
                .eq('id', offerId);
            if (enrichError) {
                console.warn(`[SUPABASE] (aviso) não gravou metadados de vitalidade — rode a migração SQL: ${enrichError.message}`);
            }
        }

        console.log(`[SUPABASE] ✓ Oferta ${offerId} atualizada: ${adCount} anúncios`);
        return true;

    } catch (error) {
        console.error(`[SUPABASE] Erro ao atualizar oferta ${offerId}:`, error);
        return false;
    }
}

/**
 * Atualiza SÓ o nome de uma oferta (renomear com o nome real da Página).
 * Não toca em mais nada.
 */
export async function updateOfferName(offerId, name) {
    try {
        if (!name || !String(name).trim()) return false;
        const { error } = await supabase
            .from('offers')
            .update({ name: String(name).trim(), updated_at: new Date().toISOString() })
            .eq('id', offerId);
        if (error) throw error;
        console.log(`[SUPABASE] ✓ Oferta ${offerId} renomeada: "${name}"`);
        return true;
    } catch (error) {
        console.error(`[SUPABASE] Erro ao renomear ${offerId}:`, error.message);
        return false;
    }
}

// ─── DISCOVERY FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Busca todas as keywords de discovery ativas (todos os usuários)
 */
export async function getActiveDiscoveryKeywords() {
    try {
        const { data, error } = await supabase
            .from('discovery_keywords')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[SUPABASE] Erro ao buscar keywords:', error);
        return [];
    }
}

/**
 * Atualiza o last_run_at de uma keyword
 */
export async function updateKeywordLastRun(keywordId) {
    try {
        const { error } = await supabase
            .from('discovery_keywords')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', keywordId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[SUPABASE] Erro ao atualizar last_run_at:', error);
        return false;
    }
}

/**
 * Salva ofertas descobertas no banco.
 * Usa upsert por (user_id, facebook_link) para evitar duplicatas —
 * se já existir e ainda estiver 'pending', atualiza o ad_count.
 */
export async function saveDiscoveredOffers(userId, offers) {
    if (!offers || offers.length === 0) return true;

    try {
        const rows = offers.map(o => ({
            user_id: userId,
            keyword: o.keyword,
            advertiser_name: o.advertiser_name,
            facebook_page_id: o.facebook_page_id,
            facebook_link: o.facebook_link,
            ad_count: o.ad_count,
            days_running: o.days_running,
            oldest_ad_date: o.oldest_ad_date,
            status: 'pending',
            discovered_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('discovered_offers')
            .upsert(rows, {
                onConflict: 'user_id,facebook_link',
                ignoreDuplicates: false
            });

        if (error) throw error;

        console.log(`[SUPABASE] ${rows.length} ofertas descobertas salvas para user ${userId}`);
        return true;
    } catch (error) {
        console.error('[SUPABASE] Erro ao salvar discovered_offers:', error);
        return false;
    }
}

/**
 * Busca descobertas de um usuário específico
 */
export async function getDiscoveredOffers(userId) {
    try {
        const { data, error } = await supabase
            .from('discovered_offers')
            .select('*')
            .eq('user_id', userId)
            .order('discovered_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[SUPABASE] Erro ao buscar discovered_offers:', error);
        return [];
    }
}

/**
 * Atualiza o status de uma oferta descoberta
 * @param {string} id - ID da discovered_offer
 * @param {'pending'|'added'|'dismissed'} status
 */
export async function updateDiscoveredOfferStatus(id, status) {
    try {
        const { error } = await supabase
            .from('discovered_offers')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[SUPABASE] Erro ao atualizar status:', error);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra um log de scraping (opcional - para histórico)
 * @param {string} offerId - ID da oferta
 * @param {number|null} adCount - Número de anúncios encontrados
 * @param {boolean} success - Se o scraping foi bem-sucedido
 * @param {string|null} error - Mensagem de erro (se houver)
 */
export async function logScrapingResult(offerId, adCount, success, error = null) {
    try {
        // Você pode criar uma tabela 'scraping_logs' para manter histórico
        // Por enquanto, apenas loga no console
        const logEntry = {
            offer_id: offerId,
            ad_count: adCount,
            success,
            error,
            timestamp: new Date().toISOString()
        };
        
        console.log('[SUPABASE] Log de scraping:', JSON.stringify(logEntry));
        
        // Descomente abaixo se criar a tabela scraping_logs
        // await supabase.from('scraping_logs').insert(logEntry);
        
    } catch (error) {
        console.error('[SUPABASE] Erro ao registrar log:', error);
    }
}
