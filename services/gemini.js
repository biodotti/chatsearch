const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Validar se a chave está configurada
if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  Aviso: GEMINI_API_KEY não está configurada!');
    console.warn('Configure GEMINI_API_KEY no painel do Render para que o chat funcione corretamente.');
}

/**
 * Processa uma pergunta do usuário e gera uma query SQL para BigQuery
 * @param {string} userQuestion - Pergunta do usuário em linguagem natural
 * @param {Object} schema - Schema das tabelas do BigQuery
 * @returns {Promise<string>} Query SQL gerada
 */
async function generateSQLQuery(userQuestion, schema) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY não está configurada. Configure no painel do Render.');
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        // Para evitar prompts excessivamente grandes, compactamos o schema
        function compactSchema(inputSchema) {
            try {
                const out = { dataset: inputSchema.dataset, project: inputSchema.project, tables: {} };
                for (const [tableName, tableInfo] of Object.entries(inputSchema.tables || {})) {
                    out.tables[tableName] = {
                        fields: (tableInfo.fields || []).slice(0, 8).map(f => ({ name: f.name, type: f.type }))
                    };
                }
                return out;
            } catch (e) {
                return { dataset: inputSchema.dataset || '', project: inputSchema.project || '', tables: Object.keys(inputSchema.tables || {}) };
            }
        }

        const smallSchema = compactSchema(schema);

        const prompt = `Você é um assistente especializado em gerar queries SQL para BigQuery.

SCHEMA DO BANCO DE DADOS (resumido):
${JSON.stringify(smallSchema, null, 2)}

REGRAS IMPORTANTES:
1. Gere APENAS a query SQL, sem explicações ou texto adicional
2. Use apenas comandos SELECT (nunca DROP, DELETE, UPDATE, INSERT, ALTER, CREATE)
3. Use a sintaxe padrão do BigQuery
4. Se a pergunta não puder ser respondida com os dados disponíveis, retorne: "ERRO: Não é possível responder com os dados disponíveis"
5. Sempre use nomes de tabelas totalmente qualificados: \`projeto.dataset.tabela\`
6. Limite os resultados a no máximo 100 linhas com LIMIT 100

PERGUNTA DO USUÁRIO:
${userQuestion}

QUERY SQL:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let sqlQuery = response.text().trim();

        // Remover markdown code blocks se existirem
        sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();

        return sqlQuery;
    } catch (error) {
        console.error('Erro ao gerar SQL com Gemini:', error);
        throw new Error('Erro ao processar sua pergunta com IA');
    }
}

/**
 * Formata a resposta do BigQuery em linguagem natural
 * @param {string} userQuestion - Pergunta original do usuário
 * @param {Array} queryResults - Resultados da query do BigQuery
 * @returns {Promise<string>} Resposta formatada em linguagem natural
 */
async function formatResponse(userQuestion, queryResults) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `Você é um assistente amigável do sistema Estágio Probatório Play.

PERGUNTA DO USUÁRIO:
${userQuestion}

DADOS RETORNADOS DO BANCO:
${JSON.stringify(queryResults, null, 2)}

INSTRUÇÕES:
1. Responda à pergunta do usuário de forma clara e amigável
2. Use os dados fornecidos para criar uma resposta informativa
3. Se houver números, apresente-os de forma legível (ex: "127 professores" em vez de "127")
4. Se houver múltiplos resultados, organize-os de forma clara (use listas ou parágrafos)
5. Seja conciso mas completo
6. Use emojis quando apropriado para tornar a resposta mais amigável
7. Se não houver dados, informe isso de forma educada

RESPOSTA:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Erro ao formatar resposta com Gemini:', error);
        throw new Error('Erro ao formatar resposta');
    }
}

/**
 * Processa uma pergunta geral (não relacionada a dados)
 * @param {string} userQuestion - Pergunta do usuário
 * @returns {Promise<string>} Resposta da IA
 */
async function processGeneralQuestion(userQuestion) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `Você é um assistente amigável do sistema Estágio Probatório Play, uma plataforma educacional com jogos formativos.

O sistema inclui:
- Jogos educativos (Space Invaders Formativo, Tetris Formativo, Game Car Formativo, Clóvis)
- Dashboard de dados e métricas
- Sistema de chat com IA (você!)

Responda à pergunta do usuário de forma amigável e útil. Se a pergunta for sobre dados ou métricas, sugira que o usuário faça uma pergunta específica sobre os dados.

PERGUNTA DO USUÁRIO:
${userQuestion}

RESPOSTA:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Erro ao processar pergunta geral com Gemini:', error);
        throw new Error('Erro ao processar sua pergunta');
    }
}

/**
 * Detecta se a pergunta requer consulta ao banco de dados
 * @param {string} userQuestion - Pergunta do usuário
 * @returns {Promise<boolean>} True se requer consulta ao BD
 */
async function requiresDatabaseQuery(userQuestion) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        const prompt = `Analise se a pergunta abaixo requer consulta a um banco de dados ou pode ser respondida como uma conversa geral.

