/**
 * Script de execução única — chamado pelo GitHub Actions
 * Roda o job de scraping e encerra o processo
 */
import dotenv from 'dotenv';
dotenv.config();

import { runScrapingJob } from './scheduler.js';

console.log('▶️  Scraping iniciado pelo GitHub Actions...');
console.log(`⏰  ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`);

runScrapingJob()
    .then(() => {
        console.log('\n✅ Scraping finalizado com sucesso.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Erro no scraping:', err);
        process.exit(1);
    });
