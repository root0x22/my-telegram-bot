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
                [{ text: 'Файлы авиатор' }],
                [{ text: 'Файлы спорт' }] // Добавляем кнопку "Файлы спорт"
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
        bot.sendMessage(chatId, "Файл загружен. Обрабатываю...");
        if (fileName.includes('Casino')) {
            processCasinoFile(filePath, chatId, fileName);
        } else if (fileName.includes('Aviator')) {
            processAviatorFile(filePath, chatId, fileName);
        } else if (fileName.includes('Sport')) { // Добавляем обработку для Спорта
            processSportFile(filePath, chatId, fileName);
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
        const outputFileName2 = `Crm_casino_Regular_LinearRetention${step}_FS_Multi_Aviator_1.csv`;

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

// Функция обработки файлов спорт
function processSportFile(filePath, chatId, originalFileName) {
    const INPUT_DIR = 'retention'; // Папка с входными файлами
    const OUTPUT_DIR = 'outputs'; // Папка для сохранения файлов

    // Создаем папку для вывода, если она не существует
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (sheet.length === 0) {
        bot.sendMessage(chatId, "Файл пустой или не содержит данных.");
        return;
    }

    let sortedData;
    let outputFileName;
    const currentDate = format(new Date(), 'ddMMyy');
    const match = originalFileName.match(/Linear_Retention_(\d)_Sport/);
    if (!match) {
        bot.sendMessage(chatId, "Файл не соответствует ожидаемому формату.");
        return;
    }

    const step = match[1];

    if (step === '1') {
        // Обрабатываем шаг 1
        sortedData = sheet
            .sort((a, b) => {
                const userIdA = String(a.user_id || '');
                const userIdB = String(b.user_id || '');
                return userIdA.localeCompare(userIdB);
            })
            .map(row => ({ user_id: row.user_id }));

        outputFileName = `${currentDate}_Linear_Retention_1_Sport_crm.csv`;

        const csvData = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(sortedData));
        try {
            fs.writeFileSync(path.join(OUTPUT_DIR, outputFileName), csvData, 'utf8');
            bot.sendDocument(chatId, path.join(OUTPUT_DIR, outputFileName));
        } catch (error) {
            bot.sendMessage(chatId, `Ошибка при сохранении файла для шага 1: ${error.message}`);
        }
    } else {
        // Проверка на наличие 10-го столбца (J)
        const columnJ = Object.keys(sheet[0])[9];
        if (!columnJ) {
            bot.sendMessage(chatId, `В файле нет 10-го столбца.`);
            return;
        }

        sortedData = sheet.sort((a, b) => {
            const valueA = String(a[columnJ] || '');
            const valueB = String(b[columnJ] || '');
            return valueA.localeCompare(valueB);
        });

        const uniqueValuesInJ = [...new Set(sortedData.map(row => row[columnJ]))];

        uniqueValuesInJ.forEach(value => {
            outputFileName = `${currentDate}_Linear_Retention_${step}_Sport_group_${value}_crm.csv`;

            const filteredData = sortedData.filter(row => String(row[columnJ]) === String(value));
            const userIdData = filteredData.map(row => ({ user_id: row.user_id }));

            const csvData = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(userIdData));
            try {
                fs.writeFileSync(path.join(OUTPUT_DIR, outputFileName), csvData, 'utf8');
                bot.sendDocument(chatId, path.join(OUTPUT_DIR, outputFileName));
            } catch (error) {
                bot.sendMessage(chatId, `Ошибка при сохранении файла для шага ${step}: ${error.message}`);
            }
        });
    }
}
const express = require('express');
const app     = express();
const PORT    = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('Bot is running'));
app.listen(PORT, () => {
  console.log(`Server is listening on ${PORT}`);
});
