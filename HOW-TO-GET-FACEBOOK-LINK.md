# 🔗 Como Obter o Link da Biblioteca de Anúncios do Facebook

Guia passo a passo para conseguir o link correto dos anúncios do seu concorrente.

## 📍 Método 1: Busca pelo Nome (Mais Fácil)

### Passo 1: Acesse a Biblioteca de Anúncios
Acesse: https://www.facebook.com/ads/library

### Passo 2: Configure os Filtros
1. **País**: Selecione "Todos os países" ou específico
2. **Categoria**: "Todos os anúncios"
3. **Status**: "Ativo"

### Passo 3: Busque o Concorrente
1. Digite o **nome da página** do concorrente na barra de busca
   - Exemplo: "Ana Milena Suarez"
2. Pressione Enter

### Passo 4: Clique na Página
1. Nos resultados, clique no **nome da página**
2. Você verá todos os anúncios ativos

### Passo 5: Copie o Link
1. Copie a URL da barra de endereço
2. Deve ser algo como:
   ```
   https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=123456789
   ```
3. **Cole esse link** no campo "LINK" ao adicionar um target no TrackerAds

## 📍 Método 2: Pela Página do Facebook

### Passo 1: Acesse a Página
Vá na página do Facebook do concorrente

### Passo 2: Menu de Transparência
1. Role até a seção **"Transparência da Página"** (geralmente no lado direito)
2. Clique em **"Ver anúncios"** ou **"Ver na Biblioteca de Anúncios"**

### Passo 3: Copie o Link
Copie a URL da página que abriu

## ✅ Verificação do Link

Um link válido deve conter:
- ✅ `facebook.com/ads/library`
- ✅ `active_status=active`
- ✅ `view_all_page_id=` seguido de números

### Exemplo de Link Válido
```
https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=576413898805490
```

### Exemplo de Link INVÁLIDO
```
https://www.facebook.com/AnaMilenaSuarez
```
❌ Este é o link da página, não da biblioteca de anúncios

## 🎯 Usando no TrackerAds

### Adicionar um Novo Target

1. No TrackerAds, clique em **"REGISTRAR CONTAGEM"**
2. Preencha os campos:
   ```
   NOME: Ana Milena Suarez
   LINK: https://www.facebook.com/ads/library/?active_status=active&...
   TAGS: 3D, Impressoras, Brasil
   ```
3. Clique em **"ADICIONAR TARGET"**

### Testar o Scraping

1. Clique no target que você criou
2. Na seção **"REGISTRAR ANÚNCIOS"**, você verá um botão roxo
3. Clique em **"SCRAPING AUTOMÁTICO"**
4. Aguarde 20-30 segundos
5. ✅ Pronto! O número de anúncios será extraído automaticamente

## 💡 Dicas

### Múltiplos Concorrentes
- Repita o processo para cada concorrente
- Organize usando **Tags** (Ex: "Nicho 3D", "Brasil", "Internacional")

### Melhores Práticas
- ✅ Use links da biblioteca (não da página)
- ✅ Mantenha `active_status=active` no link
- ✅ Cole o link completo (não encurte)

### Exemplos de Nichos

**Impressoras 3D**
```
NOME: MakerBot
LINK: https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=MakerBot
TAGS: 3D, Internacional
```

**Cursos Online**
```
NOME: Hotmart
LINK: https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=Hotmart
TAGS: Cursos, Brasil
```

**E-commerce**
```
NOME: Shopify
LINK: https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=Shopify
TAGS: E-commerce, Internacional
```

## 🔍 Encontrando Concorrentes

### Busca Direta
1. Pesquise por palavras-chave no Google: "seu nicho + Facebook ads"
2. Veja quais empresas aparecem
3. Busque essas empresas na Biblioteca de Anúncios

### Análise de Mercado
1. Liste seus principais concorrentes
2. Busque cada um na Biblioteca de Anúncios
3. Adicione todos no TrackerAds
4. Compare performance usando a **Análise Comparativa**

### Monitoramento de Nicho
1. Use tags para organizar por nicho
2. Adicione todos os players do seu mercado
3. Acompanhe quem está investindo mais em ads
4. Identifique tendências e oportunidades

## 🤖 Scraping Automático

Depois de adicionar os links:

✅ **Manual**: Clique no botão "SCRAPING AUTOMÁTICO" quando quiser  
✅ **Automático**: O sistema atualiza a cada 12 horas sozinho  

Você receberá:
- Número de anúncios ativos
- Histórico de variação
- Gráficos de tendência
- Análise de performance

## ❓ FAQ

### "Não encontro a página do concorrente"
- Verifique se a página está ativa
- Tente buscar por nome diferente
- Procure variações do nome da empresa

### "A página não tem anúncios ativos"
- Nem todas as páginas têm anúncios no momento
- Adicione mesmo assim para monitorar quando começarem
- O TrackerAds registrará "0 anúncios"

### "O link não funciona no scraping"
- Verifique se o link é da biblioteca (não da página)
- Teste o link manualmente no navegador
- Veja os screenshots em `scraper-service/screenshots/`

## 📚 Recursos Adicionais

- [Meta Ad Library](https://www.facebook.com/ads/library) - Biblioteca oficial
- [Meta Transparency Center](https://transparency.fb.com) - Centro de transparência
- [TrackerAds Setup](./SCRAPER-SETUP.md) - Setup do scraper

---

**✨ Pronto! Agora você sabe como adicionar qualquer concorrente no TrackerAds e monitorar automaticamente!**
