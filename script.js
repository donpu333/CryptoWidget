// Конфигурация API
const API_CONFIG = {
    RECONNECT_INTERVAL: 5000,
    TIMEOUT: 10000,
    MAX_RETRIES: 3,
    ENDPOINTS: {
        TEST: 'https://api.binance.com/api/v3/ping',
        FUTURES: 'https://fapi.binance.com',
        SPOT: 'https://api.binance.com'
    },
    PRICE_COMPARISON_EPSILON: 0.00000001 // Точность сравнения цен
};

// Конфигурация Telegram - ваш токен бота
const TG_BOT_TOKEN = '8044055704:AAGk8cQFayPqYCscLlEB3qGRj0Uw_NTpe30';

// Кэш для популярных тикеров
const popularTickers = {
    'BTCUSDT': { name: 'Bitcoin', type: 'spot' },
    'ETHUSDT': { name: 'Ethereum', type: 'spot' },
    'BNBUSDT': { name: 'Binance Coin', type: 'spot' },
    'SOLUSDT': { name: 'Solana', type: 'spot' },
    'XRPUSDT': { name: 'Ripple', type: 'spot' },
    'ADAUSDT': { name: 'Cardano', type: 'spot' },
    'DOGEUSDT': { name: 'Dogecoin', type: 'spot' },
    'DOTUSDT': { name: 'Polkadot', type: 'spot' },
    'SHIBUSDT': { name: 'Shiba Inu', type: 'spot' },
    'MATICUSDT': { name: 'Polygon', type: 'spot' },
    'BTCUSDT.P': { name: 'Bitcoin Futures', type: 'futures' },
    'ETHUSDT.P': { name: 'Ethereum Futures', type: 'futures' },
    'SOLUSDT.P': { name: 'Solana Futures', type: 'futures' },
    'XRPUSDT.P': { name: 'Ripple Futures', type: 'futures' },
    'ADAUSDT.P': { name: 'Cardano Futures', type: 'futures' },
    'LINKUSDT': { name: 'Chainlink', type: 'spot' },
    'AVAXUSDT': { name: 'Avalanche', type: 'spot' },
    'LTCUSDT': { name: 'Litecoin', type: 'spot' },
    'ATOMUSDT': { name: 'Cosmos', type: 'spot' },
    'UNIUSDT': { name: 'Uniswap', type: 'spot' },
    'LINKUSDT.P': { name: 'Chainlink Futures', type: 'futures' },
    'AVAXUSDT.P': { name: 'Avalanche Futures', type: 'futures' },
    'LTCUSDT.P': { name: 'Litecoin Futures', type: 'futures' },
    'ATOMUSDT.P': { name: 'Cosmos Futures', type: 'futures' },
    'UNIUSDT.P': { name: 'Uniswap Futures', type: 'futures' }
};

// Переменные для модальных окон
const priceModal = document.getElementById('priceModal');
const modalTicker = document.getElementById('modalTicker');
const priceInput = document.getElementById('priceInput');
const changeInput = document.getElementById('changeInput');
let currentTicker = '';
let currentListType = '';
let allFutures = [];
let allSpot = [];
let userAlerts = [];
let currentAlertFilter = 'active';
let alertCooldowns = {};
let apiManager;
let activeTriggeredAlerts = {};
let currentPrices = {}; // Добавлено: кэш текущих цен

// Функция для копирования текста
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Успех', `Тикер ${text} скопирован в буфер`);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showNotification('Ошибка', 'Не удалось скопировать тикер');
    });
}

// Функции для работы с пользователями
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function handleRegister() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword')?.value;
    
    // Валидация полей
    if (!email || !password || !confirmPassword) {
        showNotification('Ошибка', 'Все поля обязательны для заполнения');
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Ошибка', 'Введите корректный email');
        return;
    }
    
    if (password.length < 8) {
        showNotification('Ошибка', 'Пароль должен содержать минимум 8 символов');
        return;
    }
    
    if (password !== confirmPassword) {
        showNotification('Ошибка', 'Пароли не совпадают');
        return;
    }
    
    // Проверяем, есть ли уже такой пользователь
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userExists = users.some(user => user.email === email);
    
    if (userExists) {
        showNotification('Ошибка', 'Пользователь с таким email уже зарегистрирован');
        return;
    }
    
    // Создаем нового пользователя
    const newUser = {
        email: email,
        password: btoa(password), // Простое шифрование (не безопасно для продакшена!)
        createdAt: new Date().toISOString(),
        alerts: []
    };
    
    // Сохраняем пользователя
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('currentUser', JSON.stringify({ email: email }));
    
    showNotification('Успех', 'Регистрация прошла успешно!');
    closeRegisterModal();
    
    // Обновляем интерфейс для зарегистрированного пользователя
    updateUserUI(email);
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showNotification('Ошибка', 'Введите email и пароль');
        return;
    }
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.email === email && atob(u.password) === password);
    
    if (!user) {
        showNotification('Ошибка', 'Неверный email или пароль');
        return;
    }
    
    localStorage.setItem('currentUser', JSON.stringify({ email: email }));
    showNotification('Успех', 'Вход выполнен успешно!');
    closeLoginModal();
    updateUserUI(email);
}

function handleLogout() {
    localStorage.removeItem('currentUser');
    showNotification('Успех', 'Вы успешно вышли из системы');
    updateUserUI(null);
    toggleMenu();
}

function updateUserUI(email) {
    const userProfileBtn = document.getElementById('userProfileBtn');
    const userName = document.getElementById('userName');
    const loginMenuItem = document.getElementById('loginMenuItem');
    const registerMenuItem = document.getElementById('registerMenuItem');
    const logoutMenuItem = document.getElementById('logoutMenuItem');
    
    if (email) {
        // Пользователь авторизован
        if (userProfileBtn) userProfileBtn.classList.remove('hidden');
        if (userName) userName.textContent = email.split('@')[0];
        if (loginMenuItem) loginMenuItem.classList.add('hidden');
        if (registerMenuItem) registerMenuItem.classList.add('hidden');
        if (logoutMenuItem) logoutMenuItem.classList.remove('hidden');
    } else {
        // Гость
        if (userProfileBtn) userProfileBtn.classList.add('hidden');
        if (loginMenuItem) loginMenuItem.classList.remove('hidden');
        if (registerMenuItem) registerMenuItem.classList.remove('hidden');
        if (logoutMenuItem) logoutMenuItem.classList.add('hidden');
    }
}

// Функция для сохранения сработавшего алерта в историю
function saveTriggeredAlert(alert) {
    const history = JSON.parse(localStorage.getItem('triggeredAlertsHistory') || '[]');
    history.push({
        ...alert,
        triggeredAt: new Date().toISOString()
    });
    localStorage.setItem('triggeredAlertsHistory', JSON.stringify(history));
}

// Функция для загрузки истории сработавших алертов
function loadTriggeredAlerts() {
    return JSON.parse(localStorage.getItem('triggeredAlertsHistory') || '[]');
}

// Сохраняем состояние приложения
function saveAppState() {
    try {
        // Сохраняем алерты
        localStorage.setItem('cryptoAlerts', JSON.stringify(userAlerts));
        // Сохраняем текущий фильтр
        localStorage.setItem('alertFilter', currentAlertFilter);
        // Сохраняем настройки Telegram
        const telegramCheckbox = document.getElementById('telegram');
        const tgSettings = {
            chatId: localStorage.getItem('tg_chat_id'),
            enabled: telegramCheckbox ? telegramCheckbox.checked : false
        };
        localStorage.setItem('tgSettings', JSON.stringify(tgSettings));
        console.log("Состояние сохранено");
        return true;
    } catch (error) {
        console.error("Ошибка при сохранении состояния:", error);
        return false;
    }
}

// Загружаем состояние приложения
function loadAppState() {
    try {
        // Загружаем алерты
        const savedAlerts = localStorage.getItem('cryptoAlerts');
        if (savedAlerts) {
            userAlerts = JSON.parse(savedAlerts);
        }
        
        // Загружаем фильтр
        const savedFilter = localStorage.getItem('alertFilter');
        if (savedFilter) {
            currentAlertFilter = savedFilter;
        }
        
        // Загружаем настройки Telegram
        const tgSettings = JSON.parse(localStorage.getItem('tgSettings') || '{}');
        if (tgSettings.chatId) {
            localStorage.setItem('tg_chat_id', tgSettings.chatId);
            const userChatId = document.getElementById('userChatId');
            if (userChatId) {
                userChatId.value = tgSettings.chatId;
                userChatId.classList.remove('hidden');
            }
        }
        
        if (tgSettings.enabled !== undefined) {
            const telegramCheckbox = document.getElementById('telegram');
            if (telegramCheckbox) {
                telegramCheckbox.checked = tgSettings.enabled;
            }
        }
        
        console.log("Состояние загружено");
        return true;
    } catch (error) {
        console.error("Ошибка при загрузке состояния:", error);
        return false;
    }
}

