const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// === НАСТРОЙКИ ===
const TOKEN = 'YOUR_BOT_TOKEN_HERE'; // Вставь сюда свой токен от BotFather
const ADMIN_CHAT_ID = 'YOUR_ADMIN_CHAT_ID'; // Укажи Telegram ID владельца

const bot = new TelegramBot(TOKEN, { polling: true });
const bookingsFile = 'bookings.json';
let bookings = fs.existsSync(bookingsFile) ? JSON.parse(fs.readFileSync(bookingsFile)) : [];

// === ФУНКЦИЯ СОХРАНЕНИЯ БРОНИРОВАНИЙ ===
function saveBookings() {
    fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));
}

// === КОМАНДА /start ===
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Привет! Выберите дату для записи:', {
        reply_markup: {
            keyboard: [['12 марта', '13 марта', '14 марта']],
            one_time_keyboard: true,
        },
    });
});

// === ОБРАБОТКА ВЫБОРА ДАТЫ ===
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const availableTimes = ['10:00', '12:00', '14:00'];

    if (['12 марта', '13 марта', '14 марта'].includes(text)) {
        bot.sendMessage(chatId, `Вы выбрали ${text}. Теперь выберите время:`, {
            reply_markup: {
                keyboard: [availableTimes],
                one_time_keyboard: true,
            },
        });
        bot.once('message', (msg) => {
            if (availableTimes.includes(msg.text)) {
                bookings.push({ name: msg.chat.username || msg.chat.first_name, date: text, time: msg.text });
                saveBookings();
                bot.sendMessage(chatId, `Вы записаны на ${text} в ${msg.text}!`);
                bot.sendMessage(ADMIN_CHAT_ID, `📅 Новая запись\nИмя: ${msg.chat.first_name}\nДата: ${text}\nВремя: ${msg.text}`);
            }
        });
    }
});
