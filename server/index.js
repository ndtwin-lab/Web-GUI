const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.SERVER_PORT || 3001;

// Detect if running in Docker or locally
// In Docker, we can use the service name 'postgres'
// Locally, we need to use 'localhost' and the mapped port (5433)
const isDocker =
  process.env.DB_HOST === 'postgres' ||
  process.env.DOCKER_ENV === 'true' ||
  fs.existsSync('/.dockerenv');

const dbConfig = {
  host: process.env.DB_HOST || (isDocker ? 'postgres' : 'localhost'),
  port: parseInt(process.env.DB_PORT || (isDocker ? '5432' : '5433'), 10),
  database: process.env.DB_NAME || 'ndtdb',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || '1234',
};

console.log('Database configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  environment: isDocker ? 'Docker' : 'Local',
});

// PostgreSQL connection pool
const pool = new Pool(dbConfig);

// CORS configuration
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })
);

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all node positions
app.get('/api/node_positions', async (req, res) => {
  console.log('GET /api/node_positions - Request received');
  try {
    const result = await pool.query(
      'SELECT node_id, x, y, type FROM node_positions ORDER BY node_id'
    );

    console.log(
      `GET /api/node_positions - Returning ${result.rows.length} nodes`
    );
    res.json({
      success: true,
      nodes: result.rows.map(row => ({
        node_id: row.node_id,
        x: parseFloat(row.x),
        y: parseFloat(row.y),
        type: row.type,
      })),
    });
  } catch (error) {
    console.error('Error loading node positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load node positions',
      message: error.message,
    });
  }
});

// Save node positions (upsert)
app.post('/api/node_positions', async (req, res) => {
  console.log('POST /api/node_positions - Request received');
  try {
    const { nodes } = req.body;
    console.log(
      `POST /api/node_positions - Saving ${nodes?.length || 0} nodes`
    );

    if (!Array.isArray(nodes)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: nodes must be an array',
      });
    }

    // Use transaction to ensure all or nothing
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const node of nodes) {
        const { node_id, x, y, type } = node;

        if (!node_id || x === undefined || y === undefined) {
          throw new Error(
            `Invalid node data: missing required fields (node_id, x, y)`
          );
        }

        await client.query(
          `INSERT INTO node_positions (node_id, x, y, type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (node_id) 
           DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, type = EXCLUDED.type, last_updated = CURRENT_TIMESTAMP`,
          [node_id, parseFloat(x), parseFloat(y), type || null]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Successfully saved ${nodes.length} node positions`,
        count: nodes.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving node positions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save node positions',
      message: error.message,
    });
  }
});

// Test database connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Node positions API server running on port ${port}`);
  console.log(`Listening on 0.0.0.0:${port}`);
  console.log(
    `Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
  );
  console.log(`Environment: ${isDocker ? 'Docker' : 'Local Development'}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});
