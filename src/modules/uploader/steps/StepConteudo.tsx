import { Pencil, Link2 } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import { Card, Input, Select, Textarea } from '../components/fields'
import { CTA_OPTIONS } from '../types'

export default function StepConteudo({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const ctx = useUploader()
  const { utmPreset } = ctx

  return (
    <div>
      <div className="mb-1 text-[21px] font-extrabold tracking-tight">Conteúdo do Anúncio</div>
      <div className="mb-6 text-[13px] text-muted2">Texto, título, URL e rastreamento UTM</div>

      <Card title="Texto do Anúncio" icon={<Pencil className="h-3.5 w-3.5" />}>
        <Textarea
          field="copy"
          label="Texto Principal (Copy)"
          required
          rows={7}
          className="mb-3.5"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input field="titulo" label="Título" required />
          <Input field="descricao" label="Descrição (opcional)" placeholder="Texto abaixo do título" />
          <Select field="cta" label="Call to Action" options={CTA_OPTIONS} />
          <Input
            field="url_exibicao"
            label="URL de Exibição"
            placeholder="site.com"
            hint="Domínio exibido no anúncio (não é o link real)"
          />
        </div>
      </Card>

      <Card title="URL de Destino" icon={<Link2 className="h-3.5 w-3.5" />}>
        <Input field="url_destino" label="URL de Destino" required />

        <hr className="my-5 border-border" />

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted2">
            Parâmetros UTM
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-muted">Plataforma:</span>
            <div className="flex overflow-hidden rounded-[9px] border border-border bg-surface2">
              {(['padrao', 'hotmart'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => ctx.setUtmPreset(p)}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    utmPreset === p ? 'bg-brand text-white' : 'text-muted2'
                  }`}
                >
                  {p === 'padrao' ? 'Padrão' : 'Hotmart'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input field="utm_source" label="utm_source" />
          <Input field="utm_medium" label="utm_medium" />
          <Input field="utm_campaign" label="utm_campaign" />
          <Input field="utm_content" label="utm_content" />
          <Input field="utm_term" label="utm_term" />
          {utmPreset === 'hotmart' && (
            <Input field="utm_xcod" label="xcod (Hotmart)" className="text-[11px]" />
          )}
        </div>

        <div className="mt-2.5 break-all rounded-[7px] border border-border bg-surface2 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted2">
          <span className="text-[10px] font-bold uppercase tracking-wider">Preview URL</span>
          <br />
          <span className="font-mono text-brand-2">{ctx.buildURL()}</span>
        </div>
      </Card>

      <div className="mt-5 flex gap-2.5">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Próximo: Criativos →
        </button>
      </div>
    </div>
  )
}
