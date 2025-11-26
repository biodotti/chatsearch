const { BigQuery } = require('@google-cloud/bigquery');

// Inicializar cliente BigQuery
let bigquery;
let credentialsConfigured = false;

if (process.env.GOOGLE_CREDENTIALS) {
    // Em produção (Render, Vercel, etc) - credenciais via variável de ambiente
    try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        bigquery = new BigQuery({
            projectId: process.env.GCP_PROJECT_ID,
            credentials: credentials
        });
        credentialsConfigured = true;
        console.log('✅ BigQuery inicializado com GOOGLE_CREDENTIALS');
    } catch (error) {
        console.error('❌ Erro ao parsear GOOGLE_CREDENTIALS:', error.message);
        bigquery = null;
    }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Em desenvolvimento local - credenciais via arquivo
    try {
        bigquery = new BigQuery({
            projectId: process.env.GCP_PROJECT_ID,
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
        });
        credentialsConfigured = true;
        console.log('✅ BigQuery inicializado com arquivo de credenciais');
    } catch (error) {
        console.error('❌ Erro ao inicializar BigQuery com arquivo:', error.message);
        bigquery = null;
    }
} else {
    console.warn('⚠️  Aviso: Nenhuma credencial do Google Cloud configurada!');
    console.warn('Configure GOOGLE_CREDENTIALS (recomendado) ou GOOGLE_APPLICATION_CREDENTIALS');
    bigquery = null;
}

/**
 * Valida uma query SQL para prevenir comandos perigosos
 * @param {string} sql - Query SQL a ser validada
 * @returns {boolean} True se a query é segura
 */
function validateQuery(sql) {
    const upperSQL = sql.toUpperCase();

    // Lista de comandos proibidos
    const forbiddenCommands = [
        'DROP',
        'DELETE',
        'UPDATE',
        'INSERT',
        'ALTER',
        'CREATE',
        'TRUNCATE',
        'GRANT',
        'REVOKE'
    ];

    // Verificar se contém comandos proibidos
    for (const cmd of forbiddenCommands) {
        if (upperSQL.includes(cmd)) {
            return false;
        }
    }

    // Verificar se começa com SELECT
    if (!upperSQL.trim().startsWith('SELECT')) {
        return false;
    }

    return true;
}

/**
 * Executa uma query SQL no BigQuery
 * @param {string} sql - Query SQL a ser executada
 * @returns {Promise<Array>} Resultados da query
 */
async function executeQuery(sql) {
    try {
        if (!bigquery || !credentialsConfigured) {
            throw new Error('BigQuery não está configurado. Verifique se as credenciais foram definidas nas variáveis de ambiente.');
        }

        // Validar query antes de executar
        if (!validateQuery(sql)) {
            throw new Error('Query SQL não permitida. Apenas comandos SELECT são aceitos.');
        }

        console.log('Executando query:', sql);

        // Executar query com localização dinâmica (padrão: southamerica-east1 para Brasil, fallback: US)
        const location = process.env.BIGQUERY_LOCATION || 'southamerica-east1';
        const [rows] = await bigquery.query({
            query: sql,
            location: location,
        });

        console.log(`Query retornou ${rows.length} linhas (location: ${location})`);

        return rows;
    } catch (error) {
        console.error('Erro ao executar query no BigQuery:', error);

        // Tratar erros específicos do BigQuery
        if (error.message.includes('Not found: Table')) {
            throw new Error('Tabela não encontrada no BigQuery. Verifique o nome da tabela.');
        } else if (error.message.includes('Syntax error')) {
            throw new Error('Erro de sintaxe na query SQL. Por favor, reformule sua pergunta.');
        } else if (error.message.includes('Permission denied') || error.message.includes('Access Denied')) {
            throw new Error('Sem permissão para acessar os dados. Verifique as credenciais e permissões da service account.');
        }

        throw new Error('Erro ao consultar dados: ' + error.message);
    }
}

/**
 * Obtém o schema de uma tabela específica
 * @param {string} tableName - Nome da tabela
 * @returns {Promise<Object>} Schema da tabela
 */
async function getTableSchema(tableName) {
    try {
        const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET);
        const table = dataset.table(tableName);
        const [metadata] = await table.getMetadata();

        return {
            tableName: tableName,
            fields: metadata.schema.fields.map(field => ({
                name: field.name,
                type: field.type,
                mode: field.mode,
                description: field.description || ''
            }))
        };
    } catch (error) {
        console.error(`Erro ao obter schema da tabela ${tableName}:`, error);
        throw new Error(`Não foi possível obter informações da tabela ${tableName}`);
    }
}

/**
 * Lista todas as tabelas do dataset
 * @returns {Promise<Array>} Lista de nomes de tabelas
 */
async function listTables() {
    try {
        const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET);
        const [tables] = await dataset.getTables();

        return tables.map(table => table.id);
    } catch (error) {
        console.error('Erro ao listar tabelas:', error);
        throw new Error('Não foi possível listar as tabelas do dataset');
    }
}

/**
 * Obtém o schema completo do dataset (todas as tabelas)
 * @returns {Promise<Object>} Schema completo com todas as tabelas
 */
async function getDatasetSchema() {
    try {
        const tableNames = await listTables();
        const schemas = {};

        for (const tableName of tableNames) {
            try {
                schemas[tableName] = await getTableSchema(tableName);
            } catch (error) {
                console.warn(`Pulando tabela ${tableName}:`, error.message);
            }
        }

        return {
            dataset: process.env.BIGQUERY_DATASET,
            project: process.env.GCP_PROJECT_ID,
            tables: schemas
        };
    } catch (error) {
        console.error('Erro ao obter schema do dataset:', error);
        throw new Error('Não foi possível obter o schema do dataset');
    }
}

/**
 * Testa a conexão com o BigQuery
 * @returns {Promise<boolean>} True se a conexão está OK
 */
async function testConnection() {
    try {
        if (!bigquery || !credentialsConfigured) {
            throw new Error('BigQuery não está configurado. Verifique se GOOGLE_CREDENTIALS está definido nas variáveis de ambiente do Render.');
        }

        const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET);
        const [exists] = await dataset.exists();

        if (!exists) {
            throw new Error(`Dataset ${process.env.BIGQUERY_DATASET} não encontrado`);
        }

        console.log('✅ Conexão com BigQuery OK');
        return true;
    } catch (error) {
        console.error('❌ Erro na conexão com BigQuery:', error.message);
        throw error;
    }
}

module.exports = {
    executeQuery,
    validateQuery,
    getTableSchema,
    listTables,
    getDatasetSchema,
    testConnection
};
