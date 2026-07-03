import { chromium } from 'playwright'

const url = process.argv[2]
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'pt-BR',
})
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 })
await page.waitForTimeout(7000)
const txt = await page.evaluate(() => document.body.innerText)
console.log('URL FINAL:', page.url())
console.log('TAMANHO innerText:', txt.length)
console.log('--- walls? ---')
for (const kw of ['cookie', 'Cookie', 'aceitar', 'Aceitar', 'entrar', 'Entrar', 'log in', 'Log in', 'senha', 'Criar conta']) {
  if (txt.includes(kw)) console.log('  contém:', kw)
}
console.log('--- "resultado/result/anúncio" aparece? ---')
console.log('  resultado:', (txt.match(/resultado/gi) || []).length, '| result:', (txt.match(/result/gi) || []).length, '| anúncio:', (txt.match(/an[uú]ncio/gi) || []).length)
console.log('--- linhas com número + dígito ---')
txt.split('\n').map((l) => l.trim()).filter((l) => /\d/.test(l) && l.length < 80).slice(0, 25).forEach((l) => console.log('  >', l))
console.log('--- primeiros 1500 chars ---')
console.log(txt.slice(0, 1500))
await browser.close()
