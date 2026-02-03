import readline from 'readline';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");
const { computeCheck } = require("telegram/Password");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiId = 17349;
const apiHash = "344583e45741c457fe1862106095a5eb";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function getAccountInfo(client) {
  try {
    const me = await client.getMe();
    return {
      username: me.username || 'без username',
      id: me.id,
      firstName: me.firstName || '',
      lastName: me.lastName || ''
    };
  } catch (e) {
    return { username: null, id: null, firstName: '', lastName: '' };
  }
}

async function main() {
  console.log('📱 Создание донорской сессии\n');
  
  try {
    const phoneNumber = await question('Введите номер телефона (например, +380989087845): ');
    
    if (!phoneNumber || !phoneNumber.trim()) {
      console.log('❌ Номер телефона не указан!');
      rl.close();
      return;
    }
    
    console.log('\n⏳ Подключаюсь к Telegram...');
    const session = new StringSession("");
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      receiveUpdates: false,
      timeout: 60000,
      requestRetries: 3,
      deviceModel: 'PC',
      systemVersion: 'Windows 11',
      appVersion: '5.5.0',
      langCode: 'en',
      systemLangCode: 'en',
      langPack: 'tdesktop',
    });
    
    await client.connect();
    console.log('✅ Подключено!\n');
    
    console.log('📤 Отправляю код...');
    const result = await client.sendCode(
      {
        apiId: apiId,
        apiHash: apiHash,
      },
      phoneNumber.trim()
    );
    
    console.log('✅ Код отправлен в Telegram!\n');
    
    const code = await question('Введите код из Telegram: ');
    
    if (!code || !code.trim()) {
      console.log('❌ Код не указан!');
      await client.disconnect();
      rl.close();
      return;
    }
    
    console.log('\n⏳ Проверяю код...');
    
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phoneNumber.trim(),
          phoneCodeHash: result.phoneCodeHash,
          phoneCode: code.trim(),
        })
      );
      console.log('✅ Код верный! Авторизация без пароля.\n');
    } catch (error) {
      const errorMsg = String(error.errorMessage || error.message || '').toUpperCase();
      
      if (errorMsg.includes('SESSION_PASSWORD_NEEDED') || errorMsg.includes('PASSWORD')) {
        console.log('🔐 Требуется пароль двухфакторной аутентификации.\n');
        
        const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
        
        const password = await question('Введите пароль: ');
        
        if (!password || !password.trim()) {
          console.log('❌ Пароль не указан!');
          await client.disconnect();
          rl.close();
          return;
        }
        
        console.log('\n⏳ Проверяю пароль...');
        const passwordSrpCheck = await computeCheck(passwordSrpResult, password.trim());
        
        try {
          await client.invoke(new Api.auth.CheckPassword({
            password: passwordSrpCheck,
          }));
          console.log('✅ Пароль верный!\n');
        } catch (pwdError) {
          console.log(`❌ Неверный пароль: ${pwdError.errorMessage || pwdError.message}`);
          await client.disconnect();
          rl.close();
          return;
        }
      } else {
        console.log(`❌ Неверный код: ${error.errorMessage || error.message}`);
        await client.disconnect();
        rl.close();
        return;
      }
    }
    
    console.log('⏳ Получаю информацию об аккаунте...');
    const accountInfo = await getAccountInfo(client);
    
    const sessionString = client.session.save();
    
    const donorFolder = path.join(__dirname, 'donor');
    await fs.mkdir(donorFolder, { recursive: true });
    
    const sessionFileName = `donor_${accountInfo.id || Date.now()}.session`;
    const sessionPath = path.join(donorFolder, sessionFileName);
    
    await fs.writeFile(sessionPath, sessionString, "utf-8");
    
    console.log('\n✅ Сессия успешно создана!');
    console.log(`📁 Файл: ${sessionPath}`);
    console.log(`👤 User: @${accountInfo.username || 'без username'}`);
    console.log(`🆔 ID: ${accountInfo.id}`);
    console.log(`📝 Имя: ${accountInfo.firstName || ''} ${accountInfo.lastName || ''}`.trim());
    
    await client.disconnect();
    rl.close();
    
    console.log('\n✅ Готово! Донорская сессия сохранена.');
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    
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
      
      console.log(`\n⏳ Слишком много попыток. Подождите ${waitTimeText} перед повторной попыткой.`);
    }
    
    rl.close();
    process.exit(1);
  }
}

main();

