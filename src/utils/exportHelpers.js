export const exportToCSV = (offers, adCountsMap = {}) => {
    const headers = ['Nome', 'Link', 'Tags', 'Anúncios Atuais', 'Última Atualização', 'Status', 'Criado Em'];

    const rows = offers.map(offer => {
        const adCounts = adCountsMap[offer.id] || [];
        const latestCount = adCounts[0]?.count ?? offer.last_ad_count ?? 0;

        return [
            `"${offer.name.replace(/"/g, '""')}"`,
            `"${offer.link.replace(/"/g, '""')}"`,
            `"${(offer.tags || []).join(', ')}"`,
            latestCount,
            offer.last_ad_count_timestamp || 'N/A',
            offer.is_archived ? 'Arquivado' : 'Ativo',
            offer.created_at
        ];
    });

    const csv = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `trackerads_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToJSON = (offers, adCountsMap = {}) => {
    const exportData = offers.map(offer => ({
        id: offer.id,
        name: offer.name,
        link: offer.link,
        tags: offer.tags || [],
        currentAdCount: adCountsMap[offer.id]?.[0]?.count ?? offer.last_ad_count ?? 0,
        lastUpdate: offer.last_ad_count_timestamp,
        isArchived: offer.is_archived,
        createdAt: offer.created_at,
        updatedAt: offer.updated_at,
        adCountHistory: adCountsMap[offer.id] || []
    }));

    const json = JSON.stringify({
        exportDate: new Date().toISOString(),
        totalOffers: offers.length,
        offers: exportData
    }, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `trackerads_export_${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportDetailedReport = async (offers, supabaseClient, userId) => {
    const detailedData = await Promise.all(
        offers.map(async (offer) => {
            const { data: adCounts } = await supabaseClient
                .from('ad_counts')
                .select('*')
                .eq('offer_id', offer.id)
                .eq('user_id', userId)
                .order('timestamp', { ascending: false });

            const { data: comments } = await supabaseClient
                .from('comments')
                .select('*')
                .eq('offer_id', offer.id)
                .eq('user_id', userId)
                .order('timestamp', { ascending: false });

            return {
                offer: {
                    id: offer.id,
                    name: offer.name,
                    link: offer.link,
                    tags: offer.tags || [],
                    isArchived: offer.is_archived,
                    createdAt: offer.created_at
                },
                adCounts: adCounts || [],
                comments: comments || [],
                stats: {
                    totalRecords: (adCounts || []).length,
                    maxCount: Math.max(...(adCounts || []).map(ac => ac.count), 0),
                    minCount: Math.min(...(adCounts || []).map(ac => ac.count), Infinity),
                    avgCount: (adCounts || []).length > 0
                        ? (adCounts.reduce((sum, ac) => sum + ac.count, 0) / adCounts.length).toFixed(2)
                        : 0
                }
            };
        })
    );

    const json = JSON.stringify({
        exportDate: new Date().toISOString(),
        totalOffers: offers.length,
        detailedData
    }, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `trackerads_detailed_report_${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
