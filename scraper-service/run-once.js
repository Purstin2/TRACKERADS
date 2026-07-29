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
    // Discovery v2 (GraphQL): o FB removeu os links do DOM, mas agora extraímos
    // page_id/nome/datas do JSON da própria Ad Library → voltou a funcionar. Roda
    // no "all" e sob demanda (job=discovery). Estado/logs/filtros no app_state.
    if (job === 'all' || job === 'discovery')   await step('Discovery (keywords)', runDiscoveryJob);
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
