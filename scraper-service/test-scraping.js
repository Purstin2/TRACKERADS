import { scrapeFacebookAdsCount } from './scraper.js';

// Script de teste rápido do scraping
const testUrl = process.argv[2] || 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=576413898805490';

console.log('🧪 TESTE DE SCRAPING');
console.log('==================\n');
console.log(`📍 URL: ${testUrl}\n`);
console.log('⏳ Aguarde...\n');

scrapeFacebookAdsCount(testUrl)
    .then(result => {
        console.log('\n✅ RESULTADO:');
        console.log('==================');
        console.log(`Success: ${result.success}`);
        console.log(`Ad Count: ${result.adCount}`);
        console.log(`Error: ${result.error || 'Nenhum'}`);
        console.log('\n✅ Teste concluído!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ ERRO NO TESTE:', error);
        process.exit(1);
    });
