// Armazena informações do último scraping
let lastScrapingInfo = {
    timestamp: null,
    success: false,
    offersProcessed: 0,
    results: null
};

export function setLastScrapingInfo(info) {
    lastScrapingInfo = {
        ...info,
        timestamp: new Date().toISOString()
    };
}

export function getLastScrapingInfo() {
    return lastScrapingInfo;
}
