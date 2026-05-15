const express = require('express');
const redis = require('redis');

const app = express();
const PORT = 3002;

// Redis Client Setup
const redisClient = redis.createClient({
  host: 'redis', // Docker service name
  port: 6379,
  retryStrategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      return new Error('The server refused the connection to Redis');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined; // Stop retrying
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// Redis Event Listeners
redisClient.on('error', (err) => {
  console.error('Redis Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis successfully');
});

// App Settings
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Ignore favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Render Dashboard
app.get('/', async (req, res) => {
  try {
    // Get total message count
    const messageCount = await new Promise((resolve, reject) => {
      redisClient.llen('messages', (err, reply) => {
        if (err) reject(err);
        else resolve(reply || 0);
      });
    });

    // Get total visit count
    const visitCount = await new Promise((resolve, reject) => {
      redisClient.get('page_visits', (err, reply) => {
        if (err) reject(err);
        else resolve(parseInt(reply) || 0);
      });
    });

    // Get the last 10 messages
    const recentMessages = await new Promise((resolve, reject) => {
      redisClient.lrange('messages', -10, -1, (err, reply) => {
        if (err) reject(err);
        else {
          const parsed = (reply || []).map(msg => JSON.parse(msg));
          resolve(parsed);
        }
      });
    });

    res.render('dashboard', {
      messageCount: messageCount,
      visitCount: visitCount,
      recentMessages: recentMessages
    });
  } catch (err) {
    console.error('Data retrieval error:', err);
    res.status(500).send('Error retrieving data from the server');
  }
});

// API Endpoint for Stats
app.get('/api/stats', async (req, res) => {
  try {
    const messageCount = await new Promise((resolve, reject) => {
      redisClient.llen('messages', (err, reply) => {
        if (err) reject(err);
        else resolve(reply || 0);
      });
    });

    const visitCount = await new Promise((resolve, reject) => {
      redisClient.get('page_visits', (err, reply) => {
        if (err) reject(err);
        else resolve(parseInt(reply) || 0);
      });
    });

    res.json({
      totalMessages: messageCount,
      totalVisits: visitCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving stats from API' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Dashboard App is running on port ${PORT}`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  redisClient.quit(() => {
    console.log('Redis connection closed');
    process.exit(0);
  });
});