// Добавлено: Функция для обновления текущих цен
async function updateCurrentPrices() {
    try {
        const activeAlerts = userAlerts.filter(a => !a.triggered);
        const uniqueSymbols = [...new Set(activeAlerts.map(a => a.symbol))];
        
        for (const symbol of uniqueSymbols) {
            const marketType = getMarketTypeBySymbol(symbol);
            if (marketType) {
                const price = await apiManager.getCurrentPrice(symbol, marketType);
                if (price !== null) {
                    currentPrices[symbol] = price;
                    updateAlertPriceDisplay(symbol, price);
                }
            }
        }
    } catch (error) {
        console.error('Error updating current prices:', error);
    }
}

// Добавлено: Функция для обновления отображения цены в алертах
function updateAlertPriceDisplay(symbol, price) {
    const alertElements = document.querySelectorAll(`.alert-card[data-symbol="${symbol}"]`);
    alertElements.forEach(el => {
        const priceElement = el.querySelector('.current-price-value');
        if (priceElement) {
            priceElement.textContent = price;
            
            // Добавляем сравнение с целевой ценой
            const alertId = el.id.split('-')[1];
            const alert = userAlerts.find(a => a.id == alertId);
            if (alert) {
                const isAboveTarget = price > alert.value;
                priceElement.className = `current-price-value ${isAboveTarget ? 'price-up' : 'price-down'}`;
            }
        }
    });
}

class BinanceAPIManager {
    constructor() {
        this.connectionState = {
            connected: false,
            lastCheck: null,
            retries: 0,
            error: null
        };
    }
    
    async init() {
        await this.checkAPIConnection();
        this.startHealthCheck();
    }
    
    async checkAPIConnection() {
        try {
            const response = await this._fetchWithTimeout(
                API_CONFIG.ENDPOINTS.TEST,
                { method: 'GET' }
            );
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            this._updateConnectionState({
                connected: true,
                retries: 0,
                error: null
            });
            return true;
        } catch (error) {
            this._handleConnectionError(error);
            return false;
        }
    }
    
    async _fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    _updateConnectionState(stateUpdate) {
        this.connectionState = {
            ...this.connectionState,
            ...stateUpdate,
            lastCheck: new Date().toISOString()
        };
        this._updateUIStatus();
    }
    
    _handleConnectionError(error) {
        const newRetries = this.connectionState.retries + 1;
        const fatal = newRetries >= API_CONFIG.MAX_RETRIES;
        
        this._updateConnectionState({
            connected: false,
            retries: newRetries,
            error: fatal ? 'Fatal connection error' : error.message
        });
        
        if (!fatal) {
            setTimeout(() => this.checkAPIConnection(), API_CONFIG.RECONNECT_INTERVAL);
        }
    }
    
    startHealthCheck() {
        setInterval(() => {
            if (!this.connectionState.connected) {
                this.checkAPIConnection();
            }
        }, 30000);
    }
    
    _updateUIStatus() {
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        const dotElement = statusElement.querySelector('.status-dot');
        const textElement = statusElement.querySelector('span');
        
        if (!dotElement || !textElement) return;
        
        if (this.connectionState.connected) {
            statusElement.classList.add('connected');
            statusElement.classList.remove('error');
            dotElement.classList.add('status-connected');
            dotElement.classList.remove('status-error');
            textElement.textContent = `Connected to Binance (${new Date(this.connectionState.lastCheck).toLocaleTimeString()})`;
        } else {
            statusElement.classList.add('error');
            statusElement.classList.remove('connected');
            dotElement.classList.add('status-error');
            dotElement.classList.remove('status-connected');
            textElement.textContent = `Connection error: ${this.connectionState.error || 'Unknown error'} [Retry ${this.connectionState.retries}/${API_CONFIG.MAX_RETRIES}]`;
        }
    }
    
    async getCurrentPrice(symbol, marketType) {
        try {
            const endpoint = marketType === 'futures'
                ? `${API_CONFIG.ENDPOINTS.FUTURES}/fapi/v1/ticker/price?symbol=${symbol}`
                : `${API_CONFIG.ENDPOINTS.SPOT}/api/v3/ticker/price?symbol=${symbol}`;
            
            const response = await this._fetchWithTimeout(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            // Валидация ответа API
            if (!data || typeof data.price !== 'string') {
                console.error('Invalid price data:', data);
                return null;
            }
            
            const price = parseFloat(data.price);
            return isNaN(price) ? null : price;
        } catch (error) {
            console.error(`Error getting price for ${symbol}:`, error);
            return null;
        }
    }
}

// Улучшенная функция сравнения цен
function comparePrices(currentPrice, condition, targetPrice) {
    const epsilon = API_CONFIG.PRICE_COMPARISON_EPSILON;
    // Форматируем числа для точного сравнения
    const cp = parseFloat(currentPrice.toFixed(8));
    const tp = parseFloat(targetPrice.toFixed(8));
    
    if (condition === '>') {
        return cp - tp > epsilon;
    } else if (condition === '<') {
        return tp - cp > epsilon;
    }
    return false;
}

async function checkAlerts() {
    const now = Date.now();
    for (const alert of userAlerts.filter(a => !a.triggered)) {
        try {
            // Всегда получаем свежую цену, без кеширования
            const price = await apiManager.getCurrentPrice(alert.symbol, alert.marketType);
            if (price === null) continue;
            
            // Безопасное сравнение цен
            const conditionMet = comparePrices(price, alert.condition, alert.value);
            
            if (conditionMet) {
                const cooldownKey = `${alert.symbol}_${alert.condition}_${alert.value}`;
                const lastNotification = alertCooldowns[cooldownKey] || 0;
                
                if (now - lastNotification > 60000) { // 60 секунд кд
                    // Логируем детали срабатывания для отладки
                    console.log(`Alert triggered: ${alert.symbol} ${alert.condition} ${alert.value} | Current: ${price} | Time: ${new Date().toISOString()}`);
                    
                    // Отправка уведомлений и обработка срабатывания
                    await handleTriggeredAlert(alert, price);
                    alertCooldowns[cooldownKey] = now;
                    activeTriggeredAlerts[alert.id] = true;
                    
                    // Обновляем интерфейс с подсветкой сработавшего алерта
                    highlightTriggeredAlert(alert.id, alert.condition);
                    
                    if (alert.notificationCount > 0 && alert.triggeredCount >= alert.notificationCount) {
                        alert.triggered = true;
                        console.log(`Alert ${alert.id} reached notification limit`);
                    }
                    
                    saveTriggeredAlert(alert);
                    saveAppState();
                    loadUserAlerts(currentAlertFilter);
                }
            }
        } catch (error) {
            console.error(`Error checking alert ${alert.id}:`, error);
        }
    }
}

// Функция для подсветки сработавшего алерта
function highlightTriggeredAlert(alertId, condition) {
    const alertElement = document.getElementById(`alert-${alertId}`);
    if (!alertElement) return;
    
    // Добавляем класс для анимации в зависимости от типа алерта
    if (condition === '>') {
        alertElement.classList.add('alert-triggered-long');
    } else {
        alertElement.classList.add('alert-triggered-short');
    }
    
    // Перемещаем алерт в начало списка
    const container = alertElement.parentElement;
    if (container) {
        container.insertBefore(alertElement, container.firstChild);
    }
    
    // Через 5 секунд убираем анимацию
    setTimeout(() => {
        alertElement.classList.remove('alert-triggered-long', 'alert-triggered-short');
    }, 5000);
}

// Новая функция для обработки сработавшего алерта
async function handleTriggeredAlert(alert, currentPrice) {
    const message = `🚨 Алерт сработал!\nСимвол: ${alert.symbol}\n` +
        `Условие: ${alert.condition} ${alert.value}\n` +
        `Текущая цена: ${formatNumber(currentPrice, 8)}`;
    
    // Отправка в Telegram
    if (alert.notificationMethods.includes('telegram') && alert.chatId) {
        try {
            await sendTelegramNotification(message, alert.chatId);
            alert.triggeredCount = (alert.triggeredCount || 0) + 1;
        } catch (error) {
            console.error('Failed to send Telegram alert:', error);
        }
    }
    
    // Показываем уведомление в интерфейсе
    showNotification('Алерт сработал',
        `Символ: ${alert.symbol}\n` +
        `Условие: ${alert.condition} ${alert.value}\n` +
        `Текущая цена: ${formatNumber(currentPrice, 8)}`);
}

// Функция для форматирования чисел
function formatNumber(num, decimals) {
    return parseFloat(num.toFixed(decimals));
}

// Функция для отправки уведомлений в Telegram
async function sendTelegramNotification(message, chatId) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        
        const data = await response.json();
        if (!data.ok) {
            console.error('Ошибка отправки в Telegram:', data);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        return false;
    }
}

