import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { Toaster } from '../ui/toast'

const LS_COLLAPSED = 'purstin_nav_collapsed'

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(LS_COLLAPSED) === '1')

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(LS_COLLAPSED, next ? '1' : '0')
      return next
    })
  }

  return (
    <div className="min-h-screen">
      <Toaster />
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[64px]' : 'lg:pl-[230px]'}`}>
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1760px] animate-pageIn px-4 py-5 lg:px-6 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
