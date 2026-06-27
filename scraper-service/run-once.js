/**
 * Script de execução única — chamado pelo GitHub Actions (nuvem, sem rede local).
 * Roda os jobs e encerra o processo.
 *
 * Controla quais jobs rodam via env JOB (default "all"):
 *   all        → scraping (ad counts) + nomes reais + discovery
 *   scraping   → só ad counts
 *   names      → só nomes reais das páginas
 *   discovery  → só descoberta por keyword
 * O workflow passa JOB a partir do input do "Run workflow" (default all nas execuções agendadas).
 */
import dotenv from 'dotenv';
dotenv.config();

import { runScrapingJob, runDiscoveryJob, runNamesJob } from './scheduler.js';

const job = (process.env.JOB || 'all').toLowerCase();
console.log('▶️  run-once iniciado pelo GitHub Actions');
console.log(`🎯  JOB=${job}`);
console.log(`⏰  ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`);

// roda cada job isolado: se um falhar, os outros ainda rodam
async function step(name, fn) {
    try {
        console.log(`\n=== ▶ ${name} ===`);
        const r = await fn();
        console.log(`=== ✅ ${name} ok ===`, r ?? '');
    } catch (e) {
        console.error(`=== ❌ ${name} falhou: ${e.message} ===`);
    }
}

async function main() {
    if (job === 'all' || job === 'scraping')   await step('Scraping (ad counts)', runScrapingJob);
    if (job === 'all' || job === 'names')       await step('Nomes reais', runNamesJob);
    // Discovery FORA do "all": o FB escondeu o id real do anunciante na busca, então
    // a contagem dá 0 — não vale rodar 2x/dia à toa. Descoberta = GGSPY + add na mão.
    // Ainda dá pra rodar manualmente com job=discovery se um dia houver fix.
    if (job === 'discovery')                    await step('Discovery (keywords)', runDiscoveryJob);
}

main()
    .then(() => {
        console.log('\n✅ run-once finalizado.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ run-once erro fatal:', err);
        process.exit(1);
    });