// Функция для экспорта всех активных алертов в Telegram
async function exportAllActiveAlerts() {
    const chatId = localStorage.getItem('tg_chat_id');
    if (!chatId) {
        showBotConnectionHint();
        return;
    }
    
    const activeAlerts = userAlerts.filter(alert => !alert.triggered);
    if (activeAlerts.length === 0) {
        showNotification('Ошибка', 'Нет активных алертов для экспорта');
        return;
    }
    
    // Формируем сообщение
    let message = '📋 Список активных алертов:\n\n';
    activeAlerts.forEach((alert, index) => {
        message += `${index + 1}. ${alert.symbol} ${alert.condition} ${alert.value}\n`;
        message += `Тип: ${alert.type} | Уведомлений: ${alert.notificationCount === 0 ? '∞' : alert.notificationCount}\n\n`;
    });
    
    try {
        const success = await sendTelegramNotification(message, chatId);
        if (success) {
            showNotification('Успешно', 'Все активные алерты экспортированы в Telegram');
        } else {
            showNotification('Ошибка', 'Не удалось отправить алерты в Telegram');
        }
    } catch (error) {
        console.error('Ошибка при экспорте алертов:', error);
        showNotification('Ошибка', 'Произошла ошибка при экспорте');
    }
}

function applyCurrentPrice() {
    const currentPriceValue = document.getElementById('currentPriceValue');
    if (!currentPriceValue) return;
    
    const priceText = currentPriceValue.textContent;
    const price = parseFloat(priceText);
    
    if (!isNaN(price)) {
        const valueInput = document.getElementById('value');
        if (valueInput) {
            valueInput.value = price;
            hideValidationError('value');
        }
    }
}

function applyCurrentPriceForEdit() {
    const currentPriceValue = document.getElementById('editCurrentPriceValue');
    if (!currentPriceValue) return;
    
    const priceText = currentPriceValue.textContent;
    const price = parseFloat(priceText);
    
    if (!isNaN(price)) {
        const valueInput = document.getElementById('editValue');
        if (valueInput) {
            valueInput.value = price;
            hideValidationError('editValue');
        }
    }
}

function getMarketTypeBySymbol(symbol) {
    const futuresMatch = allFutures.find(c => c.symbol === symbol);
    if (futuresMatch) return 'futures';
    
    const spotMatch = allSpot.find(c => c.symbol === symbol);
    if (spotMatch) return 'spot';
    
    return null;
}

function showValidationError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);
    
    if (!field || !errorElement) return;
    
    field.classList.add('validation-error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function hideValidationError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);
    
    if (!field || !errorElement) return;
    
    field.classList.remove('validation-error');
    errorElement.style.display = 'none';
}

// Проверка на дубликаты алертов
function isDuplicateAlert(symbol, condition, value) {
    return userAlerts.some(alert =>
        !alert.triggered &&
        alert.symbol === symbol &&
        alert.condition === condition &&
        Math.abs(alert.value - parseFloat(value)) < API_CONFIG.PRICE_COMPARISON_EPSILON
    );
}

function validateForm() {
    let isValid = true;
    
    // Проверка подключения к боту если Telegram выбран
    const telegramCheckbox = document.getElementById('telegram');
    if (telegramCheckbox && telegramCheckbox.checked) {
        const chatId = localStorage.getItem('tg_chat_id') || document.getElementById('userChatId')?.value;
        if (!chatId) {
            showBotConnectionHint();
            isValid = false;
        }
    }
    
    // Проверка криптовалюты
    const coinSearch = document.getElementById('coinSearch');
    const symbol = document.getElementById('symbol');
    if (!coinSearch || !symbol || !coinSearch.value.trim() || !symbol.value) {
        showValidationError('coinSearch', 'Пожалуйста, выберите криптовалюту');
        isValid = false;
    } else {
        hideValidationError('coinSearch');
    }
    
    // Проверка значения
    const value = document.getElementById('value');
    if (!value || !value.value.trim()) {
        showValidationError('value', 'Пожалуйста, укажите значение');
        isValid = false;
    } else if (isNaN(parseFloat(value.value))) {
        showValidationError('value', 'Пожалуйста, укажите числовое значение');
        isValid = false;
    } else {
        hideValidationError('value');
    }
    
    // Проверка на дубликаты
    const symbolValue = symbol.value;
    const conditionValue = document.getElementById('condition').value;
    if (symbolValue && conditionValue && value.value && isDuplicateAlert(symbolValue, conditionValue, value.value)) {
        showValidationError('value', 'Такой алерт уже существует');
        isValid = false;
    }
    
    // Валидация Telegram Chat ID
    if (telegramCheckbox && telegramCheckbox.checked) {
        const userChatId = document.getElementById('userChatId');
        if (!userChatId || !userChatId.value.trim()) {
            showValidationError('userChatId', 'Пожалуйста, укажите Telegram Chat ID');
            isValid = false;
        }
    }
    
    // Валидация email
    const emailCheckbox = document.getElementById('email');
    if (emailCheckbox && emailCheckbox.checked) {
        const userEmail = document.getElementById('userEmail');
        if (!userEmail || !userEmail.value.trim()) {
            showValidationError('userEmail', 'Пожалуйста, укажите email');
            isValid = false;
        } else if (!isValidEmail(userEmail.value)) {
            showValidationError('userEmail', 'Неверный формат email');
            isValid = false;
        } else {
            hideValidationError('userEmail');
        }
    }
    
    return isValid;
}

function validateEditForm() {
    let isValid = true;
    
    // Проверка значения
    const value = document.getElementById('editValue');
    if (!value || !value.value.trim()) {
        showValidationError('editValue', 'Пожалуйста, укажите значение');
        isValid = false;
    } else if (isNaN(parseFloat(value.value))) {
        showValidationError('editValue', 'Пожалуйста, укажите числовое значение');
        isValid = false;
    } else {
        hideValidationError('editValue');
    }
    
    return isValid;
}

async function loadMarketData() {
    try {
        // Проверяем соединение перед загрузкой данных
        if (!apiManager.connectionState.connected) {
            const connected = await apiManager.checkAPIConnection();
            if (!connected) {
                throw new Error('No connection to Binance API');
            }
        }
        
        // Загрузка фьючерсных данных
        const futuresResponse = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        if (!futuresResponse.ok) throw new Error(`Futures API error: ${futuresResponse.status}`);
        const futuresData = await futuresResponse.json();
        
        allFutures = futuresData.symbols
            .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
            .map(symbol => ({
                symbol: symbol.symbol,
                baseAsset: symbol.baseAsset,
                quoteAsset: symbol.quoteAsset,
                contractType: symbol.contractType,
                marketType: 'futures'
            }));
        
        // Загрузка спотовых данных
        const spotResponse = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        if (!spotResponse.ok) throw new Error(`Spot API error: ${spotResponse.status}`);
        const spotData = await spotResponse.json();
        
        allSpot = spotData.symbols
            .filter(s => s.quoteAsset === 'USDT' || s.quoteAsset === 'BTC' || s.quoteAsset === 'ETH' || s.quoteAsset === 'BNB')
            .map(symbol => ({
                symbol: symbol.symbol,
                baseAsset: symbol.baseAsset,
                quoteAsset: symbol.quoteAsset,
                marketType: 'spot'
            }));
        
        updateCoinSelect();
    } catch (error) {
        console.error('Error loading market data:', error);
        apiManager._handleConnectionError(error);
    }
}

function showNotification(title, message) {
    const modal = document.getElementById('notificationModal');
    const notificationTitle = document.getElementById('notificationTitle');
    const notificationMessage = document.getElementById('notificationMessage');
    
    if (!modal || !notificationTitle || !notificationMessage) return;
    
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    modal.classList.remove('hidden');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 5000);
}

function updateCoinSelect() {
    const coinSearch = document.getElementById('coinSearch');
    const coinSelect = document.getElementById('symbol');
    
    if (!coinSearch || !coinSelect) return;
    
    const searchTerm = coinSearch.value.toLowerCase();
    const allMarketData = [...allFutures, ...allSpot];
    const filteredCoins = allMarketData.filter(coin =>
        coin.symbol.toLowerCase().includes(searchTerm) ||
        coin.baseAsset.toLowerCase().includes(searchTerm)
    );
    
    const limitedCoins = filteredCoins.slice(0, 100);
    
    coinSelect.innerHTML = limitedCoins.map(coin => {
        const badge = coin.marketType === 'spot'
            ? '<span class="spot-badge">SPOT</span>'
            : '<span class="futures-badge">FUTURES</span>';
        return `<option value="${coin.symbol}" data-market-type="${coin.marketType}">${coin.symbol} ${badge}</option>`;
    }).join('');
    
    if (searchTerm) {
        coinSelect.classList.remove('hidden');
        coinSelect.size = Math.min(limitedCoins.length, 5);
    } else {
        coinSelect.classList.add('hidden');
    }
}

