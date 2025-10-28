const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:3000', // React app URL
  credentials: true
}));

// Proxy middleware for Shopee API
const shopeeProxy = createProxyMiddleware({
  target: 'https://shopee.vn',
  changeOrigin: true,
  pathRewrite: {
    '^/api/shopee': '', // remove /api/shopee from the path
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add required headers
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    proxyReq.setHeader('Accept', '*/*');
    proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.5');
    proxyReq.setHeader('X-Shopee-Language', 'en');
    proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
    proxyReq.setHeader('X-API-SOURCE', 'pc');
    proxyReq.setHeader('Pragma', 'no-cache');
    proxyReq.setHeader('Cache-Control', 'no-cache');
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
});

// Use the proxy for Shopee API calls
app.use('/api/shopee', shopeeProxy);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Proxy server is running' });
});

app.listen(PORT, () => {
  console.log(`CORS Proxy server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Shopee API proxy: http://localhost:${PORT}/api/shopee/api/v2/item/get?itemid=123&shopid=456`);
});