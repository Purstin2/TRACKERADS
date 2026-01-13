// Script de debug para testar scraping localmente
import { scrapeFacebookAdsCount } from './scraper.js';

const testUrl = process.argv[2] || 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=576413898885490';

console.log('🧪 TESTE DE SCRAPING COM DEBUG');
console.log('================================\n');
console.log(`URL: ${testUrl}\n`);

scrapeFacebookAdsCount(testUrl)
    .then(result => {
        console.log('\n✅ RESULTADO:');
        console.log('==================');
        console.log(`Success: ${result.success}`);
        console.log(`Ad Count: ${result.adCount}`);
        console.log(`Error: ${result.error || 'Nenhum'}`);
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error('\n❌ ERRO:', error);
        process.exit(1);
    });
