import { NavLink, useLocation } from 'react-router-dom'
import { Zap, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from '@/lib/nav'

interface Props {
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }: Props) {
  const loc = useLocation()
  // quando recolhido, escondemos textos só no desktop (lg+); no mobile sempre completo
  const hideLg = collapsed ? 'lg:hidden' : ''

  return (
    <>
      {/* backdrop mobile */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-[230px] flex-col border-r border-border bg-surface/95 backdrop-blur-xl transition-[transform,width] duration-200 lg:translate-x-0 ${
          collapsed ? 'lg:w-[64px]' : 'lg:w-[230px]'
        } ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* logo + toggle */}
        <div className={`flex h-[61px] items-center border-b border-border ${collapsed ? 'lg:justify-center lg:px-0' : ''} gap-2.5 px-4`}>
          <span className={`hidden shrink-0 items-center justify-center rounded-[9px] bg-brand ${collapsed ? 'lg:flex lg:h-8 lg:w-8' : ''}`}>
            <Zap className="h-[17px] w-[17px] fill-white text-white" />
          </span>
          <img src="/logo.png" alt="PURSTINLAB" className={`h-[26px] w-auto shrink-0 ${hideLg}`} />
          {/* botão recolher (só desktop) */}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={`ml-auto hidden h-7 w-7 items-center justify-center rounded-md text-muted2 hover:bg-surface2 hover:text-ink lg:flex ${collapsed ? 'lg:hidden' : ''}`}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* botão expandir quando recolhido (centralizado) */}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Expandir menu"
            className="mx-auto mt-2 hidden h-7 w-7 items-center justify-center rounded-md text-muted2 hover:bg-surface2 hover:text-ink lg:flex"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* nav */}
        <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'lg:px-2' : 'px-3'} px-3`}>
          {NAV.map((item) => {
            const Icon = item.icon
            const active =
              item.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.to)
            return (
              <div key={item.id} className="mb-0.5">
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  title={collapsed ? item.label : undefined}
                  className={`group flex items-center gap-3 rounded-[10px] py-2.5 text-[13px] font-semibold transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : ''} px-3 ${
                    active ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2/60 hover:text-ink'
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                      active ? 'text-brand-2' : 'text-muted2 group-hover:text-brand-2'
                    }`}
                  />
                  <span className={`flex-1 ${hideLg}`}>{item.label}</span>
                  {item.badge && (
                    <span className={`rounded-full bg-brand/15 px-2 py-0.5 text-[9px] font-bold text-brand-2 ${hideLg}`}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>

                {/* sub-items (escondidos no trilho recolhido) */}
                {item.children && active && (
                  <div className={`ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3 ${hideLg}`}>
                    {item.children.map((c) => (
                      <NavLink
                        key={c.to}
                        to={c.to}
                        end={c.to === item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                            isActive ? 'text-brand-2' : 'text-muted2 hover:text-ink'
                          }`
                        }
                      >
                        {c.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* footer */}
        <div className={`border-t border-border py-3 ${collapsed ? 'lg:px-0' : 'px-4'} px-4`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? 'lg:justify-center' : ''}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-[12px] font-bold text-brand-2">
              P
            </div>
            <div className={`min-w-0 flex-1 ${hideLg}`}>
              <div className="truncate text-[12px] font-semibold text-ink">Operação Purstin</div>
              <div className="text-[10px] text-muted2">tráfego pago</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
