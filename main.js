// Конфигурация API
const API_CONFIG = {
    RECONNECT_INTERVAL: 5000,
    TIMEOUT: 10000,
    MAX_RETRIES: 3,
    ENDPOINTS: {
        TEST: 'https://api.binance.com/api/v3/ping',
        FUTURES: 'https://fapi.binance.com',
        SPOT: 'https://api.binance.com',
        HISTORICAL: 'https://api.binance.com/api/v3/klines',
        ALL_TICKERS: 'https://api.binance.com/api/v3/exchangeInfo'
    },
    PRICE_COMPARISON_EPSILON: 0.00000001,
    TREND_ANALYSIS_PERIOD: 14 // Days for trend analysis
};

// Конфигурация Telegram - ваш токен бота
const TG_BOT_TOKEN = '8044055704:AAGk8cQFayPqYCscLlEB3qGRj0Uw_NTpe30';

// Объекты для хранения данных
const tickersData = {
    'long': {},
    'short': {},
    'long-wait': {},
    'short-wait': {}
};

const popularTickers = {
    'BTCUSDT': { name: 'Bitcoin', type: 'spot' },
    'ETHUSDT': { name: 'Ethereum', type: 'spot' },
    'BNBUSDT': { name: 'Binance Coin', type: 'spot' },
    'SOLUSDT': { name: 'Solana', type: 'spot' },
    // ... остальные тикеры из первого файла
};

let allBinanceTickers = {};
let tickersLoaded = false;
let currentTicker = '';
let currentListType = '';
let allFutures = [];
let allSpot = [];
let userAlerts = [];
let currentAlertFilter = 'active';
let alertCooldowns = {};
let apiManager;
let activeTriggeredAlerts = {};
let currentPrices = {};
let tradingViewWidget = null;

// Переменные для модальных окон
const priceModal = document.getElementById('priceModal');
const modalTicker = document.getElementById('modalTicker');
const priceInput = document.getElementById('priceInput');
const changeInput = document.getElementById('changeInput');
const commentModal = document.getElementById('commentModal');
const commentModalTicker = document.getElementById('commentModalTicker');
const commentInput = document.getElementById('commentInput');

class BinanceAPIManager {
    constructor() {
        this.connectionState = {
            connected: false,
            lastCheck: null,
            retries: 0,
            error: null
        };
        this.priceHistoryCache = {};
    }

    // ... все методы класса BinanceAPIManager из обоих файлов ...
    // (инициализация, проверка соединения, работа с API и т.д.)
}

// Общие функции

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showNotification(title, message) {
    const modal = document.getElementById('notificationModal');
    if (modal) {
        const notificationTitle = document.getElementById('notificationTitle');
        const notificationMessage = document.getElementById('notificationMessage');
        
        if (notificationTitle && notificationMessage) {
            notificationTitle.textContent = title;
            notificationMessage.textContent = message;
            modal.classList.remove('hidden');
            
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 5000);
        }
    } else {
        // Fallback notification
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 w-80 rounded-lg shadow-lg border-l-4 border-accent-green';
        notification.style.backgroundColor = '#1E1E1E';
        notification.innerHTML = `
            <div class="p-4">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h3 class="font-medium text-light">${title}</h3>
                        <p class="text-sm text-gray-300 mt-1">${message}</p>
                    </div>
                    <button class="ml-2 text-gray-400 hover:text-gray-300" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Успех', `Тикер ${text} скопирован в буфер`);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showNotification('Ошибка', 'Не удалось скопировать тикер');
    });
}

// Функции для работы с пользователями (аутентификация)
function handleRegister() {
    // ... реализация из первого файла ...
}

function handleLogin() {
    // ... реализация из первого файла ...
}

function handleLogout() {
    // ... реализация из первого файла ...
}

function updateUserUI(email) {
    // ... объединенная реализация ...
}

// Функции для работы с алертами
function saveTriggeredAlert(alert) {
    // ... реализация из первого файла ...
}

function loadTriggeredAlerts() {
    // ... реализация из первого файла ...
}

function saveAppState() {
    // ... объединенная реализация ...
}

function loadAppState() {
    // ... объединенная реализация ...
}

// Функции для работы с тикерами
function initializeSortableLists() {
    // ... реализация из второго файла ...
}

function setupInputHandlers() {
    // ... реализация из второго файла ...
}

function showTickerSuggestions(query, listType) {
    // ... реализация из второго файла ...
}

function loadTickersFromStorage() {
    // ... реализация из второго файла ...
}

function saveTickersToStorage() {
    // ... реализация из второго файла ...
}

// ... все остальные функции из обоих файлов ...

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    apiManager = new BinanceAPIManager();

    try {
        await apiManager.init();

        // Проверяем авторизацию пользователя
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser && currentUser.email) {
            updateUserUI(currentUser.email);
        }

        // Загружаем состояние приложения
        loadAppState();

        // Инициализация для алертов
        await loadMarketData();
        loadUserAlerts(currentAlertFilter);

        // Инициализация для тикеров
        initializeSortableLists();
        setupInputHandlers();
        loadTickersFromStorage();
        updateStats();

        // Запускаем периодические задачи
        setInterval(checkAlerts, 2000);
        setInterval(updateCurrentPrices, 5000);
        setInterval(updateAllPrices, 10000);
        updateCurrentPrices();
        
        // Настройка обработчика для меню
        const menuButton = document.getElementById('menuButton');
        if (menuButton) {
            menuButton.addEventListener('click', toggleMenu);
        }

    } catch (error) {
        console.error('Failed to initialize application:', error);
        showNotification('Critical Error', 'Failed to connect to Binance API');
    }
});

// Глобальные функции для вызова из HTML
window.copyToClipboard = copyToClipboard;
window.deleteAlert = deleteAlert;
window.applyCurrentPrice = applyCurrentPrice;
// ... все остальные глобальные функции ...
