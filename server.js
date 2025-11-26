require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const chatRoutes = require('./routes/chat');

const app = express();
// Corrige erro de proxy no Render para express-rate-limit
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Desabilitar para permitir inline scripts do Tailwind CDN
}));

// CORS configuration
app.use(cors());

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minuto
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20, // 20 requisições por minuto
    message: 'Muitas requisições deste IP, por favor tente novamente em alguns instantes.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Aplicar rate limiting apenas nas rotas da API
app.use('/api/', limiter);

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Servir arquivos estáticos da raiz (para compatibilidade com arquivos existentes)
app.use(express.static(__dirname));

// Routes
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Rota padrão para servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Erro interno do servidor',
            status: err.status || 500
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: {
            message: 'Rota não encontrada',
            status: 404
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Acesse: http://localhost:${PORT}`);
});

module.exports = app;
