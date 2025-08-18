// senders.js
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function guessContentType(filePath) {
  if (filePath.endsWith('.csv')) return 'text/csv';
  if (filePath.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

/**
 * Отправка одного файла с ретраями и правильным contentType.
 * bot — экземпляр node-telegram-bot-api
 */
async function sendOneFileWithRetry(bot, chatId, filePath, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const stream = fs.createReadStream(filePath); // новый поток на каждую попытку
    try {
      await bot.sendDocument(
        chatId,
        { source: stream },
        {},
        { filename: path.basename(filePath), contentType: guessContentType(filePath) }
      );
      return; // успех
    } catch (e) {
      try { stream.destroy(); } catch {}
      const status = e.response?.statusCode || e.statusCode;
      let body = {};
      try { body = JSON.parse(e.response?.body || '{}'); } catch {}

      const retryAfter = body?.parameters?.retry_after;

      if (status === 429 && retryAfter) {
        await sleep((retryAfter + 1) * 1000);
      } else if (
        ['ETIMEDOUT','ECONNRESET','EAI_AGAIN'].includes(e.code) ||
        (status && status >= 500)
      ) {
        const delay = Math.min(30000, 1000 * 2 ** (attempt - 1)); // 1s,2s,4s...
        await sleep(delay);
      } else {
        throw e; // не ретраим бизнес-ошибки
      }

      if (attempt === maxRetries) throw e;
    }
  }
}

/** Последовательная отправка нескольких файлов */
async function sendManySequential(bot, chatId, filePaths) {
  for (const p of filePaths) {
    await sendOneFileWithRetry(bot, chatId, p);
  }
}

module.exports = { sendOneFileWithRetry, sendManySequential };
