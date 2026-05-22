
# Plano — Admin & Comercial Ravin

Vou expandir o sistema atual em 3 grandes blocos. Como hoje os pedidos vivem só no `localStorage`, primeiro migro tudo para o banco (Lovable Cloud) — sem isso não dá pra ter CRM, automação ou múltiplos usuários.

## 1. Base de dados (Lovable Cloud)

Tabelas novas:
- `app_users` — credenciais (passcode hash), nome, papel (`master` | `vendedor`), ativo.
- `products` — SKU, descrição, NCM, preço unit, IPI %, saldo estoque, unidade, qtd por caixa.
- `email_recipients` — destinatários salvos (nome, email, tags).
- `email_templates` — modelos formais (assunto, corpo, variáveis).
- `leads` — nome, telefone (único), empresa, CNPJ, origem, status kanban, owner, score, próximo follow-up.
- `lead_notes` — anotações livres e timeline.
- `tasks` — to-dos, vencimento, status, lead vinculado, responsável.
- `wa_instances` — instâncias Evolution (nome, status, número conectado).
- `wa_messages` — histórico de conversas (lead_id, direção, texto, timestamp, message_id).
- `orders` — migra do localStorage para cá (cabeçalho + JSON de itens + cliente).

RLS: master vê tudo, vendedor só os próprios leads. Passcode continua único (manu2107@) para o Denis (master).

## 2. Painel Admin (`/admin`)

Sub-abas:
- **Estoque** — CRUD de produtos com busca, edição inline, importação rápida CSV. O Wizard de pedido passa a puxar daqui (autocomplete em vez de digitar tudo na mão).
- **WhatsApp / Evolution** — lista de instâncias. Botão "Nova instância" → digita só o nome → cria via Evolution API (`/instance/create`) já com webhook configurado apontando pro nosso endpoint público → modal abre o QR Code (`/instance/connect/{name}`) em tempo real (poll 2s) → quando conecta, mostra número e status "online". Botões: reconectar, desconectar, deletar.
- **Emails** — destinatários salvos (já existe parcial) + modelos de email reutilizáveis.
- **Usuários** — criar/editar/desativar usuários e seus passcodes.

## 3. Módulo Comercial (`/comercial`)

- **Kanban de leads** — colunas Novo → Qualificado → Proposta → Negociação → Fechado / Perdido. Arrastar muda status. Cards mostram nome, empresa, última interação, alerta de atraso (vermelho se follow-up vencido).
- **Página do cliente/lead** (`/comercial/lead/$id`) — visão 360°:
  - Dados cadastrais + CNPJ
  - Timeline de eventos (mensagens WA, notas, mudanças de status, pedidos criados)
  - Conversa WhatsApp embutida (chat em tempo real, com envio direto pela instância vinculada)
  - To-dos do lead
  - Pedidos vinculados (link pro Wizard pré-preenchido)
  - Botão "IA: sugerir próxima ação" → Lovable AI lê histórico e sugere mensagem/follow-up
- **Caixa de entrada unificada** — todas as conversas WA, ordenadas por não lida / mais recente.
- **To-dos & Atrasos** — painel com tarefas vencendo hoje, atrasadas, próximas.

## 4. Automação ATIVA (o coração do "não passivo")

- **Webhook Evolution** (`/api/public/wa/webhook`) recebe mensagens. Lógica:
  1. Mensagem entra de número `+55XXX`.
  2. Se telefone não existe em `leads` → cria lead novo automaticamente (status `Novo`, origem `WhatsApp`).
  3. Se existe → vincula mensagem ao lead, marca como não lida, dispara IA pra classificar intenção (interesse, dúvida, reclamação, pedido) e cria to-do se necessário.
- **Cron / trigger de follow-up** — diariamente checa leads sem interação há X dias e cria to-do "Reativar lead".
- **IA assistente** — em qualquer conversa, botão "Gerar resposta" usa Lovable AI Gateway com contexto do lead (histórico + pedidos).
- **Disparo ativo** — Denis pode selecionar leads no kanban e disparar mensagem personalizada (IA monta variações).

## 5. UX / UI

- Mantém identidade Ravin Wine + Jarvis (boot animado já existe).
- Sidebar nova: Dashboard · Pedidos · Comercial · Admin · Sair.
- Tudo responsivo, com skeletons e toasts.

## Detalhes técnicos

- **Server functions** (`createServerFn`) para tudo que toca Evolution / banco com lógica.
- **Webhook público** em `src/routes/api/public/wa/webhook.ts` (sem auth, com validação por token na URL).
- **Evolution API**: base URL `https://vssolutions-evolution-api.fjsxhg.easypanel.host/`. Vou pedir a **API Key global** como secret (`EVOLUTION_API_KEY`) — sem ela não consigo criar instâncias.
- **Realtime**: ativar `supabase_realtime` em `wa_messages`, `leads`, `tasks` para o painel atualizar sozinho.
- **Lovable AI Gateway** (já configurado) para classificação, sugestões e geração de mensagens — sem custo extra de chave.

## Entrega faseada (nesta mesma execução)

1. Migração do banco (todas as tabelas + RLS).
2. Webhook Evolution + criação automática de lead.
3. Admin: Estoque, Instâncias WA (criar + QR), Emails, Usuários.
4. Comercial: Kanban, página do lead com chat WA, to-dos, IA.
5. Integração do Wizard de pedido com estoque + lead.
6. Sidebar nova e navegação.

## O que preciso de você antes de começar

**A chave global da Evolution API** (campo `apikey` / `AUTHENTICATION_API_KEY` do seu servidor easypanel). Vou abrir o pedido de secret na sequência. Sem ela só consigo entregar a parte de banco + UI; a integração WhatsApp fica inativa.

Confirma o plano que eu sigo direto pra implementação?
