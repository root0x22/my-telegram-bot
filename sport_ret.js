const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const INPUT_DIR = 'retention'; // Папка с входными файлами
const OUTPUT_DIR = 'outputs'; // Папка для сохранения файлов

// Создаем папку для вывода, если она не существует
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Функция для получения текущей даты в формате DDMMYY
function getCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    return `${day}${month}${year}`;
}

// Функция для конвертации и сортировки файлов
function processExcelFile(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    console.log(`Обрабатываю файл: ${fileName}`);  // Добавляем лог

    const match = fileName.match(/Linear_Retention_(\d)_Sport/);
    if (!match) {
        console.error(`Файл ${fileName} не соответствует шаблону`);
        return;
    }

    const step = match[1];
    console.log(`Шаг: ${step}`);  // Добавляем лог

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (sheet.length === 0) {
        console.error(`Файл ${fileName} пустой или не содержит данных`);
        return;
    }

    let sortedData;
    let outputFileName;
    const currentDate = getCurrentDate();

    if (step === '1') {
        console.log('Обрабатываем шаг 1');  // Лог для шага 1
        // Для шага 1: Сортируем только по user_id и оставляем только этот столбец
        sortedData = sheet
            .sort((a, b) => {
                const userIdA = String(a.user_id || '');
                const userIdB = String(b.user_id || '');
                return userIdA.localeCompare(userIdB);
            })
            .map(row => ({ user_id: row.user_id })); // Оставляем только столбец user_id
        outputFileName = `${currentDate}_Linear_Retention_1_Sport_crm.csv`;
        // Преобразуем в CSV
        const csvData = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(sortedData));

        // Сохранение в файл
        try {
            fs.writeFileSync(path.join(OUTPUT_DIR, outputFileName), csvData, 'utf8');
            console.log(`Файл для шага 1 сохранён: ${path.join(OUTPUT_DIR, outputFileName)}`);
        } catch (error) {
            console.error(`Ошибка при сохранении файла для шага 1:`, error);
        }
    } else {
        // Проверка на наличие 10-го столбца (J)
        const columnJ = Object.keys(sheet[0])[9];
        if (!columnJ) {
            console.error(`В файле ${fileName} нет 10-го столбца`);
            return;
        }

        // Сортируем по 10-му столбцу (J)
        sortedData = sheet.sort((a, b) => {
            const valueA = String(a[columnJ] || '');
            const valueB = String(b[columnJ] || '');
            return valueA.localeCompare(valueB);
        });

        // Получаем уникальные значения из столбца J для формирования названия файла
        const uniqueValuesInJ = [...new Set(sortedData.map(row => row[columnJ]))];

        // Для каждого уникального значения в столбце J формируем отдельный файл
        uniqueValuesInJ.forEach(value => {
            outputFileName = `${currentDate}_Linear_Retention_${step}_Sport_group_${value}_crm.csv`;

            // Фильтруем данные по значению в столбце J
            const filteredData = sortedData.filter(row => String(row[columnJ]) === String(value));

            // Оставляем только столбец user_id
            const userIdData = filteredData.map(row => ({ user_id: row.user_id }));

            // Преобразуем в CSV
            const csvData = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(userIdData));

            // Сохранение в файл
            try {
                fs.writeFileSync(path.join(OUTPUT_DIR, outputFileName), csvData, 'utf8');
                console.log(`Файл для шага ${step} сохранён: ${path.join(OUTPUT_DIR, outputFileName)}`);
            } catch (error) {
                console.error(`Ошибка при сохранении файла для шага ${step}:`, error);
            }
        });
    }
}

// Запуск обработки всех файлов в папке retention
fs.readdirSync(INPUT_DIR).forEach(file => {
    console.log(`Найден файл: ${file}`);  // Лог для отображения всех найденных файлов
    if (file.startsWith('tg_Linear_Retention') && file.endsWith('.xlsx')) {
        processExcelFile(path.join(INPUT_DIR, file));
    }
});
