const express = require('express');
const router = express.Router();
const geminiService = require('../services/gemini');
const bigqueryService = require('../services/bigquery');

// Cache do schema para evitar múltiplas consultas
let cachedSchema = null;
let schemaLastUpdated = null;
const SCHEMA_CACHE_DURATION = 3600000; // 1 hora em milissegundos

/**
 * Obtém o schema do BigQuery (com cache)
 */
async function getSchema() {
    const now = Date.now();

    // Retornar cache se ainda válido
    if (cachedSchema && schemaLastUpdated && (now - schemaLastUpdated < SCHEMA_CACHE_DURATION)) {
        return cachedSchema;
    }

    // Atualizar cache
    try {
        cachedSchema = await bigqueryService.getDatasetSchema();
        schemaLastUpdated = now;
        return cachedSchema;
    } catch (error) {
        console.error('Erro ao obter schema:', error);
        // Se houver cache antigo, usar ele
        if (cachedSchema) {
            console.warn('Usando schema em cache antigo devido a erro');
            return cachedSchema;
        }
        throw error;
    }
}

/**
 * POST /api/chat/message
 * Processa uma mensagem do usuário
 */
router.post('/message', async (req, res) => {
    try {
        const { message } = req.body;

        // Validar entrada
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Mensagem inválida ou vazia'
            });
        }

        // Limitar tamanho da mensagem
        if (message.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'Mensagem muito longa. Máximo 500 caracteres.'
            });
        }

        // Obter schema do BigQuery
        const schema = await getSchema();

        // Processar mensagem com Gemini + BigQuery
        const result = await geminiService.processMessage(
            message,
            schema,
            bigqueryService.executeQuery
        );

        res.json(result);
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar sua mensagem. Tente novamente.',
            message: error.message
        });
    }
});

/**
 * GET /api/chat/suggestions
 * Retorna sugestões de perguntas baseadas no schema
 */
router.get('/suggestions', async (req, res) => {
    try {
        const schema = await getSchema();
        const suggestions = await geminiService.generateSuggestions(schema);

        res.json({
            success: true,
            suggestions
        });
    } catch (error) {
        console.error('Erro ao gerar sugestões:', error);
        // Retornar sugestões padrão em caso de erro
        res.json({
            success: true,
            suggestions: [
                'Quantos registros existem no total?',
                'Mostre os dados mais recentes',
                'Qual é a distribuição por categoria?',
                'Quais são os principais indicadores?'
            ]
        });
    }
});

/**
 * GET /api/chat/schema
 * Retorna o schema do BigQuery (para debug)
 */
router.get('/schema', async (req, res) => {
    try {
        const schema = await getSchema();

        res.json({
            success: true,
            schema
        });
    } catch (error) {
        console.error('Erro ao obter schema:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter schema do banco de dados',
            message: error.message
        });
    }
});

/**
 * GET /api/chat/health
 * Health check do serviço de chat
 */
router.get('/health', async (req, res) => {
    try {
        // Testar conexão com BigQuery
        await bigqueryService.testConnection();

        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service_account: bigqueryService.getServiceAccountEmail(),
            services: {
                gemini: process.env.GEMINI_API_KEY ? 'configured' : 'not configured',
                bigquery: process.env.GCP_PROJECT_ID ? 'configured' : 'not configured'
            }
        });
    } catch (error) {
        console.error('Health check falhou:', error);
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/chat/clear-cache
 * Limpa o cache do schema (útil para desenvolvimento)
 */
router.post('/clear-cache', (req, res) => {
    cachedSchema = null;
    schemaLastUpdated = null;

    res.json({
        success: true,
        message: 'Cache do schema limpo com sucesso'
    });
});

module.exports = router;
