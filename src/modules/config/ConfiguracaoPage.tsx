import { useState, type ReactNode } from 'react'
import { KeyRound, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react'

/* ── primitivos reaproveitados do resto do app (mesmos tokens: card, field, btn) ── */

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[12px] font-bold text-brand-2">
        {n}
      </span>
      <div className="flex-1 pt-0.5 text-[13px] leading-relaxed text-muted [&_b]:text-ink [&_code]:text-ink">{children}</div>
    </div>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}

function Kbd({ children }: { children: ReactNode }) {
  return <span className="rounded-[5px] border border-border bg-surface2 px-1.5 py-0.5 text-[11.5px] font-semibold text-ink">{children}</span>
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-[5px] border border-border bg-[#0a0c19] px-1.5 py-0.5 font-mono text-[11.5px] text-ink">{children}</code>
}

function Pill({ tone, children }: { tone: 'critical' | 'required' | 'optional'; children: ReactNode }) {
  const cls = {
    critical: 'text-danger border-danger/30 bg-danger/10',
    required: 'text-warn border-warn/30 bg-warn/10',
    optional: 'text-muted2 border-border bg-surface2',
  }[tone]
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex gap-2.5 rounded-[9px] border border-danger/30 bg-danger/10 px-3.5 py-3 text-[12px] leading-relaxed text-muted [&_b]:text-danger">
      <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
      <div>{children}</div>
    </div>
  )
}

