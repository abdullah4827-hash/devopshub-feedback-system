const express = require('express');
const redis = require('redis');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

// إعداد عميل Redis
const redisClient = redis.createClient({
  host: 'redis',  // اسم الخدمة في Docker
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// الطريق الرئيسي - عرض نموذج الملاحظات
app.get('/', async (req, res) => {
  try {
    // زيادة عداد الزيارات بمقدار 1
    await new Promise((resolve, reject) => {
      redisClient.incr('page_visits', (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });

    // الحصول على عدد الرسائل الكلي
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
        else resolve(reply || 0);
      });
    });

    // إرسال البيانات إلى القالب
    res.render('message-form', { 
      messageCount: messageCount,
      visitCount: visitCount
    });
  } catch (err) {
    console.error('خطأ:', err);
    res.status(500).send('خطأ في استرجاع البيانات');
  }
});

// طريق الإرسال - إضافة رسالة جديدة
app.post('/submit-message', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // التحقق من أن جميع الحقول مملوءة
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'جميع الحقول مطلوبة' 
      });
    }

    // إنشاء كائن الرسالة
    const messageData = JSON.stringify({
      name: name,
      email: email,
      message: message,
      timestamp: new Date().toISOString()
    });

    // إضافة الرسالة إلى Redis
    await new Promise((resolve, reject) => {
      redisClient.rpush('messages', messageData, (err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });

    // إرسال رد النجاح
    res.json({ 
      success: true, 
      message: 'تم إرسال الرسالة بنجاح!' 
    });
  } catch (err) {
    console.error('خطأ:', err);
    res.status(500).json({ 
      success: false, 
      message: 'خطأ في إرسال الرسالة' 
    });
  }
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`تطبيق المجموعة 1 يعمل على المنفذ ${PORT}`);
});

// إيقاف آمن للتطبيق
process.on('SIGINT', () => {
  redisClient.quit(() => {
    console.log('تم إغلاق اتصال Redis');
    process.exit(0);
  });
});