const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Validar se a chave está configurada
if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  Aviso: GEMINI_API_KEY não está configurada!');
    console.warn('Configure GEMINI_API_KEY no painel do Render para que o chat funcione corretamente.');
}

// Cache do nome do modelo (reseta a cada 5 minutos para evitar ficar preso em modelo sobrecarregado)
let _cachedModelName = null;
let _cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

async function getModelName() {
    // Verificar se cache ainda é válido
    if (_cachedModelName && _cacheTimestamp && (Date.now() - _cacheTimestamp < CACHE_DURATION)) {
        return _cachedModelName;
    }

    // Cache expirou ou vazio — tentar detectar novo modelo
    // Prioridade: Flash (Rapidez) -> Pro (Inteligência) -> 1.0 (Legado Estável)
        const candidates = [
            process.env.GEMINI_MODEL, // opcional override via env
            // Preferir modelo mais barato e eficiente
            'gemini-2.5-flash-lite',
            'models/gemini-2.5-flash-lite',
            // Fallbacks quando flash-lite está sobrecarregado
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            // Outros
            'gemini-pro',
            'gemini-1',
            'gemini-1.0',
            'models/gemini-1.0',
            'text-bison@001',
            'text-bison-001',
            'chat-bison@001',
            'chat-bison'
        ].filter(Boolean);

    // 1) Tentar candidatos na ordem até encontrar um que funcione
    for (const candidate of candidates) {
        try {
            // Teste simples para validar o modelo
            const model = genAI.getGenerativeModel({ model: candidate });
            const probe = await model.generateContent('Ok');
            await probe.response;
            
            _cachedModelName = candidate;
            _cacheTimestamp = Date.now(); // Registrar timestamp do cache
            console.log('✅ Gemini: selecionado modelo ->', _cachedModelName);
            return _cachedModelName;
        } catch (err) {
            // Ignora erro e tenta o próximo (ex: 404 se o modelo não existir na região)
            continue;
        }
    }

    // Fallback final: Tentar listar modelos dinamicamente se tudo falhar
    try {
        if (typeof genAI.listModels === 'function') {
            const list = await genAI.listModels();
            const modelsList = (list && (list.models || list)) || [];
            // Procura qualquer modelo que contenha "gemini" e suporte "generateContent"
            const fallback = modelsList.find(m => 
                m.name.includes('gemini') && 
                m.supportedGenerationMethods.includes('generateContent')
            );
            if (fallback) {
                _cachedModelName = fallback.name.replace('models/', '');
                _cacheTimestamp = Date.now(); // Registrar timestamp do cache
                console.log('✅ Gemini: selecionado fallback via listModels ->', _cachedModelName);
                return _cachedModelName;
            }
        }
    } catch (e) {
        console.warn('Falha ao listar modelos:', e.message);
    }

    throw new Error('Nenhum modelo Gemini compatível encontrado. Verifique sua API Key.');
}

/**
 * Processa uma pergunta do usuário e gera uma query SQL para BigQuery
 */
async function generateSQLQuery(userQuestion, schema) {
    try {
        const modelName = await getModelName();
        
        // Compactar schema
        function compactSchema(inputSchema) {
            try {
                const out = { 
                    dataset: inputSchema.dataset || '', 
                    tables_available: Object.keys(inputSchema.tables || []),
                    tables: {} 
                };
                for (const [tableName, tableInfo] of Object.entries(inputSchema.tables || {})) {
                    out.tables[tableName] = {
                        fields: (tableInfo.fields || []).slice(0, 20).map(f => ({ name: f.name, type: f.type }))
                    };
                }
                return out;
            } catch (e) {
                return { tables: Object.keys(inputSchema.tables || {}) };
            }
        }

        const smallSchema = compactSchema(schema);

        // Instruções simples e diretas para geração de SQL
        const systemInstruction = `Você é um especialista em BigQuery SQL.

Você tem acesso a estas tabelas no dataset dados_formacao:
${Object.keys(smallSchema.tables || {}).join(', ')}

Aqui estão as colunas disponíveis:
${JSON.stringify(smallSchema, null, 2)}

INSTRUÇÕES IMPORTANTES:
1. Responda APENAS com SQL puro. Sem explicações, sem Markdown, sem backticks.
2. Use \`dashboard-educacao-ep-pr.dados_formacao.nome_tabela\` nos FROM.
3. Sempre adicione LIMIT 100 ao final.
4. Se não conseguir gerar SQL válido, responda: ERRO: [razão breve]

Exemplos de queries válidas:
- SELECT COUNT(*) AS total FROM \`dashboard-educacao-ep-pr.dados_formacao.tb_educacao_especial\`
- SELECT * FROM \`dashboard-educacao-ep-pr.dados_formacao.tb_painel_final_rapido\` LIMIT 100
`;

        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent(userQuestion);
        const response = await result.response;
        let sqlQuery = response.text().trim();

        console.log('SQL gerado (bruto):', sqlQuery.substring(0, 200)); // Log primeiros 200 chars

        // Limpeza de segurança (caso o modelo ainda use markdown)
        sqlQuery = sqlQuery.replace(/```sql/g, '').replace(/```/g, '').trim();

        if (!sqlQuery || sqlQuery.startsWith('ERRO')) {
            console.error('IA retornou erro ou vazio:', sqlQuery);
            throw new Error('IA não conseguiu gerar query válida: ' + (sqlQuery || 'resposta vazia'));
        }

        return sqlQuery;
    } catch (error) {
        console.error('Erro SQL Gemini:', error && (error.message || error));
        throw new Error('Erro ao gerar query: ' + (error && error.message ? error.message : 'desconhecido'));
    }
}

