import { spawn } from 'child_process';
import fs from 'fs';

console.log('=== Starting Telegram Bot System ===');

// Проверяем наличие server-new.js
const hasServer = fs.existsSync('./server-new.js');

if (hasServer) {
  console.log('[1/2] Starting web server...');
  const server = spawn('node', ['server-new.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
  
  // Ждём 5 секунд для запуска сервера
  setTimeout(() => {
    console.log('[2/2] Starting Telegram bot...');
    const bot = spawn('node', ['bot-new.js'], {
      stdio: 'inherit',
      shell: true
    });
    
    bot.on('error', (err) => {
      console.error('Bot error:', err);
    });
    
    bot.on('exit', (code) => {
      console.log(`Bot exited with code ${code}`);
      process.exit(code);
    });
    
  }, 5000);
} else {
  console.log('[1/1] Starting Telegram bot (no web server found)...');
  const bot = spawn('node', ['bot-new.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  bot.on('error', (err) => {
    console.error('Bot error:', err);
  });
  
  bot.on('exit', (code) => {
    console.log(`Bot exited with code ${code}`);
    process.exit(code);
  });
}

// Обработка Ctrl+C
process.on('SIGINT', () => {
  console.log('\nStopping services...');
  process.exit(0);
});