async function createAlertForSymbol(symbol, currentPrice) {
    const coinSearch = document.getElementById('coinSearch');
    const symbolInput = document.getElementById('symbol');
    const valueInput = document.getElementById('value');
    const hint = document.getElementById('marketTypeHint');
    
    if (!coinSearch || !symbolInput || !valueInput || !hint) return;
    
    coinSearch.value = symbol;
    const marketType = getMarketTypeBySymbol(symbol);
    const badge = marketType === 'spot'
        ? '<span class="spot-badge">SPOT</span>'
        : '<span class="futures-badge">FUTURES</span>';
    
    hint.innerHTML = badge;
    symbolInput.value = symbol;
    valueInput.value = currentPrice;
    symbolInput.classList.add('hidden');
    
    // Скрываем ошибки валидации при выборе из списка
    hideValidationError('coinSearch');
    hideValidationError('value');
    
    // Получаем текущую цену и показываем её
    const currentPriceValue = await apiManager.getCurrentPrice(symbol, marketType);
    if (currentPriceValue !== null) {
        const currentPriceContainer = document.getElementById('currentPriceContainer');
        const currentPriceValueElement = document.getElementById('currentPriceValue');
        if (currentPriceContainer && currentPriceValueElement) {
            currentPriceValueElement.textContent = currentPriceValue;
            currentPriceContainer.classList.remove('hidden');
        }
    }
}

async function addUserAlert(symbol, type, condition, value, notificationMethods, notificationCount, chatId) {
    try {
        // Проверяем наличие подключения для Telegram
        if (notificationMethods.includes('telegram')) {
            const savedChatId = localStorage.getItem('tg_chat_id') || chatId;
            if (!savedChatId) {
                showBotConnectionHint();
                return false;
            }
        }
        
        // Проверяем на дубликаты
        if (isDuplicateAlert(symbol, condition, value)) {
            showNotification('Ошибка', 'Такой алерт уже существует');
            return false;
        }
        
        const marketType = getMarketTypeBySymbol(symbol);
        const newAlert = {
            id: Date.now(),
            symbol,
            type,
            condition,
            value: parseFloat(value),
            notificationMethods,
            notificationCount: parseInt(notificationCount),
            chatId: notificationMethods.includes('telegram') ? (localStorage.getItem('tg_chat_id') || chatId) : null,
            triggeredCount: 0,
            createdAt: new Date().toISOString(),
            triggered: false,
            lastNotificationTime: 0,
            marketType
        };
        
        userAlerts.push(newAlert);
        saveAppState();
        
        // Обновляем список алертов сразу после добавления
        loadUserAlerts(currentAlertFilter);
        return true;
    } catch (error) {
        console.error("Ошибка при добавлении алерта:", error);
        showNotification('Ошибка', 'Не удалось создать алерт');
        return false;
    }
}

