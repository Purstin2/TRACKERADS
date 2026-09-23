/* ── Alerta de emissão de nota fiscal ─────────────────────────────────────────
 * Faixa no topo do Dashboard que SÓ aparece quando há problema.
 *
 * Não é widget: widget precisa ser adicionado ao layout à mão, e alarme que
 * depende de alguém ter lembrado de instalar não é alarme. Aqui ele entra
 * sozinho e some sozinho — no dia normal, ocupa zero pixel.
 *
 * O que ele vigia, e por que cada um importa:
 *
 *   · lote parado     → o cron roda todo dia; passar de 36h significa que ele
 *                       não rodou ou morreu antes de registrar. Foi assim que
 *                       o token do Bling ficou um mês morto sem ninguém notar.
 *   · rodada falhou   → emitiu nada e gravou o motivo
 *   · pedidos travados→ esgotaram as 3 tentativas e SAÍRAM da fila. Esses não
 *                       voltam sozinhos: sem aviso, viram venda sem nota.
 *   · emissão off     → um clique sem querer na aba Notas Fiscais para o
 *                       faturamento inteiro e não avisa ninguém.
 *   · homologação     → está emitindo em teste. Nada é gravado, então a
 *                       impressão de "está funcionando" é falsa.
 *
 * A fonte é `app_state.notas_saude`, escrita pelo próprio lote a cada rodada —
 * inclusive quando ele falha, que é justamente quando importa.
 * ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { AlertTriangle, FlaskConical, PowerOff, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface Saude {
  em?: string
  ok?: boolean
  desligada?: boolean
  ambiente?: string
  emitidas?: number
  erros?: number
  restaram?: number
  travados?: number
  erro?: string | null
  semRevisao?: string[]
  ultimoErro?: string | null
}

/** Horas desde a última rodada. O cron é diário; 36h já é uma rodada perdida. */
const HORAS_LIMITE = 36

type Nivel = 'grave' | 'atencao'
interface Aviso { nivel: Nivel; icone: typeof AlertTriangle; texto: string }

function avaliar(s: Saude | null): Aviso[] {
  const avisos: Aviso[] = []
  if (!s) return avisos

  const horas = s.em ? (Date.now() - new Date(s.em).getTime()) / 36e5 : Infinity
  if (!Number.isFinite(horas) || horas > HORAS_LIMITE) {
    avisos.push({
      nivel: 'grave',
      icone: Clock,
      texto: !s.em
        ? 'O lote de notas fiscais nunca registrou uma rodada.'
        : `O lote de notas não roda há ${Math.floor(horas)}h — o normal é todo dia.`,
    })
  }

  if (s.desligada) {
    avisos.push({ nivel: 'grave', icone: PowerOff, texto: 'A emissão automática está DESLIGADA. Nenhuma venda está sendo faturada.' })
  }

  if (s.ok === false) {
    avisos.push({ nivel: 'grave', icone: AlertTriangle, texto: `A última rodada falhou: ${s.erro || 'motivo não registrado'}` })
  }

  if ((s.travados || 0) > 0) {
    avisos.push({
      nivel: 'grave',
      icone: AlertTriangle,
      texto: `${s.travados} pedido(s) esgotaram as 3 tentativas e saíram da fila — não voltam sozinhos.`,
    })
  }

  if ((s.erros || 0) > 0) {
    avisos.push({
      nivel: 'atencao',
      icone: AlertTriangle,
      texto: `${s.erros} nota(s) falharam na última rodada${s.ultimoErro ? ` · ${s.ultimoErro}` : ''}`,
    })
  }

  if ((s.semRevisao || []).length > 0) {
    const n = s.semRevisao!.length
    avisos.push({
      nivel: 'atencao',
      icone: FlaskConical,
      texto: `${n} produto(s) sendo faturados no padrão, sem ninguém ter revisado: ${s.semRevisao!.slice(0, 3).join(', ')}${n > 3 ? '…' : ''}`,
    })
  }

  if ((s.ambiente || '').startsWith('homolog')) {
    avisos.push({
      nivel: 'atencao',
      icone: FlaskConical,
      texto: 'Emitindo em HOMOLOGAÇÃO: as notas são de teste, não valem fiscalmente e nada é gravado.',
    })
  }

  return avisos
}

export default function AlertaNotas() {
  const [saude, setSaude] = useState<Saude | null>(null)
  const [carregou, setCarregou] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const sb = supabase()
      if (!sb) { if (vivo) setCarregou(true); return }
      try {
        const { data } = await sb.from('app_state').select('value').eq('key', 'notas_saude').maybeSingle()
        if (vivo) setSaude((data?.value as Saude) || null)
      } catch { /* alerta que quebra a tela é pior que alerta nenhum */ }
      if (vivo) setCarregou(true)
    })()
    return () => { vivo = false }
  }, [])

  // Enquanto carrega, não pisca nada. Só decide depois de ter a resposta.
  if (!carregou) return null

  const avisos = avaliar(saude)
  if (avisos.length === 0) return null

  const grave = avisos.some((a) => a.nivel === 'grave')

  return (
    <div
      className={`mb-4 rounded-xl2 border p-4 ${
        grave ? 'border-danger/45 bg-danger/[0.08]' : 'border-warn/40 bg-warn/[0.07]'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${grave ? 'text-danger' : 'text-warn'}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-bold ${grave ? 'text-danger' : 'text-warn'}`}>
            Nota fiscal {grave ? '— precisa de você agora' : '— atenção'}
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {avisos.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-ink">
                <a.icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${a.nivel === 'grave' ? 'text-danger' : 'text-warn'}`} />
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-3 text-[11.5px]">
            <Link to="/notas" className="font-semibold text-brand-2 hover:underline">
              Abrir Notas fiscais →
            </Link>
            {saude?.em && (
              <span className="text-muted2">
                última rodada {new Date(saude.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
