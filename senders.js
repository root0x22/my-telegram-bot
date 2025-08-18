// senders.js
import fs from 'fs';
import path from 'path';
import { bot } from './bot.js';  // если bot экспортируется из bot.js

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendOneFileWithRetry(chatId, filePath, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const stream = fs.createReadStream(filePath);
    try {
      await bot.sendDocument(
        chatId,
        { source: stream },
        {},
        { filename: path.basename(filePath), contentType: 'text/csv' }
      );
      return;
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
        const delay = Math.min(30000, 1000 * 2 ** (attempt - 1));
        await sleep(delay);
      } else {
        throw e;
      }

      if (attempt === maxRetries) throw e;
    }
  }
}

export async function sendManyFiles(chatId, filePaths) {
  for (const f of filePaths) {
    await sendOneFileWithRetry(chatId, f);
  }
}
