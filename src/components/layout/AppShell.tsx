import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { Toaster } from '../ui/toast'

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Toaster />
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="lg:pl-[230px]">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1180px] animate-pageIn px-4 py-6 lg:px-7 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
