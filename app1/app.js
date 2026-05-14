const express = require('express');
const redis = require('redis');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

// Redis Client Setup
const redisClient = redis.createClient({
  host: 'redis',  // Service name defined in Docker
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
    // Reconnect after a delay
    return Math.min(options.attempt * 100, 3000);
  }
});

// Redis Event Listeners (Error Handling)
redisClient.on('error', (err) => {
  console.error('Redis Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis successfully');
});

// App Middleware and Settings
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Main Route - Display Feedback Form
app.get('/', async (req, res) => {
  try {
    // Increment page visits by 1
    await new Promise((resolve, reject) => {
      redisClient.incr('page_visits', (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });

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
        else resolve(reply || 0);
      });
    });

    // Render data to the template
    res.render('message-form', { 
      messageCount: messageCount,
      visitCount: visitCount
    });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).send('Error retrieving data from the server');
  }
});

// Submission Route - Add new message
app.post('/submit-message', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Check if all fields are filled
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    // Create message object
    const messageData = JSON.stringify({
      name: name,
      email: email,
      message: message,
      timestamp: new Date().toISOString()
    });

    // Push message to Redis list
    await new Promise((resolve, reject) => {
      redisClient.rpush('messages', messageData, (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });

    // Send success response
    res.json({ 
      success: true, 
      message: 'Message sent successfully!' 
    });
  } catch (err) {
    console.error('Submission error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error saving the message' 
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Group 1 App is running on port ${PORT}`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  redisClient.quit(() => {
    console.log('Redis connection closed');
    process.exit(0);
  });
});