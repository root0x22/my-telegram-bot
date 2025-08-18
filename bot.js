// Подключаем необходимые модули
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format } = require('date-fns');
const fetch = require('node-fetch');
const express = require('express');
const https = require('https');

// ===== ЛОГИ НЕОБРАБОТАННЫХ ОШИБОК =====
process.on('unhandledRejection', (r) => console.error('UNHANDLED REJECTION:', r));
process.on('uncaughtException', (e) => console.error('UNCAUGHT EXCEPTION:', e));

// Получаем токен из переменной окружения
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

// ===== СОЗДАНИЕ БОТА (polling НЕ включаем сразу) =====
const agent = new https.Agent({ keepAlive: true, maxSockets: 5 });
const bot = new TelegramBot(TOKEN, { polling: false, request: { agent } });

// ===== ИНИЦИАЛИЗАЦИЯ: снять webhook и включить polling =====
(async () => {
  try {
    // На всякий случай: остановить polling, если вдруг включён
    try { await bot.stopPolling(); } catch {}

    // Посмотреть текущее состояние webhook (для отладки)
    try {
      const info = await bot.getWebHookInfo();
      console.log('Webhook before delete:', info);
    } catch (e) {
      console.warn('getWebHookInfo failed (not critical):', e?.message || e);
    }

    // Снять webhook и вычистить очередь апдейтов
    await bot.deleteWebHook({ dropPendingUpdates: true });
    console.log('Webhook deleted (dropPendingUpdates: true)');

    // Стартуем polling вручную
    await bot.startPolling({
      // не обязательно, но пусть будет явный таймаут long polling
      params: { timeout: 30 }
    });
    console.log('Bot polling started');
  } catch (e) {
    console.error('Failed to start polling:', e);
  }
})();

// ===== ДИАГНОСТИКА ПОЛЛИНГА =====
bot.on('polling_error', (err) => {
  console.error('error: [polling_error]', JSON.stringify({ code: err.code, message: err.message }));
  // Если снова 409 — почти наверняка второй процесс где-то жив.
  // Код уже снял webhook и запустил polling корректно — значит, останови другой инстанс
  // или смени токен у BotFather.
});

// ===== Папки для файлов =====
const INPUT_DIR = 'uploads'; // Папка для загруженных файлов
const OUTPUT_DIR = 'outputs'; // Папка для CSV-файлов
const COLUMN_INDEX = 8; // Столбец I (нумерация с 0)

if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: 'Файлы казино' }],
        [{ text: 'Файлы авиатор' }],
        [{ text: 'Файлы спорт' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  bot.sendMessage(msg.chat.id, "Привет! Выберите одну из опций:", options);
});

// Обработчик нажатия на кнопки
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (msg.text === 'Файлы казино') {
    bot.sendMessage(chatId, "Отправьте мне Excel-файл (.xlsx), и я обработаю его для казино.");
  } else if (msg.text === 'Файлы авиатор') {
    bot.sendMessage(chatId, "Отправьте мне Excel-файл (.xlsx), и я обработаю его для авиатора.");
  } else if (msg.text === 'Файлы спорт') {
    bot.sendMessage(chatId, "Отправьте мне Excel-файл (.xlsx), и я обработаю его для спорта.");
  }
});

// Обработчик загрузки документа
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;

  console.log(`Received file: ${fileName}`);
  if (!fileName.endsWith('.xlsx')) {
    return bot.sendMessage(chatId, "Пожалуйста, отправьте файл в формате .xlsx");
  }

  const filePath = path.join(INPUT_DIR, fileName);
  const fileLink = await bot.getFileLink(fileId);

  try {
    const response = await fetch(fileLink);
    if (!response.ok) {
      console.log("Error fetching file", response.status);
      return bot.sendMessage(chatId, "Ошибка загрузки файла.");
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));
    console.log(`File saved to ${filePath}`);

    await bot.sendMessage(chatId, "Файл загружен. Обрабатываю...");

    if (fileName.includes('Casino')) {
      await processCasinoFile(filePath, chatId, fileName);
    } else if (fileName.includes('Aviator')) {
      await processAviatorFile(filePath, chatId, fileName);
    } else if (fileName.includes('Sport')) {
      await processSportFile(filePath, chatId, fileName);
    } else {
      await bot.sendMessage(chatId, "Не удалось определить тип файла.");
    }
  } catch (error) {
    console.error("Error during file processing", error);
    await bot.sendMessage(chatId, "Произошла ошибка при обработке файла.");
  }
});

// ====== ФУНКЦИИ ОБРАБОТКИ ======

function toCsvPath(name) { return path.join(OUTPUT_DIR, name); }

