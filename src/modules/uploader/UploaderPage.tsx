import { useState } from 'react'
import { UploaderProvider, useUploader } from './UploaderContext'
import { toast } from '@/components/ui/toast'
import StepConta from './steps/StepConta'
import StepEstrutura from './steps/StepEstrutura'
import StepConteudo from './steps/StepConteudo'
import StepCriativos from './steps/StepCriativos'
import StepSubir from './steps/StepSubir'

const STEPS = ['Conta', 'Estrutura', 'Conteúdo', 'Criativos', 'Subir']

function Wizard() {
  const ctx = useUploader()
  const [step, setStep] = useState(0)

  const validations: (() => string | null)[] = [
    () => {
      if (!ctx.form.token.trim()) return 'Cole o Access Token.'
      if (!ctx.form.ad_account.trim()) return 'Preencha o Ad Account ID.'
      if (!ctx.form.page_id.trim()) return 'Preencha o Page ID da Fanpage.'
      if (!ctx.pageVerified)
        return 'Página não verificada. Clique em "Testar página" para validar com o token.'
      return null
    },
    () => {
      if (!ctx.form.budget || parseInt(ctx.form.budget) < 100)
        return 'Orçamento mínimo é 100 cents (USD $1,00).'
      if (ctx.paises.length === 0) return 'Selecione pelo menos um país alvo.'
      if (!ctx.form.start_dt) return 'Defina a data de início.'
      return null
    },
    () => {
      if (!ctx.form.copy.trim()) return 'Preencha o texto principal (copy).'
      if (!ctx.form.titulo.trim()) return 'Preencha o título do anúncio.'
      if (!ctx.form.url_destino.trim()) return 'Preencha a URL de destino.'
      return null
    },
    () => {
      if (ctx.videosSel.size === 0) return 'Selecione pelo menos 1 vídeo criativo.'
      if (ctx.searchPlacementActive && !ctx.searchVideoSel)
        return 'Posicionamento de pesquisa ativado mas sem vídeo selecionado.'
      return null
    },
    () => null,
  ]

  const isDone = (i: number) => i < 4 && !validations[i]()

  function goTab(n: number) {
    if (n > step) {
      for (let i = step; i < n; i++) {
        const err = validations[i]()
        if (err) {
          setStep(i)
          toast(err, 'err')
          return
        }
      }
    }
    setStep(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {/* step tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => {
          const active = i === step
          const done = isDone(i)
          return (
            <button
              key={label}
              onClick={() => goTab(i)}
              className={`flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[12.5px] font-semibold transition-all ${
                active
                  ? 'border-border bg-surface text-ink shadow-card-sm'
                  : 'border-transparent text-muted2 hover:bg-surface2 hover:text-ink'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? 'bg-brand text-white'
                    : done
                      ? 'bg-ok text-white'
                      : 'border border-border bg-surface2 text-muted2'
                }`}
              >
                {done && !active ? '✓' : i + 1}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      <div className="animate-pageIn">
        {step === 0 && <StepConta onNext={() => goTab(1)} />}
        {step === 1 && <StepEstrutura onNext={() => goTab(2)} onBack={() => goTab(0)} />}
        {step === 2 && <StepConteudo onNext={() => goTab(3)} onBack={() => goTab(1)} />}
        {step === 3 && <StepCriativos onNext={() => goTab(4)} onBack={() => goTab(2)} />}
        {step === 4 && <StepSubir onBack={() => goTab(3)} />}
      </div>
    </div>
  )
}

export default function UploaderPage() {
  return (
    <UploaderProvider>
      <Wizard />
    </UploaderProvider>
  )
}
