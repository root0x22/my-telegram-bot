// Подключаем необходимые модули
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { format } = require('date-fns');

// Получаем токен из переменной окружения
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Создаем экземпляр бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Папки для файлов
const INPUT_DIR = 'uploads'; // Папка для загруженных файлов
const OUTPUT_DIR = 'outputs'; // Папка для CSV-файлов
const COLUMN_INDEX = 8; // Столбец I (нумерация с 0)

if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Привет! Отправьте мне Excel-файл (.xlsx), и я обработаю его.");
});

// Обработчик загрузки документа
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;

    console.log(`Received file: ${msg.document.file_name}`);
    if (!msg.document.file_name.endsWith('.xlsx')) {
        return bot.sendMessage(chatId, "Пожалуйста, отправьте файл в формате .xlsx");
    }

    const filePath = path.join(INPUT_DIR, msg.document.file_name);
    const fileLink = await bot.getFileLink(fileId);

    console.log(`File link: ${fileLink}`);

    try {
        const response = await fetch(fileLink);
        if (!response.ok) {
            console.log("Error fetching file", response.status);
            return bot.sendMessage(chatId, "Ошибка загрузки файла.");
        }

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        console.log(`File saved to ${filePath}`);
        bot.sendMessage(chatId, "Файл загружен. Обрабатываю...");
        processFile(filePath, chatId, msg.document.file_name); // Важно: вызов после определения функции
    } catch (error) {
        console.error("Error during file processing", error);
        bot.sendMessage(chatId, "Произошла ошибка при обработке файла.");
    }
});

// Функция обработки файла
function processFile(filePath, chatId, originalFileName) {
    console.log(`Processing file: ${filePath}`);
    
    try {
        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        let userId = [];
        let code = [];
        let betAmount = [];
        let step = null;

        // Извлекаем данные из столбцов
        data.forEach(row => {
            userId.push(row['user_id']);
            code.push(row['code']);
            // Проверяем и заполняем соответствующие массивы данными из столбцов
            if (row['aviator_retention_1']) betAmount.push(row['aviator_retention_1']);
            else if (row['aviator_retention_2']) betAmount.push(row['aviator_retention_2']);
            else if (row['aviator_return_1']) betAmount.push(row['aviator_return_1']);
            else if (row['aviator_return_2']) betAmount.push(row['aviator_return_2']);
            // Извлекаем шаг из имени файла (например 1, 2, 3, 4)
            step = originalFileName.match(/(\d)/)[0];
        });

        // Формат даты: деньмесяцгод, например 030325
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');  // Месяцы начинаются с 0
        const year = currentDate.getFullYear().toString().slice(2);  // Получаем последние две цифры года
        const formattedDate = `${day}${month}${year}`;

        // Папка для сохранения файлов (retention)
        const outputFolder = path.join(__dirname, 'retention');
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder);
        }

        // Функция для записи CSV файла
        const saveCsv = (fileName, data) => {
            const sheet = XLSX.utils.json_to_sheet(data);
            const csv = XLSX.utils.sheet_to_csv(sheet);
            fs.writeFileSync(fileName, csv, 'utf8');
            console.log(`Файл сохранен: ${fileName}`);
        };

        // Данные для записи в CSV
        const resultData = userId.map((id, index) => ({
            username: id,
            currency: code[index],  // Сохраняем значение из столбца 'code'
            bet_amount: betAmount[index] || 0  // bet_amount = значение из соответствующего столбца
        }));

        // Первый файл с данными username, currency, bet_amount
        const resultFileName = path.join(outputFolder, `Linear_Retention_${step}_Casino_Aviator_crm.csv`);
        saveCsv(resultFileName, resultData);

        // Второй файл только с user_id
        const userIdData = userId.map(id => ({ user_id: id }));
        const userIdFileName = path.join(outputFolder, `${formattedDate}_Linear_Retention_${step}_Casino_Aviator_crm.csv`);
        saveCsv(userIdFileName, userIdData);

        // Отправка сгенерированных файлов обратно в Telegram
        bot.sendMessage(chatId, "Обработка завершена! Вот ваши файлы.");

        // Отправляем оба файла
        bot.sendDocument(chatId, resultFileName);
        bot.sendDocument(chatId, userIdFileName);

    } catch (error) {
        console.error(`Ошибка при обработке файла ${filePath}:`, error.message);
        bot.sendMessage(chatId, "Произошла ошибка при обработке файла.");
    }
}