// КАЗИНО
async function processCasinoFile(filePath, chatId, originalFileName) {
  console.log(`Processing casino file: ${filePath}`);

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`Read ${jsonData.length} rows from the sheet`);

    const data = jsonData.slice(1);
    const uniqueValues = [...new Set(data.map(row => row[COLUMN_INDEX]).filter(val => val !== undefined))];
    const date = format(new Date(), 'ddMMyy');
    const generatedFiles = [];

    const regex = /Linear_Retention_(\d+)/;
    const match = originalFileName.match(regex);
    let X = '1';
    if (match) X = match[1];

    console.log(`Extracted number X: ${X}`);

    uniqueValues.forEach(value => {
      const filteredData = data.filter(row => row[COLUMN_INDEX] === value);
      const result = filteredData.map(row => [row[0]]);

      if (result.length > 0) {
        const outputFileName = `${date}_Linear_Retention_${X}_Casino_${value}_crm.csv`;
        const csvContent = xlsx.utils.sheet_to_csv(xlsx.utils.aoa_to_sheet([['user_id'], ...result]));
        const outputPath = toCsvPath(outputFileName);

        fs.writeFileSync(outputPath, csvContent, 'utf8');
        generatedFiles.push(outputPath);

        console.log(`File generated: ${outputFileName}`);
      }
    });

    if (generatedFiles.length > 0) {
      // ВНИМАНИЕ: тут всё ещё отправка «как есть» (поштучно подряд).
      // Если хочешь надёжные ретраи/очередь — используй наш модуль senders.js.
      for (const file of generatedFiles) {
        console.log(`Sending file: ${file}`);
        await bot.sendDocument(chatId, file);
      }
      await bot.sendMessage(chatId, "Готово! Вот ваши файлы.");
    } else {
      console.log('No files generated.');
      await bot.sendMessage(chatId, "Нет данных для обработки.");
    }
  } catch (error) {
    console.error("Error processing casino file", error);
    await bot.sendMessage(chatId, "Произошла ошибка при обработке файла казино.");
  }
}

// АВИАТОР
async function processAviatorFile(filePath, chatId, originalFileName) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    const date = format(new Date(), 'ddMMyy');
    const step = originalFileName.match(/(\d+)/)?.[0] || 'X';

    const userIdData = data.map(row => ({ user_id: row['user_id'] }));
    const fullData = data.map(row => ({
      username: row['user_id'],
      currency: row['code'],
      bet_amount: row['aviator_retention_1'] || row['aviator_retention_2'] || row['aviator_return_1'] || row['aviator_return_2'] || 0
    }));

    const outputFileName1 = `${date}_Linear_Retention_${step}_Aviator_crm.csv`;
    const outputFileName2 = `Crm_casino_Regular_LinearRetention${step}_FS_Multi_Aviator_1.csv`;

    const header1 = ['user_id'];
    const header2 = ['username', 'currency', 'bet_amount'];

    fs.writeFileSync(
      toCsvPath(outputFileName1),
      xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(userIdData, { header: header1 })),
      'utf8'
    );

    const worksheet = xlsx.utils.json_to_sheet(fullData, { header: header2 });
    const csvContent = xlsx.utils.sheet_to_csv(worksheet, { FS: ";" });
    fs.writeFileSync(toCsvPath(outputFileName2), csvContent, 'utf8');

    await bot.sendDocument(chatId, toCsvPath(outputFileName1));
    await bot.sendDocument(chatId, toCsvPath(outputFileName2));
    await bot.sendMessage(chatId, "Готово! Вот ваши файлы авиатор.");
  } catch (error) {
    await bot.sendMessage(chatId, "Ошибка обработки файла авиатор.");
  }
}

// СПОРТ
async function processSportFile(filePath, chatId, originalFileName) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  if (sheet.length === 0) {
    await bot.sendMessage(chatId, "Файл пустой или не содержит данных.");
    return;
  }

  let sortedData;
  let outputFileName;
  const currentDate = format(new Date(), 'ddMMyy');
  const match = originalFileName.match(/Linear_Retention_(\d)_Sport/);
  if (!match) {
    await bot.sendMessage(chatId, "Файл не соответствует ожидаемому формату.");
    return;
  }

  const step = match[1];

  if (step === '1') {
    sortedData = sheet
      .sort((a, b) => String(a.user_id || '').localeCompare(String(b.user_id || '')))
      .map(row => ({ user_id: row.user_id }));

    outputFileName = `${currentDate}_Linear_Retention_1_Sport_crm.csv`;

    const csvData = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(sortedData));
    try {
      const out = toCsvPath(outputFileName);
      fs.writeFileSync(out, csvData, 'utf8');
      await bot.sendDocument(chatId, out);
    } catch (error) {
      await bot.sendMessage(chatId, `Ошибка при сохранении файла для шага 1: ${error.message}`);
    }
  } else {
    const columnJ = Object.keys(sheet[0])[9];
    if (!columnJ) {
      await bot.sendMessage(chatId, `В файле нет 10-го столбца.`);
      return;
    }

    sortedData = sheet.sort((a, b) => String(a[columnJ] || '').localeCompare(String(b[columnJ] || '')));
    const uniqueValuesInJ = [...new Set(sortedData.map(row => row[columnJ]))];

    for (const value of uniqueValuesInJ) {
      outputFileName = `${currentDate}_Linear_Retention_${step}_Sport_group_${value}_crm.csv`;
      const filteredData = sortedData.filter(row => String(row[columnJ]) === String(value));
      const userIdData = filteredData.map(row => ({ user_id: row.user_id }));

      const csvData = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(userIdData));
      try {
        const out = toCsvPath(outputFileName);
        fs.writeFileSync(out, csvData, 'utf8');
        await bot.sendDocument(chatId, out);
      } catch (error) {
        await bot.sendMessage(chatId, `Ошибка при сохранении файла для шага ${step}: ${error.message}`);
      }
    }
  }
}

// ===== EXPRESS (хелсчек) =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', async (_, res) => {
  try {
    const info = await bot.getWebHookInfo();
    res.send(`Bot is running. Webhook: ${info?.url || 'none'}`);
  } catch {
    res.send('Bot is running.');
  }
});
app.listen(PORT, () => console.log(`Server is listening on ${PORT}`));
