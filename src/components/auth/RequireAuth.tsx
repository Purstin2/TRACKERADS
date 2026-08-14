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
      <div className="flex min-h-screen items-center justify-center bg-[#060A12]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-blue-500" />
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
      className="flex min-h-screen items-center justify-center bg-[#060A12] p-4"
      style={{ backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(79,142,247,0.08) 0%, transparent 60%)' }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Purstinlab</h1>
          <p className="mt-1.5 text-sm text-slate-500">Faça login para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Email</label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-white/[0.08] bg-[#131929] px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-blue-500/50"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/[0.08] bg-[#131929] px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-blue-500/50"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
