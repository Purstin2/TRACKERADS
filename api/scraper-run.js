// api/scraper-run.js — dispara o scraper na NUVEM (GitHub Actions), sem rede local.
// O frontend (Buscar Agora / Nomes reais) chama esta função; ela aciona o
// workflow_dispatch do scraper.yml no repo, que roda o mesmo job do agendamento.
//   GET/POST /api/scraper-run?job=names|discovery|scraping|all  (default all)
// Precisa do env GH_DISPATCH_TOKEN: PAT do GitHub com permissão Actions:write
// no repo Purstin2/TRACKERADS.

const REPO = process.env.GH_REPO || 'Purstin2/TRACKERADS'
const WORKFLOW = process.env.GH_WORKFLOW || 'scraper.yml'
const REF = process.env.GH_REF || 'main'
const JOBS = ['all', 'scraping', 'names', 'discovery']

export default async function handler(req, res) {
  const token = process.env.GH_DISPATCH_TOKEN
  if (!token) {
    return res.status(503).json({
      ok: false,
      error: 'GH_DISPATCH_TOKEN não configurado na Vercel. Adicione o token do GitHub pra ligar o disparo on-demand.',
    })
  }

  const raw = (req.query?.job || req.body?.job || 'all').toString().toLowerCase()
  const job = JOBS.includes(raw) ? raw : 'all'

  try {
    const r = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'purstinlab-scraper-run',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: REF, inputs: { job } }),
      },
    )

    // workflow_dispatch responde 204 No Content em sucesso
    if (r.status === 204) {
      return res.status(200).json({
        ok: true,
        job,
        message: `Rodada "${job}" disparada na nuvem. Os resultados aparecem em alguns minutos (o site lê do Supabase).`,
      })
    }

    const detail = await r.text().catch(() => '')
    return res.status(502).json({
      ok: false,
      job,
      error: `GitHub recusou (${r.status}). ${detail?.slice(0, 300) || ''}`.trim(),
    })
  } catch (e) {
    return res.status(500).json({ ok: false, job, error: e.message })
  }
}