function loadUserAlerts(filter = 'active') {
    const longAlertsContainer = document.getElementById('longAlerts');
    const shortAlertsContainer = document.getElementById('shortAlerts');
    
    if (!longAlertsContainer || !shortAlertsContainer) return;
    
    currentAlertFilter = filter;
    saveAppState();
    
    document.querySelectorAll('.compact-filter-btn').forEach(btn => {
        btn.classList.remove('bg-blue-900', 'text-blue-300');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });
    
    const activeBtn = document.getElementById(`show${filter.charAt(0).toUpperCase() + filter.slice(1)}Alerts`);
    if (activeBtn) {
        activeBtn.classList.add('bg-blue-900', 'text-blue-300');
        activeBtn.classList.remove('bg-gray-700', 'text-gray-300');
    }
    
    let filteredAlerts = [];
    
    if (filter === 'history') {
        filteredAlerts = loadTriggeredAlerts();
        if (filteredAlerts.length === 0) {
            longAlertsContainer.innerHTML = `
                <div class="text-center text-gray-400 py-4">
                    История срабатываний пуста
                </div>
            `;
            shortAlertsContainer.innerHTML = `
                <div class="text-center text-gray-400 py-4">
                    История срабатываний пуста
                </div>
            `;
            return;
        }
    } else {
        switch(filter) {
            case 'active':
                filteredAlerts = userAlerts.filter(alert => !alert.triggered);
                break;
            case 'triggered':
                filteredAlerts = userAlerts.filter(alert => alert.triggered);
                break;
            case 'all':
                filteredAlerts = [...userAlerts];
                break;
        }
        
        if (filteredAlerts.length === 0) {
            let message = '';
            switch(filter) {
                case 'active':
                    message = 'У вас пока нет активных алертов';
                    break;
                case 'triggered':
                    message = 'У вас пока нет сработавших алертов';
                    break;
                case 'all':
                    message = 'У вас пока нет алертов';
                    break;
            }
            
            longAlertsContainer.innerHTML = `
                <div class="text-center text-gray-400 py-4">
                    ${message}
                </div>
            `;
            shortAlertsContainer.innerHTML = `
                <div class="text-center text-gray-400 py-4">
                    ${message}
                </div>
            `;
            return;
        }
    }
    
    // Сортируем алерты: сначала сработавшие (с анимацией), затем активные
    filteredAlerts.sort((a, b) => {
        // Если один из алертов сработал (имеет анимацию), он должен быть выше
        const aTriggered = activeTriggeredAlerts[a.id] || false;
        const bTriggered = activeTriggeredAlerts[b.id] || false;
        
        if (aTriggered && !bTriggered) return -1;
        if (!aTriggered && bTriggered) return 1;
        
        // Если оба сработали или оба не сработали, сортируем по дате
        const dateA = a.triggeredAt || a.createdAt;
        const dateB = b.triggeredAt || b.createdAt;
        return new Date(dateB) - new Date(dateA);
    });
    
    let longHtml = '';
    let shortHtml = '';
    
    filteredAlerts.forEach(alert => {
        const date = new Date(alert.triggeredAt || alert.createdAt);
        const isTriggered = alert.triggered || filter === 'history';
        const isUp = alert.condition === '>';
        const isHistory = filter === 'history';
        const isActiveTriggered = activeTriggeredAlerts[alert.id] && !isHistory;
        const currentPrice = currentPrices[alert.symbol] || 'Загрузка...';
        
        // Добавлено: Отображение текущей цены
        const priceDisplay = !isHistory ? `
            <div class="current-price-container mt-2">
                <span class="current-price-label">Текущая цена:</span>
                <span class="current-price-value">${currentPrice}</span>
            </div>
        ` : '';
        
        const alertHtml = `
            <div id="alert-${alert.id}" class="alert-card rounded-md p-4 shadow-sm ${isActiveTriggered ? (isUp ? 'alert-triggered-long' : 'alert-triggered-short') : ''}" data-symbol="${alert.symbol}">
                <div class="flex justify-between items-start">
                    <div class="flex items-center">
                        <div class="flex-1">
                            <div class="alert-header">
                                <div>
                                    <div class="flex items-center">
                                        <h3 class="font-medium text-light">${alert.symbol}</h3>
                                        <button onclick="copyToClipboard('${alert.symbol}')" class="copy-btn relative">
                                            <i class="far fa-copy"></i>
                                            <span class="copy-tooltip">Копировать тикер</span>
                                        </button>
                                    </div>
                                    <div class="alert-price">
                                        <span>${alert.condition} ${alert.value}</span>
                                        <i class="fas ${isUp ? 'fa-caret-up price-up' : 'fa-caret-down price-down'} alert-direction"></i>
                                        ${isHistory ? '<span class="history-badge">История</span>' : ''}
                                    </div>
                                </div>
                            </div>
                            <p class="text-sm ${isTriggered ? 'text-accent-green' : 'text-gray-400'}">
                                ${isTriggered ? '✅ Сработал' : '🔄 Активен'} |
                                Тип: ${alert.type} |
                                Уведомлений: ${alert.notificationCount === 0 ? '∞' : alert.notificationCount} |
                                Сработал: ${alert.triggeredCount || 0} раз |
                                ${isHistory ? 'Сработал: ' : 'Создан: '}${date.toLocaleString()}
                            </p>
                            ${priceDisplay}
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        ${!isHistory ? `
                            <button onclick="deleteAlert(${alert.id})" class="text-accent-red hover:text-red-300">
                                <i class="fas fa-times"></i>
                            </button>
                            ${!isTriggered || alert.notificationCount === 0 ? `
                                <button onclick="editAlert(${alert.id})" class="text-primary hover:text-blue-300">
                                    <i class="fas fa-edit"></i>
                                </button>
                            ` : ''}
                        ` : ''}
                        ${isTriggered && !isHistory ? `
                            <button onclick="reactivateAlert(${alert.id})" class="reactivate-btn">
                                <i class="fas fa-redo"></i> Активировать
                            </button>
                        ` : ''}
                        ${!isHistory && !isTriggered ? `
                            <button onclick="exportAlertToTelegram(${alert.id})" class="export-btn">
                                <i class="fab fa-telegram"></i> Экспорт
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="mt-2 flex flex-wrap gap-2">
                    ${alert.notificationMethods.map(method => `
                        <span class="bg-blue-900 text-blue-300 px-2 py-1 rounded-full text-xs">
                            <i class="${method === 'telegram' ? 'fab fa-telegram' : 'fas fa-envelope'} mr-1"></i>${method === 'telegram' ? 'Telegram' : 'Email'}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
        
        if (isUp) {
            longHtml += alertHtml;
        } else {
            shortHtml += alertHtml;
        }
    });
    
    longAlertsContainer.innerHTML = longHtml || `
        <div class="text-center text-gray-400 py-4">
            Нет лонг алертов
        </div>
    `;
    
    shortAlertsContainer.innerHTML = shortHtml || `
        <div class="text-center text-gray-400 py-4">
            Нет шорт алертов
        </div>
    `;
    
    // Обновляем счетчики алертов
    updateAlertsCounter();
}

function updateAlertsCounter() {
    const activeLongAlertsCount = userAlerts.filter(alert => !alert.triggered && alert.condition === '>').length;
    const activeShortAlertsCount = userAlerts.filter(alert => !alert.triggered && alert.condition === '<').length;
    const totalActiveAlertsCount = userAlerts.filter(alert => !alert.triggered).length;
    
    const longAlertsCountElement = document.getElementById('longAlertsCount');
    const shortAlertsCountElement = document.getElementById('shortAlertsCount');
    const totalAlertsCountElement = document.getElementById('totalAlertsCount');
    
    if (longAlertsCountElement) longAlertsCountElement.textContent = activeLongAlertsCount;
    if (shortAlertsCountElement) shortAlertsCountElement.textContent = activeShortAlertsCount;
    if (totalAlertsCountElement) totalAlertsCountElement.textContent = `Всего: ${totalActiveAlertsCount}`;
}

function deleteAlert(alertId) {
    if (confirm('Вы уверены, что хотите удалить этот алерт?')) {
        userAlerts = userAlerts.filter(alert => alert.id !== alertId);
        delete activeTriggeredAlerts[alertId];
        saveAppState();
        loadUserAlerts(currentAlertFilter);
        showNotification('Успешно', 'Алерт удален');
    }
}

function clearAllAlerts() {
    if (confirm('Вы уверены, что хотите удалить все алерты?')) {
        userAlerts = [];
        activeTriggeredAlerts = {};
        saveAppState();
        loadUserAlerts(currentAlertFilter);
        showNotification('Успешно', 'Все алерты удалены');
    }
}

function editAlert(alertId) {
    const alert = userAlerts.find(a => a.id === alertId);
    if (!alert) return;
    openEditModal(alert);
}

function reactivateAlert(alertId) {
    const alert = userAlerts.find(a => a.id === alertId);
    if (!alert) return;
    
    alert.triggered = false;
    alert.triggeredCount = 0;
    delete activeTriggeredAlerts[alertId];
    saveAppState();
    loadUserAlerts(currentAlertFilter);
    showNotification('Успешно', 'Алерт снова активен');
}

async function exportAlertToTelegram(alertId) {
    const alert = userAlerts.find(a => a.id === alertId);
    if (!alert) return;
    
    const chatId = localStorage.getItem('tg_chat_id');
    if (!chatId) {
        showBotConnectionHint();
        return;
    }
    
    const message = `📌 Новый алерт:\nСимвол: ${alert.symbol}\nТип: ${alert.type}\nУсловие: ${alert.condition} ${alert.value}\nУведомлений: ${alert.notificationCount === 0 ? '∞' : alert.notificationCount}`;
    
    const success = await sendTelegramNotification(message, chatId);
    if (success) {
        showNotification('Успешно', 'Алерт экспортирован в Telegram');
    } else {
        showNotification('Ошибка', 'Не удалось отправить алерт в Telegram');
    }
}

function openEditModal(alert) {
    const editModal = document.getElementById('editModal');
    const editFormContent = document.getElementById('editFormContent');
    
    if (!editModal || !editFormContent) return;
    
    // Создаем HTML для формы редактирования
    editFormContent.innerHTML = `
        <form id="editAlertForm" class="space-y-4">
            <input type="hidden" id="editAlertId" value="${alert.id}">
            <div>
                <label class="block text-gray-300 text-sm font-medium mb-2">Криптовалюта</label>
                <input
                    type="text"
                    id="editCoinSearch"
                    value="${alert.symbol}"
                    class="w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                    readonly
                >
                <div id="editMarketTypeHint" class="market-type-hint">
                    ${alert.marketType === 'spot' ? '<span class="spot-badge">SPOT</span>' : '<span class="futures-badge">FUTURES</span>'}
                </div>
            </div>
            <div>
                <label class="block text-gray-300 text-sm font-medium mb-2">Тип алерта</label>
                <select id="editAlertType" class="w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                    <option value="price" ${alert.type === 'price' ? 'selected' : ''}>Цена</option>
                    <option value="liquidation" ${alert.type === 'liquidation' ? 'selected' : ''}>Ликвидации</option>
                    <option value="funding" ${alert.type === 'funding' ? 'selected' : ''}>Фандинг</option>
                    <option value="oi" ${alert.type === 'oi' ? 'selected' : ''}>Открытый интерес</option>
                </select>
            </div>
            <div>
                <label class="block text-gray-300 text-sm font-medium mb-2">Условие</label>
                <div class="flex">
                    <select id="editCondition" class="w-1/3 px-3 py-2 rounded-l-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                        <option value=">" ${alert.condition === '>' ? 'selected' : ''}>+ выше</option>
                        <option value="<" ${alert.condition === '<' ? 'selected' : ''}>- ниже</option>
                    </select>
                    <input
                        type="number"
                        id="editValue"
                        value="${alert.value}"
                        class="w-2/3 px-3 py-2 border-t border-b border-r rounded-r-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                        placeholder="Значение"
                        step="any"
                        required
                    >
                </div>
                <div id="editValueError" class="validation-message">Пожалуйста, укажите значение</div>
                <div id="editCurrentPriceContainer" class="current-price-container">
                    <span class="current-price-label">Текущая цена:</span>
                    <span id="editCurrentPriceValue" class="current-price-value">Загрузка...</span>
                    <button type="button" onclick="applyCurrentPriceForEdit()" class="apply-price-btn" title="Применить текущую цену">
                        <i class="fas fa-sync-alt"></i>
                        <span>Применить</span>
                    </button>
                </div>
            </div>
            <div>
                <label class="block text-gray-300 text-sm font-medium mb-2">Количество уведомлений</label>
                <select id="editNotificationCount" class="w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                    <option value="5" ${alert.notificationCount === 5 ? 'selected' : ''}>5 раз (интервал 60 сек)</option>
                    <option value="1" ${alert.notificationCount === 1 ? 'selected' : ''}>1 раз (интервал 60 сек)</option>
                    <option value="2" ${alert.notificationCount === 2 ? 'selected' : ''}>2 раза (интервал 60 сек)</option>
                    <option value="3" ${alert.notificationCount === 3 ? 'selected' : ''}>3 раза (интервал 60 сек)</option>
                    <option value="4" ${alert.notificationCount === 4 ? 'selected' : ''}>4 раза (интервал 60 сек)</option>
                    <option value="0" ${alert.notificationCount === 0 ? 'selected' : ''}>Пока не отключу (интервал 60 сек)</option>
                </select>
            </div>
            <div>
                <label class="block text-gray-300 text-sm font-medium mb-2">Уведомления</label>
                <div class="notification-methods">
                    <div class="notification-method">
                        <input id="editTelegram" type="checkbox" ${alert.notificationMethods.includes('telegram') ? 'checked' : ''} class="h-4 w-4 focus:ring-primary">
                        <label for="editTelegram" class="ml-2 block text-sm text-gray-300">
                            <i class="fab fa-telegram mr-1 text-blue-400"></i> Telegram
                        </label>
                        <button onclick="openTelegramSettings()" class="ml-2 text-sm text-blue-400 hover:text-blue-300 text-xs px-2 py-1">
                            Настроить
                        </button>
                        <input
                            type="text"
                            id="editUserChatId"
                            placeholder="Ваш Chat ID"
                            class="ml-2 px-2 py-1 text-sm rounded-md ${alert.notificationMethods.includes('telegram') ? '' : 'hidden'}"
                            value="${alert.chatId || ''}"
                        >
                    </div>
                    <div class="notification-method">
                        <input id="editEmail" type="checkbox" ${alert.notificationMethods.includes('email') ? 'checked' : ''} class="h-4 w-4 focus:ring-primary">
                        <label for="editEmail" class="ml-2 block text-sm text-gray-300">
                            <i class="fas fa-envelope mr-1 text-gray-400"></i> Email
                        </label>
                        <input
                            type="email"
                            id="editUserEmail"
                            placeholder="Ваш email"
                            class="ml-2 px-2 py-1 text-sm rounded-md ${alert.notificationMethods.includes('email') ? '' : 'hidden'}"
                            value="${localStorage.getItem('userEmail') || ''}"
                        >
                        <div id="editUserEmailError" class="validation-message">Неверный формат email</div>
                    </div>
                </div>
            </div>
            <button type="submit" class="btn-primary w-full text-white py-2 px-4 rounded-md font-medium mt-4">
                <i class="fas fa-save mr-2"></i>Сохранить изменения
            </button>
        </form>
    `;
    
    // Получаем текущую цену для отображения
    apiManager.getCurrentPrice(alert.symbol, alert.marketType).then(price => {
        if (price !== null) {
            const currentPriceValue = document.getElementById('editCurrentPriceValue');
            if (currentPriceValue) {
                currentPriceValue.textContent = price;
            }
        }
    });
    
    // Назначаем обработчики событий для чекбоксов
    const telegramCheckbox = document.getElementById('editTelegram');
    if (telegramCheckbox) {
        telegramCheckbox.addEventListener('change', function() {
            const userChatId = document.getElementById('editUserChatId');
            if (!userChatId) return;
            
            if (this.checked) {
                userChatId.classList.remove('hidden');
                userChatId.required = true;
                const savedChatId = localStorage.getItem('tg_chat_id');
                if (savedChatId) userChatId.value = savedChatId;
            } else {
                userChatId.classList.add('hidden');
                userChatId.required = false;
            }
        });
    }
    
    const emailCheckbox = document.getElementById('editEmail');
    if (emailCheckbox) {
        emailCheckbox.addEventListener('change', function() {
            const userEmail = document.getElementById('editUserEmail');
            if (!userEmail) return;
            
            if (this.checked) {
                userEmail.classList.remove('hidden');
                userEmail.required = true;
                const savedEmail = localStorage.getItem('userEmail');
                if (savedEmail) userEmail.value = savedEmail;
            } else {
                userEmail.classList.add('hidden');
                userEmail.required = false;
            }
        });
    }
    
    // Назначаем обработчик отправки формы
    const editForm = document.getElementById('editAlertForm');
    if (editForm) {
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleEditSubmit(alert.id);
        });
    }
    
    // Отображаем модальное окно
    editModal.classList.add('active');
}

function handleEditSubmit(alertId) {
    if (!validateEditForm()) return;
    
    const symbol = document.getElementById('editCoinSearch')?.value;
    const type = document.getElementById('editAlertType')?.value;
    const condition = document.getElementById('editCondition')?.value;
    const value = document.getElementById('editValue')?.value;
    const useTelegram = document.getElementById('editTelegram')?.checked;
    const useEmail = document.getElementById('editEmail')?.checked;
    const userEmail = useEmail ? document.getElementById('editUserEmail')?.value : '';
    const userChatId = useTelegram ? document.getElementById('editUserChatId')?.value : '';
    const notificationCount = document.getElementById('editNotificationCount')?.value;
    
    if (!symbol || !type || !condition || !value || notificationCount === undefined) {
        showNotification('Ошибка', 'Не все обязательные поля заполнены');
        return;
    }
    
    if (useTelegram && !userChatId && !localStorage.getItem('tg_chat_id')) {
        showNotification('Ошибка', 'Пожалуйста, укажите Telegram Chat ID');
        return;
    }
    
    if (useEmail && !userEmail) {
        showNotification('Ошибка', 'Пожалуйста, укажите email');
        return;
    }
    
    const notificationMethods = [];
    if (useTelegram) notificationMethods.push('telegram');
    if (useEmail) notificationMethods.push('email');
    
    if (notificationMethods.length === 0) {
        showNotification('Ошибка', 'Выберите хотя бы один метод уведомления');
        return;
    }
    
    // Обновляем алерт
    const updatedAlert = {
        id: parseInt(alertId),
        symbol,
        type,
        condition,
        value: parseFloat(value),
        notificationMethods,
        notificationCount: parseInt(notificationCount),
        chatId: useTelegram ? (localStorage.getItem('tg_chat_id') || userChatId) : null,
        triggeredCount: userAlerts.find(a => a.id === parseInt(alertId))?.triggeredCount || 0,
        createdAt: userAlerts.find(a => a.id === parseInt(alertId))?.createdAt || new Date().toISOString(),
        triggered: false,
        lastNotificationTime: 0,
        marketType: getMarketTypeBySymbol(symbol)
    };
    
    // Обновляем массив алертов
    userAlerts = userAlerts.map(a => a.id === parseInt(alertId) ? updatedAlert : a);
    saveAppState();
    
    if (useEmail) {
        localStorage.setItem('userEmail', userEmail);
    }
    
    // Обновляем интерфейс
    loadUserAlerts(currentAlertFilter);
    showNotification('Успешно', `Алерт для ${symbol} обновлен`);
    
    // Закрываем модальное окно
    closeEditModal();
}

function closeEditModal() {
    const editModal = document.getElementById('editModal');
    const editFormContent = document.getElementById('editFormContent');
    
    if (editModal) editModal.classList.remove('active');
    if (editFormContent) editFormContent.innerHTML = '';
}

// Telegram settings functions
function openTelegramSettings() {
    const modal = document.getElementById('telegramSettingsModal');
    const chatIdInput = document.getElementById('telegramChatId');
    const savedChatId = localStorage.getItem('tg_chat_id');
    
    if (chatIdInput && savedChatId) {
        chatIdInput.value = savedChatId;
    }
    
    if (modal) {
        modal.classList.add('active');
    }
}

function closeTelegramSettings() {
    const modal = document.getElementById('telegramSettingsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function saveTelegramSettings() {
    const chatIdInput = document.getElementById('telegramChatId');
    const userChatId = document.getElementById('userChatId');
    
    if (chatIdInput && userChatId) {
        const chatId = chatIdInput.value.trim();
        if (chatId) {
            try {
                // Сохраняем chat_id в localStorage
                localStorage.setItem('tg_chat_id', chatId);
                localStorage.setItem('tg_enabled', 'true');
                userChatId.value = chatId;
                saveAppState();
                closeTelegramSettings();
                closeBotConnectionHint();
                showNotification('Успех', 'Бот успешно подключен! Теперь вы можете создавать алерты с Telegram уведомлениями.');
            } catch (error) {
                console.error('Ошибка:', error);
                showNotification('Ошибка', 'Не удалось сохранить настройки');
            }
        } else {
            showNotification('Ошибка', 'Пожалуйста, укажите Chat ID');
        }
    }
}

// Bot connection hint functions
function showBotConnectionHint() {
    const modal = document.getElementById('botConnectionHint');
    if (modal) modal.classList.add('active');
}

function closeBotConnectionHint() {
    const modal = document.getElementById('botConnectionHint');
    if (modal) modal.classList.remove('active');
}

// Menu functions
function toggleMenu() {
    const menuContent = document.getElementById('menuContent');
    if (menuContent) {
        menuContent.classList.toggle('show');
    }
}

function showCalculator() {
    toggleMenu();
    // Перенаправляем на страницу калькулятора
    window.location.href = 'calculator.html';
}

function showAlerts() {
    toggleMenu();
    // Перенаправляем на страницу алертов
    window.location.href = 'alerts.html';
}

function showWidget() {
    toggleMenu();
    // Перенаправляем на страницу виджета
    window.location.href = 'widget.html';
}

function showMainPage() {
    toggleMenu();
    // Перенаправляем на главную страницу
    window.location.href = 'index.html';
}

function showLoginForm() {
    toggleMenu();
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function showRegisterForm() {
    toggleMenu();
    const modal = document.getElementById('registerModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeRegisterModal() {
    const modal = document.getElementById('registerModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function resetForm() {
    const alertForm = document.getElementById('alertForm');
    if (alertForm) {
        alertForm.reset();
        // Дополнительные сбросы
        const coinSearch = document.getElementById('coinSearch');
        if (coinSearch) {
            coinSearch.value = '';
            coinSearch.focus();
        }
        
        const symbolSelect = document.getElementById('symbol');
        if (symbolSelect) {
            symbolSelect.innerHTML = '';
            symbolSelect.classList.add('hidden');
        }
        
        const symbolInput = document.getElementById('symbol');
        if (symbolInput) {
            symbolInput.value = '';
        }
        
        const marketTypeHint = document.getElementById('marketTypeHint');
        if (marketTypeHint) {
            marketTypeHint.innerHTML = '';
        }
        
        const currentPriceContainer = document.getElementById('currentPriceContainer');
        if (currentPriceContainer) {
            currentPriceContainer.classList.add('hidden');
        }
        
        const editAlertId = document.getElementById('editAlertId');
        if (editAlertId) {
            editAlertId.value = '';
        }
        
        const submitBtnText = document.getElementById('submitBtnText');
        if (submitBtnText) {
            submitBtnText.textContent = 'Создать алерт';
        }
        
        // Сбрасываем чекбоксы уведомлений к состоянию по умолчанию
        const telegramCheckbox = document.getElementById('telegram');
        if (telegramCheckbox) {
            telegramCheckbox.checked = true;
        }
        
        const emailCheckbox = document.getElementById('email');
        if (emailCheckbox) {
            emailCheckbox.checked = false;
        }
        
        // Скрываем дополнительные поля и очищаем их
        const userChatIdInput = document.getElementById('userChatId');
        if (userChatIdInput) {
            userChatIdInput.value = '';
            userChatIdInput.classList.add('hidden');
        }
        
        const userEmailInput = document.getElementById('userEmail');
        if (userEmailInput) {
            userEmailInput.value = '';
            userEmailInput.classList.add('hidden');
        }
        
        // Устанавливаем значение по умолчанию для количества уведомлений
        const notificationCountSelect = document.getElementById('notificationCount');
        if (notificationCountSelect) {
            notificationCountSelect.value = '5';
        }
        
        // Очищаем все ошибки валидации
        document.querySelectorAll('.validation-message').forEach(el => {
            el.style.display = 'none';
        });
        document.querySelectorAll('.validation-error').forEach(el => {
            el.classList.remove('validation-error');
        });
    }
}

function setupEventListeners() {
    const coinSearch = document.getElementById('coinSearch');
    if (coinSearch) {
        coinSearch.addEventListener('input', function() {
            updateCoinSelect();
            
            const searchTerm = this.value.toLowerCase();
            if (searchTerm.length >= 2) {
                const marketType = getMarketTypeBySymbol(searchTerm.toUpperCase());
                if (marketType) {
                    const badge = marketType === 'spot'
                        ? '<span class="spot-badge">SPOT</span>'
                        : '<span class="futures-badge">FUTURES</span>';
                    const hint = document.getElementById('marketTypeHint');
                    if (hint) hint.innerHTML = badge;
                } else {
                    const hint = document.getElementById('marketTypeHint');
                    if (hint) hint.innerHTML = '';
                }
            } else {
                const hint = document.getElementById('marketTypeHint');
                if (hint) hint.innerHTML = '';
            }
        });
    }
    
    const symbolSelect = document.getElementById('symbol');
    if (symbolSelect) {
        symbolSelect.addEventListener('change', function() {
            const symbol = this.value;
            const selectedOption = this.options[this.selectedIndex];
            const marketType = selectedOption.getAttribute('data-market-type');
            
            this.classList.add('hidden');
            const coinSearch = document.getElementById('coinSearch');
            if (coinSearch) coinSearch.value = symbol;
            
            const badge = marketType === 'spot'
                ? '<span class="spot-badge">SPOT</span>'
                : '<span class="futures-badge">FUTURES</span>';
            const hint = document.getElementById('marketTypeHint');
            if (hint) hint.innerHTML = badge;
            
            // Скрываем ошибки валидации при выборе из списка
            hideValidationError('coinSearch');
            
            // Получаем текущую цену и показываем её
            apiManager.getCurrentPrice(symbol, marketType).then(price => {
                if (price !== null) {
                    const currentPriceContainer = document.getElementById('currentPriceContainer');
                    const currentPriceValue = document.getElementById('currentPriceValue');
                    if (currentPriceContainer && currentPriceValue) {
                        currentPriceValue.textContent = price;
                        currentPriceContainer.classList.remove('hidden');
                    }
                }
            });
        });
    }
    
    const telegramCheckbox = document.getElementById('telegram');
    if (telegramCheckbox) {
        telegramCheckbox.addEventListener('change', function() {
            const userChatId = document.getElementById('userChatId');
            if (!userChatId) return;
            
            if (this.checked) {
                userChatId.classList.remove('hidden');
                userChatId.required = true;
                const savedChatId = localStorage.getItem('tg_chat_id');
                if (savedChatId) userChatId.value = savedChatId;
            } else {
                userChatId.classList.add('hidden');
                userChatId.required = false;
            }
            
            localStorage.setItem('tg_enabled', this.checked);
            saveAppState();
        });
    }
    
    const emailCheckbox = document.getElementById('email');
    if (emailCheckbox) {
        emailCheckbox.addEventListener('change', function() {
            const userEmail = document.getElementById('userEmail');
            if (!userEmail) return;
            
            if (this.checked) {
                userEmail.classList.remove('hidden');
                userEmail.required = true;
                const savedEmail = localStorage.getItem('userEmail');
                if (savedEmail) userEmail.value = savedEmail;
            } else {
                userEmail.classList.add('hidden');
                userEmail.required = false;
            }
        });
    }
    
    const alertForm = document.getElementById('alertForm');
    if (alertForm) {
        alertForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Добавляем проверку подключения к боту
            const telegramCheckbox = document.getElementById('telegram');
            if (telegramCheckbox && telegramCheckbox.checked && !localStorage.getItem('tg_chat_id')) {
                showBotConnectionHint();
                return;
            }
            
            // Валидация формы
            if (!validateForm()) return;
            
            const symbol = document.getElementById('symbol')?.value;
            const alertType = document.getElementById('alertType')?.value;
            const condition = document.getElementById('condition')?.value;
            const value = document.getElementById('value')?.value;
            const useTelegram = document.getElementById('telegram')?.checked;
            const useEmail = document.getElementById('email')?.checked;
            const userEmail = useEmail ? document.getElementById('userEmail')?.value : '';
            const userChatId = useTelegram ? document.getElementById('userChatId')?.value : '';
            const notificationCount = document.getElementById('notificationCount')?.value;
            
            if (!symbol || !alertType || !condition || !value || notificationCount === undefined) {
                showNotification('Ошибка', 'Не все обязательные поля заполнены');
                return;
            }
            
            if (useTelegram && !userChatId && !localStorage.getItem('tg_chat_id')) {
                showNotification('Ошибка', 'Пожалуйста, укажите Telegram Chat ID');
                return;
            }
            
            if (useEmail && !userEmail) {
                showNotification('Ошибка', 'Пожалуйста, укажите email');
                return;
            }
            
            const notificationMethods = [];
            if (useTelegram) notificationMethods.push('telegram');
            if (useEmail) notificationMethods.push('email');
            
            if (notificationMethods.length === 0) {
                showNotification('Ошибка', 'Выберите хотя бы один метод уведомления');
                return;
            }
            
            const editAlertId = document.getElementById('editAlertId')?.value;
            
            if (editAlertId) {
                // Редактирование существующего алерта
                const updatedAlert = {
                    id: parseInt(editAlertId),
                    symbol,
                    type: alertType,
                    condition,
                    value: parseFloat(value),
                    notificationMethods,
                    notificationCount: parseInt(notificationCount),
                    chatId: useTelegram ? (localStorage.getItem('tg_chat_id') || userChatId) : null,
                    triggeredCount: userAlerts.find(a => a.id === parseInt(editAlertId))?.triggeredCount || 0,
                    createdAt: userAlerts.find(a => a.id === parseInt(editAlertId))?.createdAt || new Date().toISOString(),
                    triggered: false,
                    lastNotificationTime: 0,
                    marketType: getMarketTypeBySymbol(symbol)
                };
                
                userAlerts = userAlerts.map(a => a.id === parseInt(editAlertId) ? updatedAlert : a);
                saveAppState();
                
                if (useEmail) {
                    localStorage.setItem('userEmail', userEmail);
                }
                
                loadUserAlerts(currentAlertFilter);
                showNotification('Успешно', `Алерт для ${symbol} обновлен`);
                resetForm();
            } else {
                // Создание нового алерта
                const success = await addUserAlert(symbol, alertType, condition, value, notificationMethods, notificationCount, userChatId);
                if (success) {
                    showNotification('Успешно', `Алерт для ${symbol} создан`);
                    resetForm();
                    // Обновляем список алертов
                    loadUserAlerts(currentAlertFilter);
                }
            }
        });
    }
    
    const clearAlertsBtn = document.getElementById('clearAlerts');
    if (clearAlertsBtn) {
        clearAlertsBtn.addEventListener('click', clearAllAlerts);
    }
    
    const exportAllAlertsBtn = document.getElementById('exportAllAlerts');
    if (exportAllAlertsBtn) {
        exportAllAlertsBtn.addEventListener('click', exportAllActiveAlerts);
    }
    
    const closeNotificationBtn = document.getElementById('closeNotification');
    if (closeNotificationBtn) {
        closeNotificationBtn.addEventListener('click', function() {
            const notificationModal = document.getElementById('notificationModal');
            if (notificationModal) notificationModal.classList.add('hidden');
        });
    }
    
    // Обработчики для кнопок фильтрации алертов
    const showActiveAlertsBtn = document.getElementById('showActiveAlerts');
    if (showActiveAlertsBtn) {
        showActiveAlertsBtn.addEventListener('click', () => loadUserAlerts('active'));
    }
    
    const showTriggeredAlertsBtn = document.getElementById('showTriggeredAlerts');
    if (showTriggeredAlertsBtn) {
        showTriggeredAlertsBtn.addEventListener('click', () => loadUserAlerts('triggered'));
    }
    
    const showHistoryAlertsBtn = document.getElementById('showHistoryAlerts');
    if (showHistoryAlertsBtn) {
        showHistoryAlertsBtn.addEventListener('click', () => loadUserAlerts('history'));
    }
    
    const showAllAlertsBtn = document.getElementById('showAllAlerts');
    if (showAllAlertsBtn) {
        showAllAlertsBtn.addEventListener('click', () => loadUserAlerts('all'));
    }
    
    // Обработчик для импорта алертов из файла (только фьючерсы)
    const bulkImportFile = document.getElementById('bulkImportFile');
    if (bulkImportFile) {
        bulkImportFile.addEventListener('change', async function(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async function(e) {
                const content = e.target.result;
                const lines = content.split('\n');
                let importedCount = 0;
                let skippedCount = 0;
                
                // Получаем текущие настройки уведомлений
                const useTelegram = document.getElementById('telegram')?.checked || false;
                const useEmail = document.getElementById('email')?.checked || false;
                const userChatId = useTelegram ? (localStorage.getItem('tg_chat_id') || document.getElementById('userChatId')?.value) : null;
                const userEmail = useEmail ? document.getElementById('userEmail')?.value : null;
                const notificationCount = document.getElementById('notificationCount')?.value || '5';
                const alertType = document.getElementById('alertType')?.value || 'price';
                
                const notificationMethods = [];
                if (useTelegram) notificationMethods.push('telegram');
                if (useEmail) notificationMethods.push('email');
                
                if (notificationMethods.length === 0) {
                    showNotification('Ошибка', 'Выберите хотя бы один метод уведомлений перед импортом');
                    return;
                }
                
                // Проверяем подключение к боту если Telegram выбран
                if (notificationMethods.includes('telegram') && !userChatId) {
                    showBotConnectionHint();
                    return;
                }
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;
                    
                    // Исправляем разбор строки
                    const parts = trimmedLine.split(/\s+/);
                    if (parts.length < 3) {
                        skippedCount++;
                        continue;
                    }
                    
                    const symbol = parts[0].toUpperCase();
                    const condition = parts[1] === '+' ? '>' : parts[1] === '-' ? '<' : parts[1];
                    const value = parts[2];
                    
                    if (condition !== '>' && condition !== '<') {
                        skippedCount++;
                        continue;
                    }
                    
                    if (isNaN(parseFloat(value))) {
                        skippedCount++;
                        continue;
                    }
                    
                    // Проверяем что символ является фьючерсным
                    const isFutures = allFutures.some(f => f.symbol === symbol);
                    if (!isFutures) {
                        skippedCount++;
                        continue;
                    }
                    
                    // Добавляем алерт
                    const success = await addUserAlert(
                        symbol,
                        alertType,
                        condition,
                        parseFloat(value),
                        notificationMethods,
                        notificationCount,
                        userChatId
                    );
                    
                    if (success) {
                        importedCount++;
                    } else {
                        skippedCount++;
                    }
                }
                
                showNotification('Импорт завершен',
                    `Успешно импортировано ${importedCount} фьючерсных алертов\n` +
                    `Пропущено: ${skippedCount} (не фьючерсы или ошибки формата)`);
                loadUserAlerts(currentAlertFilter);
                
                // Сбрасываем значение input файла, чтобы можно было загрузить тот же файл снова
                event.target.value = '';
            };
            reader.readAsText(file);
        });
    }
    
    // Обработчик для меню
    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
        menuButton.addEventListener('click', toggleMenu);
    }
    
    // Закрываем меню при клике вне его
    window.addEventListener('click', function(event) {
        const menuContent = document.getElementById('menuContent');
        const menuButton = document.getElementById('menuButton');
        
        if (menuContent && menuButton &&
            !menuContent.contains(event.target) &&
            !menuButton.contains(event.target)) {
            menuContent.classList.remove('show');
        }
    });
    
    // Обработчики для вкладок шорт и лонг алертов
    const showLongAlertsBtn = document.getElementById('showLongAlerts');
    if (showLongAlertsBtn) {
        showLongAlertsBtn.addEventListener('click', () => {
            document.getElementById('longAlerts').classList.add('active');
            document.getElementById('shortAlerts').classList.remove('active');
            showLongAlertsBtn.classList.add('bg-blue-900', 'text-blue-300');
            showLongAlertsBtn.classList.remove('bg-gray-700', 'text-gray-300');
            document.getElementById('showShortAlerts').classList.add('bg-gray-700', 'text-gray-300');
            document.getElementById('showShortAlerts').classList.remove('bg-blue-900', 'text-blue-300');
        });
    }
    
    const showShortAlertsBtn = document.getElementById('showShortAlerts');
    if (showShortAlertsBtn) {
        showShortAlertsBtn.addEventListener('click', () => {
            document.getElementById('shortAlerts').classList.add('active');
            document.getElementById('longAlerts').classList.remove('active');
            showShortAlertsBtn.classList.add('bg-blue-900', 'text-blue-300');
            showShortAlertsBtn.classList.remove('bg-gray-700', 'text-gray-300');
            document.getElementById('showLongAlerts').classList.add('bg-gray-700', 'text-gray-300');
            document.getElementById('showLongAlerts').classList.remove('bg-blue-900', 'text-blue-300');
        });
    }
    
    // Обработчик для поисковой строки
    const alertSearch = document.getElementById('alertSearch');
    if (alertSearch) {
        alertSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const alerts = document.querySelectorAll('.alert-card');
            
            alerts.forEach(alert => {
                const symbol = alert.querySelector('.font-medium.text-light').textContent.toLowerCase();
                if (symbol.includes(searchTerm)) {
                    alert.style.display = 'block';
                } else {
                    alert.style.display = 'none';
                }
            });
        });
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    apiManager = new BinanceAPIManager();
    try {
        await apiManager.init();
        loadAppState();
        setupEventListeners();
        await loadMarketData();
        loadUserAlerts(currentAlertFilter);
        
        // Проверяем сохраненный chat_id
        const savedChatId = localStorage.getItem('tg_chat_id');
        if (savedChatId) {
            const userChatId = document.getElementById('userChatId');
            if (userChatId) userChatId.value = savedChatId;
        }
        
        // Проверяем сохраненный email
        const savedEmail = localStorage.getItem('userEmail');
        if (savedEmail) {
            const userEmail = document.getElementById('userEmail');
            if (userEmail) userEmail.value = savedEmail;
        }
        
        // Проверяем авторизацию пользователя
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser && currentUser.email) {
            updateUserUI(currentUser.email);
        }
        
        // Запускаем проверку алертов каждые 2 секунды
        setInterval(checkAlerts, 2000);
        
        // Добавлено: Обновление текущих цен каждые 5 секунд
        setInterval(updateCurrentPrices, 5000);
        updateCurrentPrices(); // Первоначальное обновление
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showNotification('Critical Error', 'Failed to connect to Binance API');
    }
});

// Глобальные функции для вызова из HTML
window.copyToClipboard = copyToClipboard;
window.deleteAlert = deleteAlert;
window.applyCurrentPrice = applyCurrentPrice;
window.applyCurrentPriceForEdit = applyCurrentPriceForEdit;
window.editAlert = editAlert;
window.closeEditModal = closeEditModal;
window.openTelegramSettings = openTelegramSettings;
window.closeTelegramSettings = closeTelegramSettings;
window.saveTelegramSettings = saveTelegramSettings;
window.showBotConnectionHint = showBotConnectionHint;
window.closeBotConnectionHint = closeBotConnectionHint;
window.showCalculator = showCalculator;
window.showAlerts = showAlerts;
window.showWidget = showWidget;
window.showMainPage = showMainPage;
window.showLoginForm = showLoginForm;
window.closeLoginModal = closeLoginModal;
window.showRegisterForm = showRegisterForm;
window.closeRegisterModal = closeRegisterModal;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.toggleMenu = toggleMenu;
window.resetForm = resetForm;
window.reactivateAlert = reactivateAlert;
window.exportAlertToTelegram = exportAlertToTelegram;
window.exportAllActiveAlerts = exportAllActiveAlerts;
