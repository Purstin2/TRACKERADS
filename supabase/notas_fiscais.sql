-- Rastreio de emissão de nota fiscal por pedido.
--
-- Mesma ideia das colunas wa_* (recuperação por WhatsApp): o estado da emissão
-- mora no próprio pedido, não numa tabela à parte. Assim "esse pedido já tem
-- nota?" é uma leitura só, e o lote diário consegue filtrar direto no SQL.
--
-- Por que uma tabela separada para as notas em si: um pedido pode gerar VÁRIAS
-- notas. O contador definiu que order bump vira nota separada — então uma venda
-- com bump são duas notas, cada uma com seu número e sua situação.

-- ── resumo no pedido (pra filtrar rápido quem falta) ─────────────────────────
alter table kirvano_orders
  add column if not exists nf_status   text,        -- null | pendente | emitida | erro | dispensada
  add column if not exists nf_at       timestamptz, -- quando a última tentativa rodou
  add column if not exists nf_erro     text,        -- motivo da última falha (pra ver no painel)
  add column if not exists nf_tentativas int not null default 0;

create index if not exists kirvano_orders_nf_pendentes
  on kirvano_orders (status, nf_status, ordered_at)
  where status = 'APPROVED';

-- ── uma linha por nota emitida ───────────────────────────────────────────────
create table if not exists notas_fiscais (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references kirvano_orders(id) on delete cascade,
  -- qual item do pedido gerou esta nota (bump vira nota própria)
  produto_key   text not null,
  produto_nome  text,
  tipo          text not null check (tipo in ('nfe','nfse')),
  valor         numeric(12,2) not null,

  -- retorno do Bling
  bling_id      bigint,
  numero        text,
  serie         text,
  chave_acesso  text,
  situacao      int,          -- NFe: 1=rascunho 4=autorizada · NFSe: 0=pendente
  link_danfe    text,

  status        text not null default 'pendente', -- pendente | emitida | erro | cancelada
  erro          text,
  tentativas    int not null default 0,

  criada_em     timestamptz not null default now(),
  emitida_em    timestamptz,
  atualizada_em timestamptz not null default now()
);

-- um pedido não pode gerar a mesma nota duas vezes (proteção contra reprocessar
-- o lote e duplicar nota fiscal, que é erro caro de desfazer)
create unique index if not exists notas_fiscais_unica
  on notas_fiscais (order_id, produto_key);

create index if not exists notas_fiscais_status on notas_fiscais (status, criada_em);

-- RLS: só service role (o lote roda no servidor; o painel lê via API autenticada)
alter table notas_fiscais enable row level security;
