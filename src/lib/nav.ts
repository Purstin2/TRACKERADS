import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Radar,
  Search,
  UploadCloud,
  Crosshair,
  Percent,
  LifeBuoy,
  FlaskConical,
  Wallet,
} from 'lucide-react'

export interface NavChild {
  label: string
  to: string
}

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
  badge?: string
  children?: NavChild[]
}

export const NAV: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    to: '/',
  },
  {
    id: 'monitor',
    label: 'Monitor',
    icon: Radar,
    to: '/monitor',
    children: [
      { label: 'Campanhas', to: '/monitor' },
      { label: 'Por Oferta', to: '/monitor/oferta' },
      { label: 'Funil', to: '/monitor/funil' },
      { label: 'Públicos', to: '/monitor/publicos' },
      { label: 'Criativos', to: '/monitor/criativos' },
      { label: 'Regras', to: '/monitor/regras' },
      { label: 'Preços', to: '/monitor/precos' },
      { label: 'Diário', to: '/monitor/diario' },
      { label: 'Funil Manual', to: '/monitor/funman' },
      { label: 'Ações', to: '/monitor/acoes' },
    ],
  },
  {
    id: 'recuperacao',
    label: 'Recuperação',
    icon: LifeBuoy,
    to: '/recuperacao',
  },
  {
    id: 'ofertas',
    label: 'Ofertas testadas',
    icon: FlaskConical,
    to: '/ofertas',
  },
  {
    id: 'taxas',
    label: 'Taxas',
    icon: Percent,
    to: '/taxas',
  },
  {
    id: 'gastos',
    label: 'Gastos',
    icon: Wallet,
    to: '/gastos',
  },
  {
    id: 'tracker',
    label: 'Tracker Ads',
    icon: Search,
    to: '/tracker',
  },
  {
    id: 'uploader',
    label: 'Uploader',
    icon: UploadCloud,
    to: '/uploader',
  },
  {
    id: 'pixel',
    label: 'Pixel',
    icon: Crosshair,
    to: '/pixel',
    badge: 'v2',
  },
]
