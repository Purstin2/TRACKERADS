import { Menu, Zap } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { NAV } from '@/lib/nav'

interface Props {
  onMenu: () => void
}

function currentTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  const item = NAV.find((n) => n.to !== '/' && pathname.startsWith(n.to))
  if (!item) return 'PURSTINLAB'
  const child = item.children?.find((c) => pathname.startsWith(c.to))
  return child ? `${item.label} · ${child.label}` : item.label
}

export default function Topbar({ onMenu }: Props) {
  const loc = useLocation()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur-xl lg:px-7">
      <button
        onClick={onMenu}
        className="btn btn-ghost btn-sm lg:hidden"
        aria-label="Menu"
      >
        <Menu className="h-4 w-4" />
      </button>
      <h1 className="min-w-0 truncate text-[15px] font-bold tracking-tight">
        {currentTitle(loc.pathname)}
      </h1>
      <div className="flex-1" />
      {/* volta pro app de vendas — só no celular, que é de onde se chega aqui */}
      <Link
        to="/app"
        title="Voltar pro app de vendas"
        className="btn btn-ghost btn-sm shrink-0 lg:hidden"
      >
        <Zap className="h-4 w-4 text-brand-2" />
      </Link>
      <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-ok sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        online
      </span>
    </header>
  )
}
