import { NavLink, useLocation } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { NAV } from '@/lib/nav'

interface Props {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: Props) {
  const loc = useLocation()

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
        className={`fixed left-0 top-0 z-40 flex h-full w-[230px] flex-col border-r border-border bg-surface/95 backdrop-blur-xl transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* logo */}
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-[18px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand shadow-glow">
            <Zap className="h-[17px] w-[17px] fill-white text-white" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">
            PURSTIN
            <span className="bg-brand bg-clip-text text-transparent">LAB</span>
          </span>
        </div>

        {/* nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const Icon = item.icon
            const active =
              item.to === '/'
                ? loc.pathname === '/'
                : loc.pathname.startsWith(item.to)
            return (
              <div key={item.id} className="mb-0.5">
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={`group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                    active
                      ? 'bg-surface2 text-ink'
                      : 'text-muted hover:bg-surface2/60 hover:text-ink'
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] transition-colors ${
                      active ? 'text-brand-2' : 'text-muted2 group-hover:text-brand-2'
                    }`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[9px] font-bold text-brand-2">
                      {item.badge}
                    </span>
                  )}
                </NavLink>

                {/* sub-items */}
                {item.children && active && (
                  <div className="ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                    {item.children.map((c) => (
                      <NavLink
                        key={c.to}
                        to={c.to}
                        end={c.to === item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                            isActive
                              ? 'text-brand-2'
                              : 'text-muted2 hover:text-ink'
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
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface2 text-[12px] font-bold text-brand-2">
              P
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-ink">
                Operação Purstin
              </div>
              <div className="text-[10px] text-muted2">tráfego pago</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
