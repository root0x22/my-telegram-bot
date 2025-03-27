// Подключаем необходимые модули
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { format } = require('date-fns');
const fetch = require('node-fetch');

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
    const options = {
        reply_markup: {
            keyboard: [
                [{ text: 'Файлы казино' }],
                [{ text: 'Файлы авиатор' }]
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
        bot.sendMessage(chatId, "Файл загружен. Обрабатываю...");
        if (fileName.includes('Casino')) {
            processCasinoFile(filePath, chatId, fileName);
        } else if (fileName.includes('Aviator')) {
            processAviatorFile(filePath, chatId, fileName);
        } else {
            bot.sendMessage(chatId, "Не удалось определить тип файла.");
        }
    } catch (error) {
        console.error("Error during file processing", error);
        bot.sendMessage(chatId, "Произошла ошибка при обработке файла.");
    }
});

// Функция обработки файлов казино
function processCasinoFile(filePath, chatId, originalFileName) {
    console.log(`Processing casino file: ${filePath}`);

    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        console.log(`Read ${jsonData.length} rows from the sheet`);

        const headers = jsonData[0];
        const data = jsonData.slice(1);
        const uniqueValues = [...new Set(data.map(row => row[COLUMN_INDEX]).filter(val => val !== undefined))];
        const date = format(new Date(), 'ddMMyy');
        const generatedFiles = [];

        const regex = /Linear_Retention_(\d+)/;
        const match = originalFileName.match(regex);

        let X = '1';  // Если не удастся найти цифру, по умолчанию будет "1"
        if (match) {
            X = match[1]; // Извлекаем цифру
        }

        console.log(`Extracted number X: ${X}`);

        uniqueValues.forEach(value => {
            const filteredData = data.filter(row => row[COLUMN_INDEX] === value);
            const result = filteredData.map(row => [row[0]]);

            if (result.length > 0) {
                const outputFileName = `${date}_Linear_Retention_${X}_Casino_${value}_crm.csv`;
                const csvContent = xlsx.utils.sheet_to_csv(xlsx.utils.aoa_to_sheet([['user_id'], ...result]));
                const outputPath = path.join(OUTPUT_DIR, outputFileName);

                fs.writeFileSync(outputPath, csvContent, 'utf8');
                generatedFiles.push(outputPath);

                console.log(`File generated: ${outputFileName}`);
            }
        });

        if (generatedFiles.length > 0) {
            generatedFiles.forEach(file => {
                console.log(`Sending file: ${file}`);
                bot.sendDocument(chatId, file);
            });
            bot.sendMessage(chatId, "Готово! Вот ваши файлы.");
        } else {
            console.log('No files generated.');
            bot.sendMessage(chatId, "Нет данных для обработки.");
        }
    } catch (error) {
        console.error("Error processing casino file", error);
        bot.sendMessage(chatId, "Произошла ошибка при обработке файла казино.");
    }
}

// Функция обработки файлов авиатор (с изменениями)
function processAviatorFile(filePath, chatId, originalFileName) {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        const date = format(new Date(), 'ddMMyy');
        const step = originalFileName.match(/(\d+)/)?.[0] || 'X';

        // Формируем данные для двух файлов
        const userIdData = data.map(row => ({ user_id: row['user_id'] }));
        const fullData = data.map(row => ({
            username: row['user_id'],
            currency: row['code'],
            bet_amount: row['aviator_retention_1'] || row['aviator_retention_2'] || row['aviator_return_1'] || row['aviator_return_2'] || 0
        }));

        // Определяем имена файлов
        const outputFileName1 = `${date}_Linear_Retention_${step}_Aviator_crm.csv`;
        const outputFileName2 = `Linear_Retention_${step}_Aviator_crm.csv`;

        // Создаем заголовки для CSV файлов
        const header1 = ['user_id'];
        const header2 = ['username', 'currency', 'bet_amount'];

        // Сохраняем файл с user_id
        fs.writeFileSync(path.join(OUTPUT_DIR, outputFileName1), xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(userIdData, { header: header1 })), 'utf8');

        // Сохраняем файл с полными данными (username, currency, bet_amount)
        const worksheet = xlsx.utils.json_to_sheet(fullData, { header: header2 });
        const csvContent = xlsx.utils.sheet_to_csv(worksheet, { FS: ";" }); // Разделитель — точка с запятой
        fs.writeFileSync(path.join(OUTPUT_DIR, outputFileName2), csvContent, 'utf8');


        // Отправляем файлы пользователю
        bot.sendDocument(chatId, path.join(OUTPUT_DIR, outputFileName1));
        bot.sendDocument(chatId, path.join(OUTPUT_DIR, outputFileName2));
        bot.sendMessage(chatId, "Готово! Вот ваши файлы авиатор.");
    } catch (error) {
        bot.sendMessage(chatId, "Ошибка обработки файла авиатор.");
    }
}