interface Row { name: string; desc: ReactNode; status?: 'req' | 'opt' }
function VarTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-[9px] border border-border">
      <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className={i !== rows.length - 1 ? 'border-b border-border' : ''}>
              <td className="whitespace-nowrap px-3.5 py-2.5 align-top font-mono text-[12px] font-semibold text-ink">{r.name}</td>
              <td className="px-3.5 py-2.5 align-top text-muted">{r.desc}</td>
              {r.status && (
                <td className="whitespace-nowrap px-3.5 py-2.5 align-top text-right">
                  <span className={`font-mono text-[10.5px] font-bold uppercase tracking-wide ${r.status === 'req' ? 'text-warn' : 'text-muted2'}`}>
                    {r.status === 'req' ? 'necessária' : 'opcional'}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wide text-muted2 first:mt-0">{children}</div>
}

/* ── página ────────────────────────────────────────────────────────────────── */

export default function ConfiguracaoPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }))

  const checklist = [
    'WEBHOOK_SECRET confere, igual nos dois lados (Vercel + Kirvano)',
    'HOTMART_HOTTOK configurado, se você vende pela Hotmart',
    'As 4 variáveis do Supabase presentes — SUPABASE_SERVICE_KEY sem o prefixo VITE_',
    'Depois de qualquer mudança: voltou em Deployments e clicou Redeploy',
    'Testou uma venda de verdade (ou o botão de teste da aba Pixel) depois do redeploy',
  ]

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 text-brand-2">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Configuração — variáveis de ambiente</h2>
          <p className="text-[12px] text-muted">Onde clicar na Vercel, de onde tirar cada credencial, e o que confirmar antes de publicar.</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* 1. Acesso */}
        <div className="card card-body">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">1 · Entrar na Vercel e achar o projeto</h3>
          <Steps>
            <Step n={1}>
              Acesse <b>vercel.com</b> e clique em <Kbd>Log In</Kbd>. O projeto já está publicado, então você já tem conta — entre com o
              mesmo método usado antes (GitHub, e-mail ou Google). Criar uma conta nova <b>não</b> dá acesso ao projeto existente.
            </Step>
            <Step n={2}>
              No <b>Dashboard</b>, procure o cartão do projeto conectado ao repositório <Code>Purstin2/TRACKERADS</Code> (nome parecido com{' '}
              <Code>trackerads</Code>). Se houver mais de um time no canto superior esquerdo, troque no seletor até achar.
            </Step>
            <Step n={3}>
              Clique no cartão pra abrir o projeto, depois na aba <Kbd>Settings</Kbd> no topo.
            </Step>
          </Steps>
        </div>

        {/* 2. Onde ficam */}
        <div className="card card-body">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">2 · Onde ficam as variáveis</h3>
          <Steps>
            <Step n={1}>
              Dentro de <Kbd>Settings</Kbd>, clique em <Kbd>Environment Variables</Kbd> no menu da esquerda.
            </Step>
            <Step n={2}>
              Pra <b>adicionar</b>: preencha <Kbd>Key</Kbd> (o nome exato, ex. <Code>WEBHOOK_SECRET</Code>) e <Kbd>Value</Kbd>. Deixe{' '}
              <b>Production</b> sempre marcado. Clique <Kbd>Save</Kbd>.
            </Step>
            <Step n={3}>
              Pra <b>conferir</b> uma existente: clique no ícone de olho ou nos três pontinhos → <Kbd>Reveal</Kbd> pra ver o valor atual.
            </Step>
            <Step n={4}>
              <b>O passo que todo mundo esquece:</b> mudar uma variável não atualiza o site já publicado — só vale a partir do próximo deploy.
              Vá em <Kbd>Deployments</Kbd>, abra os três pontinhos do deploy mais recente → <Kbd>Redeploy</Kbd>.
            </Step>
          </Steps>
        </div>

        {/* 3. Urgentes */}
        <div className="card card-body">
          <h3 className="mb-1 text-[13.5px] font-bold text-ink">3 · As duas urgentes agora</h3>
          <p className="mb-4 text-[12px] text-muted">
            Travam a validação que acabou de entrar no código. Se estiverem erradas, o efeito é <b className="text-danger">parar de registrar vendas</b> —
            pior que o problema de segurança que elas resolvem.
          </p>

          <div className="flex flex-col gap-4">
            <div className="rounded-[10px] border border-border bg-surface2 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[13.5px] font-bold text-ink">WEBHOOK_SECRET</span>
                <Pill tone="critical">Confirmar hoje</Pill>
              </div>
              <p className="mb-1.5 text-[12px] text-muted">
                Não é algo que se busca em lugar nenhum — é uma senha longa que <b className="text-ink">você mesmo inventa</b>. Precisa existir,
                idêntica, em <b className="text-ink">dois lugares</b>:
              </p>
              <ol className="ml-4 list-decimal space-y-1 text-[12px] text-muted [&_b]:text-ink [&_code]:text-ink">
                <li>
                  Na Vercel: <Kbd>Settings → Environment Variables</Kbd>, key <Code>WEBHOOK_SECRET</Code>.
                </li>
                <li>
                  Na URL de webhook cadastrada no painel da <b>Kirvano</b> — o pedaço depois de <Code>secret=</Code> tem que ser idêntico.
                </li>
              </ol>
              <p className="mt-2 text-[12px] text-muted">
                Atalho: abra a aba <b className="text-ink">Pixel → Conexões</b> neste mesmo site — o campo mostra o segredo salvo no seu navegador e a
                aba <b className="text-ink">Webhook</b> já monta a URL completa da Kirvano com ele embutido, pronta pra comparar.
              </p>
              <p className="mt-2 text-[12px] text-muted">
                Nunca configurado? Invente uma senha forte (20+ caracteres), salve na Vercel, cole na Kirvano, dê redeploy.
              </p>
            </div>

            <div className="rounded-[10px] border border-border bg-surface2 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[13.5px] font-bold text-ink">HOTMART_HOTTOK</span>
                <Pill tone="required">Só se usa Hotmart</Pill>
              </div>
              <p className="mb-1.5 text-[12px] text-muted">
                Esse, ao contrário do de cima, <b className="text-ink">a Hotmart gera pra você</b>.
              </p>
              <p className="text-[12px] text-muted">
                No painel da Hotmart: <Kbd>Ferramentas → Webhook</Kbd> (às vezes chamado <Kbd>Integrações</Kbd>). Ao criar/editar o webhook lá, a
                Hotmart mostra um token — geralmente chamado <b className="text-ink">Hottok</b>. Copie e cole na Vercel como{' '}
                <Code>HOTMART_HOTTOK</Code>.
              </p>
              <p className="mt-2 text-[12px] text-muted">Não vende pela Hotmart? Pode ignorar — sem ela só esse caminho fica bloqueado, a Kirvano segue normal.</p>
            </div>
          </div>

          <Warn>
            A partir do próximo deploy, o endpoint que recebe vendas passa a <b>recusar</b> qualquer chamada sem o segredo certo — inclusive as
            reais, vindas da Kirvano/Hotmart de verdade. Confirme os dois valores <b>antes</b> de publicar, não depois.
          </Warn>
        </div>

        {/* 4. Supabase */}
        <div className="card card-body">
          <h3 className="mb-1 text-[13.5px] font-bold text-ink">4 · Credenciais do Supabase</h3>
          <p className="mb-3 text-[12px] text-muted">
            Quatro variáveis, do mesmo lugar:{' '}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-2 hover:underline">
              supabase.com/dashboard <ExternalLink className="h-3 w-3" />
            </a>{' '}
            → abra o projeto → <Kbd>Project Settings</Kbd> (engrenagem) → <Kbd>API</Kbd>.
          </p>
          <VarTable
            rows={[
              { name: 'VITE_SUPABASE_URL', desc: <>Campo <b className="text-ink">Project URL</b>, no topo da tela</> },
              { name: 'SUPABASE_URL', desc: <>O mesmo valor de cima, copiado de novo (as funções do servidor não leem a versão <Code>VITE_</Code>)</> },
              { name: 'VITE_SUPABASE_ANON_KEY', desc: <>Em <b className="text-ink">Project API keys</b>, a linha <Code>anon</Code> <Code>public</Code></> },
              { name: 'SUPABASE_SERVICE_KEY', desc: <>Em <b className="text-ink">Project API keys</b>, a linha <Code>service_role</Code> <Code>secret</Code> (botão "Reveal")</> },
            ]}
          />
          <Warn>
            <Code>SUPABASE_SERVICE_KEY</Code> ignora toda a proteção do banco (RLS). Ela tem que ficar <b>só</b> como <Code>SUPABASE_SERVICE_KEY</Code>{' '}
            — nunca com o prefixo <Code>VITE_</Code>. Qualquer variável <Code>VITE_</Code> vai parar dentro do site público, visível a qualquer um que
            abrir o código-fonte da página.
          </Warn>
        </div>

        {/* 5. Referência completa */}
        <div className="card card-body">
          <h3 className="mb-1 text-[13.5px] font-bold text-ink">5 · Referência completa das demais</h3>
          <p className="mb-1 text-[12px] text-muted">
            Estas não travam nada — cada uma liga <b className="text-ink">uma função específica</b>. Sem ela, só aquele pedaço fica quieto. Útil pra
            saber onde procurar se algum widget aparecer vazio.
          </p>

          <GroupLabel>WhatsApp — recuperação de carrinho</GroupLabel>
          <VarTable
            rows={[
              { name: 'WA_TOKEN', desc: 'Token de acesso da API do WhatsApp (Cloud API ou provedor)', status: 'req' },
              { name: 'WA_PHONE_ID', desc: 'ID do número configurado no provedor', status: 'req' },
              { name: 'WA_360_API_KEY', desc: 'Só se o provedor for 360dialog em vez da Cloud API oficial', status: 'opt' },
              { name: 'WA_PROVIDER', desc: 'Qual adaptador usar (custom, 360dialog…)', status: 'opt' },
              { name: 'WA_TEMPLATE_DAY1/2/3', desc: 'Templates aprovados de cada dia da régua', status: 'opt' },
              { name: 'WA_TEMPLATE_LANG', desc: 'Idioma do template (ex. pt_BR)', status: 'opt' },
              { name: 'WA_MIN_VALUE', desc: 'Valor mínimo do carrinho pra disparar a régua', status: 'opt' },
              { name: 'WA_BUTTON_URL', desc: 'URL do botão nas mensagens', status: 'opt' },
              { name: 'WA_DAY2_VIDEO_ID/URL', desc: 'Vídeo enviado no 2º dia', status: 'opt' },
              { name: 'WA_STL_PRODUCT_IDS', desc: 'Produtos com fluxo específico', status: 'opt' },
            ]}
          />

          <GroupLabel>Notificações push (PWA no celular)</GroupLabel>
          <VarTable
            rows={[
              { name: 'VITE_VAPID_PUBLIC', desc: 'Chave pública VAPID', status: 'req' },
              { name: 'VAPID_PUBLIC', desc: 'Mesma chave pública, copiada pro lado do servidor', status: 'req' },
              { name: 'VAPID_PRIVATE', desc: 'Chave privada — nunca vai pro VITE_', status: 'req' },
              { name: 'VAPID_SUBJECT', desc: <>Um <Code>mailto:seuemail@...</Code> exigido pelo padrão VAPID</>, status: 'req' },
            ]}
          />
          <p className="mb-0 mt-2 text-[11.5px] text-muted2">
            Esse par não vem de painel nenhum — gere uma vez com <Code>npx web-push generate-vapid-keys</Code> no terminal, na pasta do
            projeto, e copie o resultado pras quatro variáveis acima.
          </p>

          <GroupLabel>Outras integrações</GroupLabel>
          <VarTable
            rows={[
              { name: 'META_TOKEN', desc: 'Token do Facebook Ads pro snapshot diário de gasto (Tracker Padrão)', status: 'req' },
              { name: 'META_TEST_EVENT_CODE', desc: 'Código padrão de teste de evento do Pixel', status: 'opt' },
              { name: 'TIKTOK_ACCESS_TOKEN', desc: 'Token da Events API do TikTok', status: 'opt' },
              { name: 'TIKTOK_PIXEL_CODE', desc: 'ID do pixel do TikTok', status: 'opt' },
              { name: 'BREVO_API_KEY', desc: 'Chave de API do Brevo (e-mail)', status: 'req' },
              { name: 'MELODIFY_URL / MELODIFY_SECRET', desc: 'Acesso ao painel admin do Melodify (widget de recuperação)', status: 'opt' },
              { name: 'GH_DISPATCH_TOKEN / GH_REPO / GH_REF / GH_WORKFLOW', desc: 'Disparo do scraper via GitHub Actions', status: 'opt' },
              { name: 'CHECKOUT_BASE / SITE_URL', desc: 'URLs base usadas em links (checkout, recuperação)', status: 'req' },
              { name: 'FX_BRL', desc: 'Cotação de câmbio fixa como fallback (USD→BRL)', status: 'opt' },
              { name: 'GOOGLE_CONVERSION_NAME / GOOGLE_CONV_DAYS', desc: 'Importação de conversões offline pro Google Ads', status: 'opt' },
            ]}
          />
        </div>

        {/* 6. Checklist */}
        <div className="card card-body">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">6 · Checklist antes de publicar</h3>
          <div className="flex flex-col gap-2">
            {checklist.map((item) => (
              <label key={item} className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink">
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                    checked[item] ? 'border-ok bg-ok/15 text-ok' : 'border-border text-transparent'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <span className={checked[item] ? 'text-muted line-through' : ''}>{item}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
