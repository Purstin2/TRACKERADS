import { useState, type ReactNode, type FormEvent } from 'react'
import { signIn, useSession } from '../../lib/supabase'

/**
 * Antes disso, o app inteiro (Dashboard, Monitor com token do Facebook, Pixel,
 * Recuperação) carregava sem pedir login nenhum — qualquer um com a URL via
 * tudo. Agora exige a mesma sessão Supabase que o módulo /tracker já usa.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { email, loading } = useSession()
  const [formEmail, setFormEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border2 border-t-brand" />
      </div>
    )
  }

  if (email) return <>{children}</>

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(formEmail, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-bg p-4"
      style={{ backgroundImage: 'radial-gradient(ellipse 80% 55% at 50% -20%, rgba(61,240,126,0.10) 0%, transparent 62%)' }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">Purstinlab</h1>
          <p className="mt-2 text-sm text-muted">Faça login para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-danger/25 bg-danger/[0.08] p-3 text-sm text-danger">{error}</div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Email</label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-ink placeholder-muted2 outline-none transition-colors focus:border-brand"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-ink placeholder-muted2 outline-none transition-colors focus:border-brand"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-2 disabled:opacity-50"
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
