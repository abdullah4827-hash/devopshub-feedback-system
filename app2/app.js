const express = require('express');
const redis = require('redis');

const app = express();
const PORT = 3002;

// إعداد عميل Redis
const redisClient = redis.createClient({
  host: 'redis',
  port: 6379,
  retryStrategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      return new Error('فشل الاتصال بـ Redis');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('انتهت محاولات الاتصال');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// معالجات الأخطاء
redisClient.on('error', (err) => {
  console.error('خطأ في Redis:', err);
});

redisClient.on('connect', () => {
  console.log('تم الاتصال بـ Redis بنجاح');
});

// إعدادات التطبيق
app.use(express.static('public'));
app.set('view engine', 'ejs');

// عرض لوحة التحكم
app.get('/', async (req, res) => {
  try {
    // الحصول على عدد الرسائل
    const messageCount = await new Promise((resolve, reject) => {
      redisClient.llen('messages', (err, reply) => {
        if (err) reject(err);
        else resolve(reply || 0);
      });
    });

    // الحصول على عدد الزيارات
    const visitCount = await new Promise((resolve, reject) => {
      redisClient.get('page_visits', (err, reply) => {
        if (err) reject(err);
        else resolve(parseInt(reply) || 0);
      });
    });

    // الحصول على آخر 10 رسائل
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
    console.error('خطأ:', err);
    res.status(500).send('خطأ في استرجاع البيانات');
  }
});

// نقطة نهاية API للحصول على الإحصائيات
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
    res.status(500).json({ error: 'خطأ في استرجاع الإحصائيات' });
  }
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`تطبيق لوحة التحكم يعمل على المنفذ ${PORT}`);
});

// إيقاف آمن
process.on('SIGINT', () => {
  redisClient.quit(() => {
    console.log('تم إغلاق اتصال Redis');
    process.exit(0);
  });
});
