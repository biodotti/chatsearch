# 💬 Chat IA - Estágio Probatório

Aplicativo de chat inteligente que integra **Gemini AI** para processamento de linguagem natural e **BigQuery** para consulta de dados do Looker Studio.

## 🚀 Características

- **IA Conversacional**: Gemini AI processa perguntas em linguagem natural
- **Consultas Inteligentes**: Gera automaticamente queries SQL para BigQuery
- **Interface Moderna**: Design integrado ao Estágio Probatório
- **Segurança**: Rate limiting, validação de queries e proteção contra SQL injection
- **Sugestões Inteligentes**: Sugestões de perguntas baseadas no schema dos dados

## 📋 Pré-requisitos

- Node.js 18+ instalado
- Conta Google Cloud com:
  - BigQuery habilitado
  - API Gemini configurada
- Dados do Looker Studio no BigQuery

## 🔧 Instalação

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Credenciais

#### 2.1 Gemini AI API Key

1. Acesse [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crie uma nova API key
3. Copie a chave

#### 2.2 Google Cloud Service Account

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Vá em "IAM & Admin" > "Service Accounts"
3. Crie uma nova service account com permissões de BigQuery
4. Baixe o arquivo JSON de credenciais
5. Salve em `credentials/service-account.json`

### 3. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env`:

```bash
copy .env.example .env
```

Edite o arquivo `.env` com suas credenciais:

```env
# Gemini AI
GEMINI_API_KEY=sua_chave_gemini_aqui

# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account.json
GCP_PROJECT_ID=seu_projeto_id
BIGQUERY_DATASET=nome_do_dataset

# Server
PORT=3000
NODE_ENV=development
```

## ▶️ Executar Localmente

### Modo Desenvolvimento (com auto-reload)

```bash
npm run dev
```

### Modo Produção

```bash
npm start
```

Acesse: `http://localhost:3000`

## 📁 Estrutura do Projeto

```
EP/
├── server.js                 # Servidor Express principal
├── package.json              # Dependências do projeto
├── .env                      # Variáveis de ambiente (não commitar!)
├── .env.example              # Template de variáveis
├── .gitignore                # Arquivos ignorados pelo Git
├── routes/
│   └── chat.js               # Rotas da API de chat
├── services/
│   ├── gemini.js             # Integração com Gemini AI
│   └── bigquery.js           # Integração com BigQuery
├── public/
│   ├── chat.html             # Interface do chat
│   └── js/
│       └── chat.js           # Lógica do frontend
├── credentials/
│   └── service-account.json  # Credenciais Google Cloud (não commitar!)
└── index.html                # Página inicial
```

## 🔌 API Endpoints

### POST `/api/chat/message`
Processa uma mensagem do usuário

**Request:**
```json
{
  "message": "Quantos professores completaram o estágio?"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Em 2024, 127 professores completaram o estágio probatório.",
  "sql": "SELECT COUNT(*) FROM...",
  "data": [...]
}
```

### GET `/api/chat/suggestions`
Retorna sugestões de perguntas

### GET `/api/chat/schema`
Retorna o schema do BigQuery (debug)

### GET `/api/chat/health`
Health check da API

## 🚀 Deploy

### Opção 1: Vercel

1. Instale Vercel CLI: `npm i -g vercel`
2. Configure variáveis de ambiente no dashboard da Vercel
3. Deploy: `vercel --prod`

### Opção 2: Google Cloud Run

1. Crie um `Dockerfile`
2. Build: `gcloud builds submit --tag gcr.io/PROJECT_ID/chat-app`
3. Deploy: `gcloud run deploy --image gcr.io/PROJECT_ID/chat-app`

### Opção 3: VPS/Hospedagem Tradicional

1. Faça upload dos arquivos via FTP/SSH
2. Configure variáveis de ambiente no painel
3. Inicie com `npm start` ou configure PM2

### Opção 4: Render

1. No painel do Render, crie um novo serviço do tipo `Web Service` apontando para este repositório.
2. Defina as variáveis de ambiente necessárias no painel de Environment (ou use segredos):
  - `GEMINI_API_KEY` = sua chave Gemini
  - `GCP_PROJECT_ID` = seu projeto GCP
  - `BIGQUERY_DATASET` = nome do dataset
  - `GOOGLE_CREDENTIALS` = o conteúdo do JSON da service account (formato inteiro, como string)
3. No `Build Command` deixe `npm ci --production` e `Start Command` como `npm start`.
4. Deploy e monitore o endpoint de health: `https://<seu-servico>.onrender.com/api/health`

OBS: Se as credenciais de service account foram comitadas acidentalmente neste repositório, revogue-as imediatamente no Google Cloud Console e substitua por novas credenciais armazenadas como segredo no Render.

## 🔒 Segurança

- ✅ Rate limiting (20 requisições/minuto)
- ✅ Validação de queries SQL
- ✅ Proteção contra SQL injection
- ✅ Helmet.js para headers de segurança
- ✅ CORS configurado
- ✅ Credenciais em variáveis de ambiente

## 🐛 Troubleshooting

### Erro: "Gemini API key not configured"
- Verifique se `GEMINI_API_KEY` está no arquivo `.env`
- Confirme que a chave é válida

### Erro: "BigQuery connection failed"
- Verifique se o arquivo de credenciais existe
- Confirme que o service account tem permissões de BigQuery
- Verifique se `GCP_PROJECT_ID` e `BIGQUERY_DATASET` estão corretos

### Erro: "Table not found"
- Confirme que o dataset e tabelas existem no BigQuery
- Verifique se os nomes estão corretos

### Chat não responde
- Abra o console do navegador (F12) para ver erros
- Verifique se o servidor está rodando
- Teste o endpoint de health: `http://localhost:3000/api/health`

## 📝 Licença

© 2025 Estágio Probatório. Todos os direitos reservados.

## 🤝 Suporte

Para dúvidas ou problemas, entre em contato com a equipe de desenvolvimento.