Responda APENAS com "SIM" ou "NÃO".

Exemplos de perguntas que requerem banco de dados (SIM):
- "Quantos professores completaram o estágio?"
- "Qual a média de notas?"
- "Mostre os dados de 2024"
- "Liste os professores aprovados"

Exemplos de perguntas gerais (NÃO):
- "Olá, como você está?"
- "O que você pode fazer?"
- "Como funciona o sistema?"
- "Obrigado!"

PERGUNTA:
${userQuestion}

RESPOSTA (SIM ou NÃO):`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const answer = response.text().trim().toUpperCase();

        return answer.includes('SIM');
    } catch (error) {
        console.error('Erro ao detectar tipo de pergunta:', error);
        // Em caso de erro, assume que requer consulta ao BD
        return true;
    }
}

/**
 * Processa uma mensagem do usuário: detecta se é pergunta sobre dados e processa com Gemini + BigQuery
 * @param {string} userQuestion - Pergunta do usuário
 * @param {Object} schema - Schema das tabelas do BigQuery
 * @param {Function} executeQueryFunc - Função para executar queries no BigQuery
 * @returns {Promise<Object>} Resultado com success, message, sql e data
 */
async function processMessage(userQuestion, schema, executeQueryFunc) {
    try {
        // Detectar se requer consulta ao BD
        const needsDatabase = await requiresDatabaseQuery(userQuestion);

        if (!needsDatabase) {
            // Resposta geral, sem dados
            const response = await processGeneralQuestion(userQuestion);
            return {
                success: true,
                message: response,
                sql: null,
                data: null,
                type: 'general'
            };
        }

        // Gerar SQL com Gemini
        const sqlQuery = await generateSQLQuery(userQuestion, schema);

        // Verificar se gerou erro
        if (sqlQuery.includes('ERRO:')) {
            return {
                success: false,
                message: sqlQuery,
                sql: null,
                data: null,
                type: 'error'
            };
        }

        // Executar query no BigQuery
        const queryResults = await executeQueryFunc(sqlQuery);

        // Formatar resposta com Gemini
        const formattedResponse = await formatResponse(userQuestion, queryResults);

        return {
            success: true,
            message: formattedResponse,
            sql: sqlQuery,
            data: queryResults,
            type: 'data'
        };
    } catch (error) {
        console.error('Erro ao processar mensagem com Gemini:', error && (error.stack || error.message || error));
        // Retornar erro estruturado para a rota consumir e exibir mensagem amigável
        return {
            success: false,
            message: 'Erro ao processar sua pergunta com IA',
            error: (error && error.message) ? error.message : 'Erro desconhecido'
        };
    }
}

/**
 * Gera sugestões de perguntas baseadas no schema do BigQuery
 * @param {Object} schema - Schema das tabelas do BigQuery
 * @returns {Promise<Array>} Array de sugestões de perguntas
 */
async function generateSuggestions(schema) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

        // Usar schema compactado para evitar prompts muito grandes
        function compactSchemaForSuggestions(inputSchema) {
            try {
                const out = { dataset: inputSchema.dataset, tables: {} };
                for (const [tableName, tableInfo] of Object.entries(inputSchema.tables || {})) {
                    out.tables[tableName] = (tableInfo.fields || []).slice(0, 6).map(f => f.name);
                }
                return out;
            } catch (e) {
                return { dataset: inputSchema.dataset || '', tables: Object.keys(inputSchema.tables || {}) };
            }
        }

        const smallSchema = compactSchemaForSuggestions(schema);

        const prompt = `Com base no seguinte schema de banco de dados (resumido), gere 4 sugestões de perguntas inteligentes que um usuário poderia fazer. As sugestões devem ser práticas, úteis e variadas.

SCHEMA (resumido):
${JSON.stringify(smallSchema, null, 2)}

Retorne as sugestões como um array JSON simples com strings, nada mais. Exemplo: ["Pergunta 1", "Pergunta 2", "Pergunta 3", "Pergunta 4"]

SUGESTÕES:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let suggestionsText = response.text().trim();

        // Remover markdown code blocks se existirem
        suggestionsText = suggestionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Tentar parsear como JSON
        try {
            const suggestions = JSON.parse(suggestionsText);
            return Array.isArray(suggestions) ? suggestions : [suggestionsText];
        } catch {
            // Se não for JSON válido, retornar como string única
            return [suggestionsText];
        }
    } catch (error) {
        console.error('Erro ao gerar sugestões com Gemini:', error);
        throw error;
    }
}

module.exports = {
    generateSQLQuery,
    formatResponse,
    processGeneralQuestion,
    requiresDatabaseQuery,
    processMessage,
    generateSuggestions
};
