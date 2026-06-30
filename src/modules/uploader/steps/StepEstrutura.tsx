import { DollarSign, Layers, Tag, Calendar, Check, X, Boxes, Globe, Plus } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import { Card, Input, Select } from '../components/fields'
import {
  COUNTRY_GROUPS,
  ESTRUTURA_INFO,
  type Estrutura,
} from '../types'

const ALL_CODES = COUNTRY_GROUPS.flatMap((g) => g.countries.map((c) => c.code))
const ALL_COUNTRIES = COUNTRY_GROUPS.flatMap((g) => g.countries)

const EST_CARDS: { id: Estrutura; title: string; viz: string[]; desc: string }[] = [
  {
    id: 'N11',
    title: 'N × 1 × 1',
    viz: ['Camp×N', 'Conj 1', 'Ad 1'],
    desc: '1 campanha por criativo. Melhor para testes isolados.',
  },
  {
    id: '1N1',
    title: '1 × N × 1',
    viz: ['Camp 1', 'Conj×N', 'Ad 1'],
    desc: '1 campanha, 1 conjunto por criativo. Bom com CBO.',
  },
  {
    id: '11N',
    title: '1 × 1 × N',
    viz: ['Camp 1', 'Conj 1', 'Ad×N'],
    desc: 'Tudo em 1 conjunto. Facebook otimiza entre criativos.',
  },
]

