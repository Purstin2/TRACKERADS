# 🧠 Sistema de Classificação Inteligente de Ofertas

## 📋 Visão Geral

Sistema automático que analisa a performance de cada oferta e classifica em categorias estratégicas, ajudando você a identificar rapidamente onde focar seus esforços.

---

## 🏷️ Tags Disponíveis

### 1. **ESCALANDO** 🚀
**Cor:** Verde
**Quando aparece:**
- Crescimento explosivo: +50% ou mais em 7 dias
- Crescimento consistente: +20% ou mais com tendência de alta
- Volume: 50+ anúncios ativos

**Ação sugerida:** Aumentar investimento

---

### 2. **VALIDANDO** 🔍
**Cor:** Azul
**Quando aparece:**
- Crescimento promissor: +20% ou mais
- Volume: Entre 10-49 anúncios
- Estável com potencial de crescimento

**Ação sugerida:** Monitorar de perto

---

### 3. **TESTANDO** 🧪
**Cor:** Amarelo
**Quando aparece:**
- Fase inicial (primeiros 7 dias)
- Volume: Entre 10-49 anúncios
- Queda leve mas ainda dentro do esperado

**Ação sugerida:** Coletar mais dados

---

### 4. **MORRENDO** ⚠️
**Cor:** Vermelho
**Quando aparece:**
- Queda rápida: -50% ou mais em 7 dias
- Queda significativa: -30% ou mais com volume baixo
- Performance em declínio acentuado

**Ação sugerida:** Revisar urgente ou pausar

---

### 5. **ESTÁVEL** 📊
**Cor:** Ciano
**Quando aparece:**
- Volume: 50+ anúncios
- Variação: Entre -10% e +10% (estável)
- Performance consistente

**Ação sugerida:** Manter estratégia atual

---

### 6. **OBSERVAR** 👀
**Cor:** Roxo
**Quando aparece:**
- Situação ambígua que precisa análise
- Volume: 10+ anúncios mas sem padrão claro

**Ação sugerida:** Revisar métricas

---

### 7. **BAIXO** 📉
**Cor:** Laranja
**Quando aparece:**
- Volume: Entre 1-9 anúncios
- Performance abaixo do esperado

**Ação sugerida:** Aguardar crescimento ou revisar

---

### 8. **SEM DADOS** ⚪
**Cor:** Cinza
**Quando aparece:**
- Ainda não foi feito scraping
- Dados inválidos ou insuficientes

**Ação sugerida:** Aguardar primeiro scraping

---

## 🔄 Como Funciona

### Análise Automática

O sistema analisa:
1. **Volume de anúncios** (quantidade atual)
2. **Tendência** (crescendo, caindo, estável)
3. **Velocidade de mudança** (% de variação)
4. **Consistência** (estabilidade dos dados)
5. **Tempo de existência** (dias desde o primeiro registro)

### Atualização Automática

As tags são atualizadas automaticamente quando:
- ✅ Novo scraping é executado
- ✅ Dados são atualizados no banco
- ✅ O card é renderizado

**Não precisa fazer nada manualmente!** 🎉

---

## 📊 Regras de Classificação (Ordem de Prioridade)

1. **MORRENDO** - Detectado primeiro (maior urgência)
2. **ESCALANDO** - Alta prioridade (oportunidade)
3. **VALIDANDO** - Monitoramento ativo
4. **TESTANDO** - Fase inicial
5. **ESTÁVEL** - Performance consistente
6. **OBSERVAR** - Necessita análise
7. **BAIXO** - Volume insuficiente
8. **SEM DADOS** - Fallback

---

## ⚙️ Configurações (Padrões)

```javascript
minAdsForTesting = 10      // Mínimo para "testando"
minAdsForScaling = 50       // Mínimo para "escalando"
growthThreshold = 20%       // Crescimento significativo
declineThreshold = -30%     // Queda significativa
rapidGrowthThreshold = 50%  // Crescimento explosivo
rapidDeclineThreshold = -50% // Queda rápida
```

---

## 🎯 Exemplos Práticos

### Exemplo 1: Oferta Escalando
```
Anúncios: 150
Variação 7d: +65%
Tendência: Crescendo
→ Tag: ESCALANDO 🚀
```

### Exemplo 2: Oferta Morrendo
```
Anúncios: 25
Variação 7d: -55%
Tendência: Caindo
→ Tag: MORRENDO ⚠️
```

### Exemplo 3: Oferta Validando
```
Anúncios: 35
Variação 7d: +25%
Tendência: Crescendo
→ Tag: VALIDANDO 🔍
```

### Exemplo 4: Oferta Testando
```
Anúncios: 15
Variação 7d: -5%
Dias desde criação: 3
→ Tag: TESTANDO 🧪
```

---

## 🔍 Visualização

Cada card mostra:
- **Tag colorida** no topo
- **Descrição** da classificação
- **Ação sugerida** (no tooltip ao passar o mouse)

---

## 🚀 Benefícios

1. ✅ **Identificação rápida** de oportunidades
2. ✅ **Alertas automáticos** para problemas
3. ✅ **Priorização** baseada em dados
4. ✅ **Atualização em tempo real**
5. ✅ **Decisões baseadas em evidências**

---

## 📝 Notas Importantes

- As tags são **calculadas automaticamente** a cada renderização
- Baseadas em **dados reais** do histórico de scraping
- **Não substituem** análise humana, mas **facilitam** a tomada de decisão
- As regras podem ser ajustadas no código se necessário

---

**Sistema desenvolvido com cuidado para não bugar nada! 🎯**
