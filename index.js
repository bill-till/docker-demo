const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('pg');
const redis = require('redis');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const REDIS_PASSWORD = fs.readFileSync('/secrets/REDIS_PASSWORD', 'utf8').trim();
const POSTGRES_PASSWORD = fs.readFileSync('/secrets/POSTGRES_PASSWORD', 'utf8').trim();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/secrets-info', (req, res) => {
  res.json({
    postgres: {
      host: 'postgres',
      database: 'chatapp',
      user: 'chatuser',
      password_preview: POSTGRES_PASSWORD.substring(0, 4) + '****',
      password_full: POSTGRES_PASSWORD,
      password_length: POSTGRES_PASSWORD.length,
      source: 'Azure Key Vault: bt-azure-vault-1',
      secret_name: 'chat-app-postgres-password',
      loaded_at: new Date().toISOString()
    },
    redis: {
      host: 'redis',
      port: 6379,
      password_preview: REDIS_PASSWORD.substring(0, 4) + '****',
      password_full: REDIS_PASSWORD,
      password_length: REDIS_PASSWORD.length,
      source: 'Azure Key Vault: bt-azure-vault-1',
      secret_name: 'chat-app-redis-password',
      loaded_at: new Date().toISOString()
    },
    pod: {
      hostname: require('os').hostname(),
      started_at: new Date().toISOString()
    }
  });
});

const redisSub = redis.createClient({ url: `redis://:${REDIS_PASSWORD}@redis:6379` });
const redisPub = redis.createClient({ url: `redis://:${REDIS_PASSWORD}@redis:6379` });

let pgClient = null;
let ready = false;

async function connectPostgres(maxRetries = 10, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    const client = new Client({
      host: 'postgres',
      port: 5432,
      database: 'chatapp',
      user: 'chatuser',
      password: POSTGRES_PASSWORD,
    });
    try {
      await client.connect();
      console.log('Connected to Postgres');
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      console.log(`Postgres attempt ${i + 1}/${maxRetries} failed: ${err.message}`);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Could not connect to Postgres after retries');
}

async function init() {
  pgClient = await connectPostgres();
  await redisSub.connect();
  await redisPub.connect();

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await redisSub.subscribe('chat', (message) => {
    io.emit('message', JSON.parse(message));
  });

  ready = true;
  console.log('Connected to Postgres and Redis');
  console.log(`Postgres password preview: ${POSTGRES_PASSWORD.substring(0, 4)}****`);
  console.log(`Redis password preview: ${REDIS_PASSWORD.substring(0, 4)}****`);
}

init().catch(console.error);

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  if (!ready) {
    socket.emit('history', []);
    return;
  }

  try {
    const result = await pgClient.query(
      'SELECT username, message, created_at FROM messages ORDER BY created_at DESC LIMIT 20'
    );
    socket.emit('history', result.rows.reverse());
  } catch (err) {
    console.error('Error fetching history:', err);
  }

  socket.on('message', async (data) => {
    if (!ready) return;
    try {
      await pgClient.query(
        'INSERT INTO messages (username, message) VALUES ($1, $2)',
        [data.username, data.message]
      );
      await redisPub.publish('chat', JSON.stringify(data));
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