/**
 * Formata a resposta do BigQuery em linguagem natural
 */
async function formatResponse(userQuestion, queryResults) {
    try {
        const modelName = await getModelName();
        
        const systemInstruction = `Você é o assistente do sistema "Estágio Probatório".
        Seja amigável, direto e use emojis.
        Analise os DADOS fornecidos e responda à PERGUNTA do usuário.`;

        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: systemInstruction 
        });

        const prompt = `PERGUNTA: ${userQuestion}\n\nDADOS: ${JSON.stringify(queryResults, null, 2)}`;

        const result = await model.generateContent(prompt);
        return (await result.response).text().trim();
    } catch (error) {
        console.error('Erro formatResponse:', error);
        return "Aqui estão os dados encontrados: " + JSON.stringify(queryResults);
    }
}

/**
 * Processa uma pergunta geral
 */
async function processGeneralQuestion(userQuestion) {
    try {
        const modelName = await getModelName();
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: "Você é um assistente amigável do sistema educacional 'Estágio Probatório'. O sistema tem jogos (Space Invaders, Tetris) e métricas. Se perguntarem de dados específicos, peça para serem mais detalhados."
        });

        const result = await model.generateContent(userQuestion);
        return (await result.response).text().trim();
    } catch (error) {
        return "Desculpe, estou tendo dificuldades para responder agora.";
    }
}

/**
 * Detecta se a pergunta requer consulta ao banco de dados
 */
async function requiresDatabaseQuery(userQuestion) {
    try {
        const modelName = await getModelName();
        // Usamos responseMimeType para forçar JSON, garantindo true/false
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Analise a pergunta: "${userQuestion}"
        Ela requer consulta SQL a um banco de dados de usuários/notas/jogos?
        Responda APENAS com este JSON: { "requires_db": boolean }`;

        const result = await model.generateContent(prompt);
        const text = (await result.response).text();
        const json = JSON.parse(text);
        
        return json.requires_db === true;
    } catch (error) {
        // Fallback seguro: na dúvida, tenta consultar o banco se parecer uma pergunta complexa
        return userQuestion.length > 10;
    }
}

/**
 * Processa mensagem principal
 */
async function processMessage(userQuestion, schema, executeQueryFunc) {
    try {
        const needsDatabase = await requiresDatabaseQuery(userQuestion);

        if (!needsDatabase) {
            const response = await processGeneralQuestion(userQuestion);
            return { success: true, message: response, sql: null, data: null, type: 'general' };
        }

        const sqlQuery = await generateSQLQuery(userQuestion, schema);

        if (sqlQuery.startsWith('ERRO')) {
            return { success: false, message: sqlQuery, type: 'error' };
        }

        const queryResults = await executeQueryFunc(sqlQuery);
        const formattedResponse = await formatResponse(userQuestion, queryResults);

        return {
            success: true,
            message: formattedResponse,
            sql: sqlQuery,
            data: queryResults,
            type: 'data'
        };
    } catch (error) {
        console.error('Erro processMessage:', error);
        return { success: false, message: 'Erro interno ao processar IA.', error: error.message };
    }
}

/**
 * Gera sugestões usando JSON MODE (Recurso 1.5)
 */
async function generateSuggestions(schema) {
    try {
        const modelName = await getModelName();
        
        // Compactar schema apenas com nomes das tabelas e colunas principais
        const simplifiedSchema = Object.keys(schema.tables || {}).map(t => ({
            table: t,
            columns: (schema.tables[t].fields || []).map(f => f.name).slice(0, 5)
        }));

        const model = genAI.getGenerativeModel({ 
            model: modelName,
            // FORÇA O RETORNO EM JSON (Disponível no Gemini 1.5 Flash/Pro)
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Com base neste schema: ${JSON.stringify(simplifiedSchema)}
        Gere 4 perguntas curtas e analíticas que um gestor faria.
        Retorne APENAS um array de strings JSON. 
        Exemplo: ["Pergunta 1", "Pergunta 2"]`;

        const result = await model.generateContent(prompt);
        const jsonResponse = JSON.parse((await result.response).text());
        
        // O modelo pode retornar { "questions": [...] } ou direto [...]
        if (Array.isArray(jsonResponse)) return jsonResponse;
        if (jsonResponse.questions) return jsonResponse.questions;
        return Object.values(jsonResponse)[0] || [];

    } catch (error) {
        console.error('Erro sugestões:', error);
        return ["Quantos usuários ativos?", "Qual a média de notas?", "Quem jogou hoje?"];
    }
}

module.exports = {
    generateSQLQuery,
    formatResponse,
    processGeneralQuestion,
    requiresDatabaseQuery,
    processMessage,
    generateSuggestions,
    getModelName
};