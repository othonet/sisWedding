# sisWedding

Convite de casamento digital com lista de presentes — tema **copo de leite** (verde, branco e dourado), visual em glassmorfismo e pensado primeiro para o celular.

## Como funciona

1. **Convite** — tela de abertura com os nomes, data, horário e local do almoço.
2. **Identificação** — o convidado informa nome e sobrenome. Se voltar com o mesmo nome, reencontra o próprio cadastro e os presentes já escolhidos.
3. **Lista de presentes** — o convidado pode escolher vários presentes. Itens únicos somem da lista quando escolhidos; itens com várias unidades vão diminuindo conforme os convidados escolhem. A reserva é feita de forma atômica no banco: dois convidados nunca levam a mesma unidade, e quem tentar escolher algo que acabou de ser reservado é avisado e tem a seleção ajustada.
4. **Agradecimento** — mostra os presentes escolhidos e o convite para o almoço, com mapa, atalhos para Google Maps e Waze e botão "Adicionar à agenda".
5. **Painel dos noivos** (`/admin`) — protegido por usuário e senha (sessão de 12 horas):
   - **Convidados**: quem se identificou e quais presentes escolheu, estatísticas, busca, exportação em CSV e cancelamento de escolhas (as unidades voltam para a lista).
   - **Presentes**: criar, editar e excluir presentes da lista, ver o estoque e quem escolheu cada um. Excluir um presente já escolhido pede uma segunda confirmação e apaga também as escolhas dele.

## Estrutura

```
api/               funções serverless (Vercel)
  gifts.js         GET  lista de presentes
  guests.js        POST identificação do convidado
  selections.js    GET/POST presentes do convidado / reserva
  admin/           painel (login + rotas protegidas por token)
lib/               conexão com o banco e utilitários HTTP
db/schema.sql      estrutura do banco
db/seed.sql        lista de presentes de exemplo
public/            site estático (convite + painel)
public/js/config.js  ← nomes, data, local e textos do convite
dev-server.js      servidor local que imita a Vercel
```

## Personalizar

Edite **`public/js/config.js`**: nomes do casal (`name1` e `name2`, na ordem do convite), data/hora, local, endereço (`mapQuery` é o que aparece no mapa), traje e mensagens. Os presentes podem ser cadastrados pelo painel `/admin` ou direto no `db/seed.sql`.

## Rodar localmente

Requer Node.js 20 ou superior.

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:3000. Sem `DATABASE_URL`, o sistema usa um PostgreSQL embutido (PGlite) em `data/pglite`, já com os presentes de exemplo. O painel fica em http://localhost:3000/admin.

O login do painel e o banco são configurados por variáveis de ambiente. Localmente, copie `.env.example` para `.env` e preencha (o `.env` não vai para o git, então a senha nunca fica no repositório):

```
ADMIN_USER=admin
ADMIN_PASSWORD="sua-senha"
DATABASE_URL=            # vazio = PGlite local
```

Use aspas na senha se ela tiver `#`.

## Publicar (Supabase + Vercel)

### 1. Banco no Supabase

1. Crie um projeto em https://supabase.com.
2. Em **SQL Editor**, cole e execute `db/schema.sql`. Depois, se quiser a lista de exemplo, execute `db/seed.sql`.
3. Em **Connect** (ou *Project Settings → Database*), copie a connection string do **Transaction pooler** (porta `6543`) e troque `[YOUR-PASSWORD]` pela senha do banco.

> As tabelas ficam com RLS ativado e sem políticas: só o backend (via connection string) acessa os dados; a API pública do Supabase não expõe nada.

### 2. Projeto na Vercel

1. Em https://vercel.com, **Add New → Project** e importe o repositório `othonet/sisWedding`.
2. Framework Preset: **Other** (sem build command; o `vercel.json` já aponta `public/` como saída).
3. Em **Environment Variables**, adicione:
   - `DATABASE_URL` — a connection string do Supabase (Transaction pooler).
   - `ADMIN_USER` — o usuário do painel (`admin`).
   - `ADMIN_PASSWORD` — a senha do painel (na Vercel, digite sem aspas).
4. **Deploy**. O convite fica na raiz do domínio e o painel em `/admin`.
