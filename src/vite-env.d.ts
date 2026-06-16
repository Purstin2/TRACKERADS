/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_META_API_VERSION?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
