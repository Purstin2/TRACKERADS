# ⚡ Quick Start - TrackerAds

Guia super rápido para começar a usar o TrackerAds com scraping automático!

## 🎯 Em 3 Minutos

### 1. Projeto Principal

```powershell
# Instalar dependências
npm install

# Iniciar o app
npm run dev
```

✅ Acesse: http://localhost:5173

### 2. Scraper Automático (Opcional mas RECOMENDADO)

```powershell
# Em um NOVO terminal
cd scraper-service

# Instalar tudo de uma vez
npm install
npm run install-browser

# Configurar credenciais (copie e edite)
Copy-Item env-example.txt .env
# Abra o .env e cole suas credenciais do Supabase

# Iniciar o scraper
npm start
```

✅ Scraper rodando em: http://localhost:3001

## 🎮 Usar o Sistema

### Adicionar um Concorrente

1. **Abra o app**: http://localhost:5173
2. **Clique em**: "REGISTRAR CONTAGEM"
3. **Preencha**:
   - Nome: Ex: "Ana Milena Suarez"
   - Link: Cole o link da biblioteca do Facebook
   - Tags: Ex: "3D, Impressoras"
4. **Salve**

### Extrair Anúncios Automaticamente 🤖

**Opção 1: Via Interface** (Mais fácil!)
1. Clique no target que você criou
2. Clique no botão roxo **"SCRAPING AUTOMÁTICO"**
3. Aguarde 20 segundos
4. Pronto! O número de anúncios foi extraído e salvo ✨

**Opção 2: Automático** (Background)
- O sistema roda sozinho a cada 12 horas
- Você não precisa fazer nada!

## 🔑 Onde Pegar as Credenciais do Supabase

1. Acesse: https://app.supabase.com
2. Vá no seu projeto
3. Settings → API
4. Copie:
   - `URL` → Cole no `.env` do projeto principal
   - `anon public` → Cole no `.env` do projeto principal
   - `service_role` → Cole no `.env` do scraper-service

## 📊 O que Fazer Agora

### Sem o Scraper
✅ Adicionar targets manualmente  
✅ Registrar contagens manualmente  
✅ Ver gráficos e análises  
✅ Adicionar notas táticas  

### Com o Scraper (RECOMENDADO)
✅ Tudo acima +  
✅ **Extração automática** de anúncios  
✅ **Atualizações a cada 12 horas**  
✅ **Sem trabalho manual**  
✅ **Histórico completo automático**  

## ❓ Problemas?

### "Scraper service não está rodando"
```powershell
# Inicie o scraper em outro terminal:
cd scraper-service
npm start
```

### "Não consigo ver o botão de scraping"
- Certifique-se de que o link do target é da Biblioteca do Facebook
- Exemplo válido: `https://www.facebook.com/ads/library/?active_status=active...`

### "Erro ao extrair anúncios"
- Verifique os screenshots em `scraper-service/screenshots/`
- Teste a URL no navegador manualmente
- Veja os logs no terminal do scraper

## 📖 Documentação Completa

- **Setup detalhado do scraper**: [SCRAPER-SETUP.md](./SCRAPER-SETUP.md)
- **README completo**: [README.md](./README.md)
- **Documentação do scraper**: [scraper-service/README.md](./scraper-service/README.md)

## 🚀 Pronto!

Agora você tem:
- ✅ Sistema de rastreamento rodando
- ✅ Scraping automático configurado
- ✅ Atualizações a cada 12 horas
- ✅ Interface visual para controle

**Próximos passos**:
1. Adicione seus concorrentes
2. Use o scraping automático
3. Analise os gráficos
4. Configure alertas
5. Deixe o bot trabalhar por você! 🤖✨

---

💡 **Dica**: Mantenha os 2 terminais abertos (app + scraper) para ter todas as funcionalidades!