export default function StepEstrutura({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const ctx = useUploader()
  const { form, budgetType, estrutura, paises } = ctx

  return (
    <div>
      <div className="mb-1 text-[21px] font-extrabold tracking-tight">
        Estrutura da Campanha
      </div>
      <div className="mb-6 text-[13px] text-muted2">
        Como organizar campanhas, conjuntos e anúncios
      </div>

      {/* tipo de anúncio: vídeo x catálogo */}
      <Card title="Tipo de Anúncio" icon={<Boxes className="h-3.5 w-3.5" />}>
        <div className="flex gap-2.5">
          {([
            { id: 'video', t: 'Vídeo', d: 'Anúncio normal de vídeo (atual)' },
            { id: 'catalogo', t: 'Catálogo', d: 'Roda o vídeo como anúncio de catálogo — esconde na biblioteca' },
          ] as const).map((o) => (
            <button
              key={o.id}
              onClick={() => ctx.setField('tipo_anuncio', o.id)}
              className={`flex-1 rounded-xl border p-3.5 text-center transition-all ${
                (form.tipo_anuncio || 'video') === o.id
                  ? 'border-brand bg-brand/[0.08] shadow-[0_0_0_3px_rgba(99,102,241,.2)]'
                  : 'border-border bg-surface2 hover:border-brand'
              }`}
            >
              <strong className="block text-[14px] font-extrabold text-brand-2">{o.t}</strong>
              <span className="text-[11px] text-muted2">{o.d}</span>
            </button>
          ))}
        </div>
        {form.tipo_anuncio === 'catalogo' && (
          <div className={`mt-3 rounded-[9px] border px-3.5 py-2.5 text-[12px] ${form.catalog_id && form.product_set_id ? 'border-ok/30 bg-ok/[0.07] text-ok' : 'border-warn/30 bg-warn/[0.07] text-warn'}`}>
            {form.catalog_id
              ? form.product_set_id
                ? <>✓ Catálogo <b>{form.catalog_id}</b> · conjunto <b>{form.product_set_id}</b> — pronto.</>
                : <>⚠ Catálogo <b>{form.catalog_id}</b> sem conjunto de produtos. Volte na aba <b>Conta › Catálogo</b>, adicione um produto, escolha o conjunto e clique <b>"Usar este catálogo"</b>.</>
              : <>⚠ Nenhum catálogo selecionado. Vá na aba <b>Conta › Catálogo</b>, crie o catálogo + produto e clique <b>"Usar este catálogo"</b>.</>}
          </div>
        )}
      </Card>

      {/* budget type */}
      <Card title="Tipo de Orçamento" icon={<DollarSign className="h-3.5 w-3.5" />}>
        <div className="mb-4 flex gap-2.5">
          {(['ABO', 'CBO'] as const).map((t) => (
            <button
              key={t}
              onClick={() => ctx.setBudgetType(t)}
              className={`flex-1 rounded-xl border p-3.5 text-center transition-all ${
                budgetType === t
                  ? 'border-brand bg-brand/[0.08] shadow-[0_0_0_3px_rgba(99,102,241,.2)]'
                  : 'border-border bg-surface2 hover:border-brand'
              }`}
            >
              <strong className="block text-[14px] font-extrabold text-brand-2">{t}</strong>
              <span className="text-[11px] text-muted2">
                {t === 'ABO' ? 'Orçamento por Conjunto' : 'Orçamento por Campanha (CBO)'}
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            field="budget"
            type="number"
            label={
              budgetType === 'CBO'
                ? 'Orçamento diário da Campanha (USD cents)'
                : 'Orçamento diário por Conjunto (USD cents)'
            }
            hint={
              budgetType === 'CBO'
                ? 'Budget no nível da campanha — Facebook distribui'
                : '300 = USD $3,00 por dia por conjunto'
            }
          />
        </div>

        {/* países */}
        <div className="field mt-4">
          <label>
            Países alvo <span className="text-danger">*</span>
          </label>
          <div className="rounded-[11px] border border-border bg-[#0a0c19] p-3.5">
            {COUNTRY_GROUPS.map((grp) => {
              const codes = grp.countries.map((c) => c.code)
              return (
                <div key={grp.label} className="mb-3 last:mb-0">
                  <button
                    onClick={() => ctx.toggleGroup(codes)}
                    className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted hover:text-brand-2"
                  >
                    {grp.label}{' '}
                    <span className="text-[10px] font-normal normal-case opacity-55">
                      — marcar grupo
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    {grp.countries.map((c) => {
                      const on = paises.includes(c.code)
                      return (
                        <button
                          key={c.code}
                          onClick={() => ctx.toggleCountry(c.code)}
                          className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
                            on
                              ? 'border-transparent bg-brand text-white shadow-glow'
                              : 'border-border bg-surface2 text-muted2 hover:border-brand hover:text-brand-2'
                          }`}
                        >
                          {c.flag} {c.code}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => ctx.toggleAllCountries(ALL_CODES)}>
              <Check className="h-3 w-3" /> Todos
            </button>
            <button className="btn btn-ghost btn-sm" onClick={ctx.clearCountries}>
              <X className="h-3 w-3" /> Limpar
            </button>
            <span className="text-[12px] text-muted2">
              {paises.length} selecionado{paises.length !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full bg-brand/10 px-3 py-1 font-mono text-[11px] font-bold text-brand-2">
              no nome: {ctx.getPaisNome()}
            </span>
          </div>
        </div>
      </Card>

      {/* multi-país: cada país = uma estrutura própria */}
      <div className="card mb-4">
        <div
          className="card-header cursor-pointer select-none"
          onClick={() => ctx.setMultiPaisAtivo(!ctx.multiPaisAtivo)}
        >
          <h3 className="flex items-center gap-2.5 text-[13px] font-bold">
            <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-brand/12 text-brand-2">
              <Globe className="h-3.5 w-3.5" />
            </span>
            Vários países (estruturas separadas)
          </h3>
          <span className={`text-[12px] font-semibold ${ctx.multiPaisAtivo ? 'text-ok' : 'text-muted2'}`}>
            {ctx.multiPaisAtivo ? `Ativado — ${ctx.getPaisBatches().length} estrutura(s)` : 'Desativado'}
          </span>
        </div>
        {ctx.multiPaisAtivo && (
          <div className="card-body">
            <div className="mb-3 rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.07] px-3.5 py-2.5 text-[12px] text-ink">
              Cada país vira uma <strong>estrutura própria</strong> (campanha/conjunto/anúncio) com o mesmo vídeo e orçamento — tudo num upload só. O <strong>país principal</strong> selecionado acima é a 1ª estrutura.
            </div>
            <div className="mb-3 rounded-lg border border-border bg-surface2 px-3.5 py-2.5 text-[12px]">
              <span className="text-muted2">Estrutura 1 (principal):</span>{' '}
              <strong className="text-ink">{paises.join(', ') || '—'}</strong>{' '}
              <span className="text-muted2">— no nome: <strong className="text-brand-2">{ctx.getPaisNome()}</strong></span>
            </div>
            {ctx.paisBatchesExtras.map((batch, i) => (
              <div key={i} className="mb-2.5 rounded-xl2 border border-border bg-surface2 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <strong className="text-[13px] text-brand-2">Estrutura {i + 2}</strong>
                  <button className="btn btn-ghost btn-sm text-danger" onClick={() => ctx.removePaisBatch(i)}>
                    ✗ Remover
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_COUNTRIES.map((c) => {
                    const on = batch.includes(c.code)
                    return (
                      <button
                        key={c.code}
                        onClick={() => ctx.togglePaisInBatch(i, c.code)}
                        className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
                          on
                            ? 'border-transparent bg-brand text-white shadow-glow'
                            : 'border-border bg-surface2 text-muted2 hover:border-brand hover:text-brand-2'
                        }`}
                      >
                        {c.flag} {c.code}
                      </button>
                    )
                  })}
                </div>
                {batch.length === 0 && (
                  <div className="mt-2 text-[11px] text-warn">⚠ Selecione ao menos 1 país (lotes vazios são ignorados).</div>
                )}
              </div>
            ))}
            <button className="btn btn-ghost btn-sm mt-1" onClick={ctx.addPaisBatch}>
              <Plus className="h-3 w-3" /> Adicionar país
            </button>
          </div>
        )}
      </div>

      {/* estrutura */}
      <Card
        title="Estrutura Campanha × Conjunto × Anúncio"
        icon={<Layers className="h-3.5 w-3.5" />}
      >
        <div className="mb-3.5 grid gap-3 sm:grid-cols-3">
          {EST_CARDS.map((c) => (
            <button
              key={c.id}
              onClick={() => ctx.setEstrutura(c.id)}
              className={`rounded-xl border p-4 text-center transition-all ${
                estrutura === c.id
                  ? 'border-brand bg-brand/[0.08] shadow-[0_0_0_3px_rgba(99,102,241,.2)]'
                  : 'border-border bg-surface2 hover:border-brand'
              }`}
            >
              <div className="mb-1.5 text-[14px] font-extrabold text-brand-2">{c.title}</div>
              <div className="my-2 flex items-center justify-center gap-1 text-[10px] text-muted">
                <span className="rounded bg-brand px-1.5 py-0.5 font-bold text-white">
                  {c.viz[0]}
                </span>
                ›
                <span className="rounded bg-ok px-1.5 py-0.5 font-bold text-white">
                  {c.viz[1]}
                </span>
                ›
                <span className="rounded bg-warn px-1.5 py-0.5 font-bold text-white">
                  {c.viz[2]}
                </span>
              </div>
              <div className="text-[11px] leading-snug text-muted2">{c.desc}</div>
            </button>
          ))}
        </div>
        <div className="rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.07] px-3.5 py-2.5 text-[13px] text-ink">
          {ESTRUTURA_INFO[estrutura]}
        </div>
      </Card>

      {/* nomenclatura */}
      <Card title="Nomenclatura Automática" icon={<Tag className="h-3.5 w-3.5" />}>
        <div className="mb-3.5 rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.07] px-3.5 py-2.5 text-[12px] text-ink">
          Formato:{' '}
          <strong>{'{Fase} - {País} - {Data} - {Tipo} - {Público} - {NomeCriativo}'}</strong>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            field="nome-fase"
            label="Fase"
            options={[
              { value: 'T', label: 'T — Teste de criativo' },
              { value: 'V', label: 'V — Validação' },
              { value: 'E', label: 'E — Escala' },
              { value: 'C', label: 'C — Core (raiz)' },
              { value: 'custom-fase', label: 'Outro...' },
            ]}
          />
          {form['nome-fase'] === 'custom-fase' && (
            <Input field="nome-fase-custom" label="Fase personalizada" placeholder="Ex: RE" />
          )}
          <Select
            field="nome-publico"
            label="Público"
            options={[
              { value: 'A', label: 'A — Aberto (sem segmentação)' },
              { value: 'custom-pub', label: 'Segmentado — digitar interesse' },
            ]}
          />
          {form['nome-publico'] === 'custom-pub' && (
            <Input
              field="nome-publico-custom"
              label="Nome do interesse"
              placeholder="Ex: anime, impressao3d..."
            />
          )}
          <Select
            field="nome-data-tipo"
            label="Data usada no nome"
            options={[
              { value: 'inicio', label: 'Data de início (auto)' },
              { value: 'hoje', label: 'Data de hoje (auto)' },
              { value: 'custom-data', label: 'Personalizado...' },
            ]}
          />
          {form['nome-data-tipo'] === 'custom-data' && (
            <Input field="nome-data-custom" label="Data personalizada" placeholder="Ex: 14/04" />
          )}
          <Select
            field="pais-nome-modo"
            label="País no nome"
            options={[
              { value: 'gr', label: 'GR — gringa (vários = GR)' },
              { value: 'codes', label: 'Códigos — ex: PT-GB-IT' },
              { value: 'custom-pais', label: 'Personalizado...' },
            ]}
          />
          {form['pais-nome-modo'] === 'custom-pais' && (
            <Input field="pais-nome-custom" label="País personalizado" placeholder="Ex: GR, EU" />
          )}
        </div>
        <div className="mt-3.5 rounded-[7px] border border-border bg-surface2 px-3.5 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted2">
            Preview do nome gerado
          </div>
          <div className="break-all font-mono text-[13px] font-semibold leading-relaxed text-brand-2">
            {ctx.buildNome('{NomeCriativo}')}
          </div>
        </div>
      </Card>

      {/* agendamento */}
      <Card title="Agendamento" icon={<Calendar className="h-3.5 w-3.5" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            field="start_dt"
            type="datetime-local"
            label="Data e hora de início"
            hint="Padrão: amanhã às 06:00 — convertido para UTC"
          />
          <Input
            field="end_dt"
            type="datetime-local"
            label="Data e hora de fim (opcional)"
            hint="Vazio = roda sem data de fim"
          />
          <Select
            field="status_inicial"
            label="Status inicial"
            options={[
              { value: 'PAUSED', label: '⏸ PAUSADO — revisar antes' },
              { value: 'ACTIVE', label: '▶ ATIVO — vai ao ar no horário' },
            ]}
          />
        </div>
      </Card>

      <div className="mt-5 flex gap-2.5">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Próximo: Conteúdo →
        </button>
      </div>
    </div>
  )
}
