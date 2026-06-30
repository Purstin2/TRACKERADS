import { mergeEntries, type IdKind } from './idLibrary'

/** Cofre dos IDs das contas — AES-256-GCM (PBKDF2 150k/SHA-256). Os IDs reais
 *  NÃO ficam no código: só este blob cifrado, inútil sem a senha. Persiste no
 *  projeto (commit/bundle), mas só abre com a senha que o usuário digita. */
export const ASSETS_ENC =
  'alMQbVb5qNhl9ygtXcZ7DhepE82LLym8H0zqh4BEDE6x4XjAyr6Eh3xJKJxRxwUhEu8xL9tdF/jVcn3cxNCUQhPd0toITEnoF8pr8XzWDn8w8iPPIo9bBi+Va5sxT1CB8XjYOh0eqjRvwAO941xE3eixIvw7lpNhSp4SCdCSZi5cCW8rJMbL9noBDCVwc4kxrqwlcbdEetjTmiGiTzPkmQnTAuXQZbCGdYJcB6DC5MuECfnPwDYJD5EoiadhLcqGT38nb3sTaqi79+L4lHASRLa+mQ/5pehhsO9mkb1i1ZQ8HkoVhsz7RqFxeK6HPKzhjsUTX0DfEtmEFyKz9yVxnb10XcIwgadJOR91QzDigNXbQK1f8wQty1JNAa8lDInFEuZBn51iXsYwnGrGw7z4Y17dmbCQxJpMvQ5YY0um+kknrJPMx9W7B1P0mR7ubJFjbGECPJBCB9A3qRO/ODzHN7WB93WUJ5X0Aq55h91WvlwZ5GtGdadPO6OwkpYSM6BzTfF/8gsbOxX+C7oHFCE2KX6L8cAwDLxk8t1715hEkSyrvX3Hqjr7suzlRMaVrouriDWb4CNZYKbZH9ysyHsxT0RQyfSX+RYXrZ2AW3AcH8mRZ/5rsg0jZaH8mxw2a1/1xre3BViMTbBdvlONf7mlXH+VQMKxsyMr71jN6LDExcCeWv9ikX5eTDJadIZGXb0A/yRQbE++AVIlYz2DRRBaJpbD26VKbDOkNqxquhkLBovgtIhS7MSjBRw/nttNQyY6DiK5iGwXtPhTnJScHE37CZyuSHGdYGIdSdb9brYx0lS5Yo4YVn0BXxny0EDOFbpNdfAVfiY3HBlsv+5TOtAl4He2Q/cJkdL4wmitGxQOqfs2OuPUpPi06P+hFAbFctQx0kHB1GqUWHPZTXa4X8JeeUl70Sj58haqo8AJNh1NgKu2I4u4uRpAQrusYgKo0TNezLGL+uH9LGW/G/vR82Qs0e7Nao8/0vqs1dn8WUSQpHz3DUCIg6/oY1yPpfgL6HoxLu7i02l7uKXIac2dYbAuVq5FR8Gq0VM2XEnHoB1v02JLUs/937Y1A5xAHKM6E2s/8panChZ+kukVgUARRHa41UTkMzgWWP4eBUFZEXz180HFzixSZzegJWnZkclBXlqrIoW4EaTSzIJyM4Qf2b0JzfzWMroT15srAJVhylSKRkIJ7QMwmL9tDhuv3o8JtD0GPN4iY4ppdBU3BV+0v8jWFbNxZ5aCDrX/dMtyujPoZn2iEodfz5FCIG0BPxeE6ShXow0aBPhw3p3/u3L1VJdcwISWWgj1y+4VLAmK/PMQtkHfZqzULzABomYeudMipmmRZMY6J/+AQZBM6m4HsPae+qlbZy+DAapLmPq2311Yjd7mUnwp1vqFsj+WSf1U/8FXE80V0UdAcNHvZzGv6iCKGJKuVS1rpUuwBb+4GyLECSC8+mn7qlJCKEIVt2c='

const PASS_KEY = 'uploader_assets_pass'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

type Vault = Record<IdKind, { id: string; name: string; note?: string }[]>

/** Descriptografa o cofre. Lança se a senha estiver errada (tag GCM inválida). */
export async function decryptVault(pass: string): Promise<Vault> {
  const raw = b64ToBytes(ASSETS_ENC)
  const salt = raw.slice(0, 16)
  const iv = raw.slice(16, 28)
  const ct = raw.slice(28)
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return JSON.parse(new TextDecoder().decode(pt))
}

/** Abre o cofre com a senha, mescla os IDs na biblioteca e lembra a senha. */
export async function loadVaultToLibrary(pass: string): Promise<number> {
  const data = await decryptVault(pass)
  let n = 0
  ;(['accounts', 'pages', 'pixels', 'instagrams'] as IdKind[]).forEach((k) => {
    if (Array.isArray(data[k])) { mergeEntries(k, data[k]); n += data[k].length }
  })
  localStorage.setItem(PASS_KEY, pass)
  return n
}

export function savedPass(): string {
  try { return localStorage.getItem(PASS_KEY) || '' } catch { return '' }
}
export function clearVaultPass() {
  try { localStorage.removeItem(PASS_KEY) } catch {}
}

/** Carrega o cofre no boot se a senha já estiver lembrada neste navegador. */
export async function autoLoadVault(): Promise<void> {
  const p = savedPass()
  if (p) { try { await loadVaultToLibrary(p) } catch { /* senha mudou/invalida */ } }
}
