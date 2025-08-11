// Основные переменные и константы
const allSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'LTCUSDT'];
const futuresSymbols = ['BTCUSDT_PERP', 'ETHUSDT_PERP', 'BNBUSDT_PERP', 'SOLUSDT_PERP', 'XRPUSDT_PERP', 'ADAUSDT_PERP', 'DOGEUSDT_PERP', 'DOTUSDT_PERP', 'MATICUSDT_PERP', 'LTCUSDT_PERP'];
let alerts = [];
let editAlertId = null;
let currentPrices = {};
let isConnected = false;
let userData = null;
let tickers = {
    'long': [],
    'short': [],
    'long-wait': [],
    'short-wait': []
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initEventListeners();
    loadAlertsFromStorage();
    updateAlertsCount();
    simulateConnection();
    checkAuthStatus();
    initSortable();
    updateTickerCounts();
});

// Инициализация обработчиков событий
function initEventListeners() {
    // Поиск монет
    document.getElementById('coinSearch').addEventListener('input', handleCoinSearch);
    document.getElementById('coinSearch').addEventListener('focus', showSymbolDropdown);
    document.getElementById('coinSearch').addEventListener('blur', hideSymbolDropdown);
    document.getElementById('coinSearch').addEventListener('paste', handlePasteSymbol);
    
    // Форма алерта
    document.getElementById('alertForm').addEventListener('submit', handleAlertFormSubmit);
    
    // Фильтры алертов
    document.getElementById('showActiveAlerts').addEventListener('click', () => filterAlerts('active'));
    document.getElementById('showTriggeredAlerts').addEventListener('click', () => filterAlerts('triggered'));
    document.getElementById('showHistoryAlerts').addEventListener('click', () => filterAlerts('history'));
    document.getElementById('showAllAlerts').addEventListener('click', () => filterAlerts('all'));
    document.getElementById('showLongAlerts').addEventListener('click', () => showTab('long'));
    document.getElementById('showShortAlerts').addEventListener('click', () => showTab('short'));
    
    // Поиск алертов
    document.getElementById('alertSearch').addEventListener('input', searchAlerts);
    
    // Кнопки управления
    document.getElementById('exportAllAlerts').addEventListener('click', exportAllAlerts);
    document.getElementById('clearAlerts').addEventListener('click', clearAllAlerts);
    
    // Уведомления
    document.getElementById('telegram').addEventListener('change', toggleTelegramInput);
    document.getElementById('email').addEventListener('change', toggleEmailInput);
    document.getElementById('closeNotification').addEventListener('click', closeNotification);
    
    // Модальные окна
    document.getElementById('userProfileBtn').addEventListener('click', toggleUserMenu);
    
    // Dashboard
    document.querySelectorAll('.ticker-input').forEach(input => {
        input.addEventListener('input', handleTickerInput);
    });
    
    // Bulk import
    document.getElementById('bulkImportFile').addEventListener('change', handleBulkImport);
}

// Обработка вставки символа
function handlePasteSymbol(e) {
    setTimeout(() => {
        const symbol = e.target.value.toUpperCase().trim();
        const isValid = allSymbols.includes(symbol) || 
                       futuresSymbols.includes(symbol) ||
                       futuresSymbols.includes(symbol + '_PERP');
        
        if (isValid) {
            selectSymbol(symbol);
        } else {
            showError("Тикер не найден");
        }
    }, 100);
}

// Выбор символа
function selectSymbol(symbol) {
    const symbolSelect = document.getElementById('symbol');
    symbolSelect.classList.add('hidden');
    
    document.getElementById('coinSearch').value = symbol;
    
    const isFutures = futuresSymbols.includes(symbol) || 
                     futuresSymbols.includes(symbol.replace('_PERP', ''));
    document.getElementById('marketTypeHint').textContent = 
        isFutures ? 'FUTURES' : 'SPOT';
    
    fetchCurrentPrice(symbol, isFutures);
}

// Поиск монет
function handleCoinSearch(e) {
    const searchValue = e.target.value.toUpperCase();
    const symbolSelect = document.getElementById('symbol');
    
    if (searchValue.length < 2) {
        symbolSelect.classList.add('hidden');
        return;
    }
    
    const filteredSymbols = allSymbols.concat(futuresSymbols)
        .filter(symbol => symbol.includes(searchValue))
        .slice(0, 20);
    
    if (filteredSymbols.length === 0) {
        symbolSelect.classList.add('hidden');
        return;
    }
    
    symbolSelect.innerHTML = filteredSymbols.map(symbol => 
        `<option value="${symbol}">${symbol}</option>`
    ).join('');
    
    symbolSelect.classList.remove('hidden');
}

// Показать dropdown с символами
function showSymbolDropdown() {
    const searchValue = document.getElementById('coinSearch').value.toUpperCase();
    if (searchValue.length >= 2) {
        document.getElementById('symbol').classList.remove('hidden');
    }
}

// Скрыть dropdown с символами
function hideSymbolDropdown() {
    setTimeout(() => {
        document.getElementById('symbol').classList.add('hidden');
    }, 200);
}

// Обработка формы алерта
function handleAlertFormSubmit(e) {
    e.preventDefault();
    
    const symbol = document.getElementById('coinSearch').value.toUpperCase();
    const alertType = document.getElementById('alertType').value;
    const condition = document.getElementById('condition').value;
    const value = parseFloat(document.getElementById('value').value);
    const notificationCount = parseInt(document.getElementById('notificationCount').value);
    const useTelegram = document.getElementById('telegram').checked;
    const useEmail = document.getElementById('email').checked;
    const telegramChatId = document.getElementById('userChatId').value;
    const email = document.getElementById('userEmail').value;
    
    // Валидация
    if (!symbol || !allSymbols.concat(futuresSymbols).includes(symbol)) {
        showError("Пожалуйста, выберите валидный тикер");
        return;
    }
    
    if (isNaN(value)) {
        showError("Пожалуйста, укажите валидное значение");
        return;
    }
    
    if (useTelegram && !telegramChatId) {
        showError("Пожалуйста, укажите Chat ID для Telegram");
        return;
    }
    
    if (useEmail && !validateEmail(email)) {
        showError("Пожалуйста, укажите валидный email");
        return;
    }
    
    // Создание алерта
    const alert = {
        id: editAlertId || Date.now().toString(),
        symbol,
        alertType,
        condition,
        value,
        notificationCount,
        remainingNotifications: notificationCount,
        useTelegram,
        useEmail,
        telegramChatId,
        email,
        isActive: true,
        isTriggered: false,
        createdAt: new Date().toISOString(),
        triggeredAt: null,
        direction: condition === '>' ? 'long' : 'short'
    };
    
    if (editAlertId) {
        // Обновление существующего алерта
        const index = alerts.findIndex(a => a.id === editAlertId);
        if (index !== -1) {
            alerts[index] = alert;
        }
        editAlertId = null;
        document.getElementById('submitBtnText').textContent = 'Создать алерт';
    } else {
        // Добавление нового алерта
        alerts.push(alert);
    }
    
    saveAlertsToStorage();
    renderAlerts();
    resetAlertForm();
    showNotification('Алерт успешно сохранен', 'Ваш алерт был успешно создан/обновлен');
}

// Остальные функции остаются без изменений
// ... (все остальные функции из вашего исходного кода)

// Инициализация SortableJS
function initSortable() {
    new Sortable(document.getElementById('long-list'), {
        group: 'tickers',
        animation: 150,
        onEnd: updateTickerCounts
    });
    
    new Sortable(document.getElementById('short-list'), {
        group: 'tickers',
        animation: 150,
        onEnd: updateTickerCounts
    });
    
    new Sortable(document.getElementById('long-wait-list'), {
        group: 'tickers',
        animation: 150,
        onEnd: updateTickerCounts
    });
    
    new Sortable(document.getElementById('short-wait-list'), {
        group: 'tickers',
        animation: 150,
        onEnd: updateTickerCounts
    });
}

// Dashboard функции
function addTicker(type) {
    const input = document.getElementById(`${type}-input`);
    const ticker = input.value.toUpperCase().trim();
    
    if (!ticker) {
        showTickerError(type, 'Пожалуйста, введите тикер');
        return;
    }
    
    if (!allSymbols.concat(futuresSymbols).includes(ticker)) {
        showTickerError(type, 'Тикер не найден');
        return;
    }
    
    if (tickers[type].includes(ticker)) {
        showTickerError(type, 'Тикер уже добавлен');
        return;
    }
    
    tickers[type].push(ticker);
    saveTickersToStorage();
    renderTicker(type, ticker);
    input.value = '';
    clearTickerError(type);
    updateTickerCounts();
}

// Остальные функции dashboard
// ... (все остальные функции dashboard из вашего исходного кода)

// Сохранение и загрузка данных
function saveAlertsToStorage() {
    localStorage.setItem('cryptoAlerts', JSON.stringify(alerts));
}

function loadAlertsFromStorage() {
    const savedAlerts = localStorage.getItem('cryptoAlerts');
    if (savedAlerts) {
        alerts = JSON.parse(savedAlerts);
        renderAlerts();
    }
}

function saveTickersToStorage() {
    localStorage.setItem('cryptoDashboardTickers', JSON.stringify(tickers));
}

function loadTickersFromStorage() {
    const savedTickers = localStorage.getItem('cryptoDashboardTickers');
    if (savedTickers) {
        tickers = JSON.parse(savedTickers);
        Object.keys(tickers).forEach(type => {
            tickers[type].forEach(ticker => renderTicker(type, ticker));
        });
        updateTickerCounts();
    }
}

// Валидация email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Показать уведомление
function showNotification(title, message) {
    const modal = document.getElementById('notificationModal');
    document.getElementById('notificationTitle').textContent = title;
    document.getElementById('notificationMessage').textContent = message;
    modal.classList.remove('hidden');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 5000);
}

// Закрыть уведомление
function closeNotification() {
    document.getElementById('notificationModal').classList.add('hidden');
}

// Симуляция подключения к Binance
function simulateConnection() {
    setTimeout(() => {
        isConnected = true;
        const status = document.getElementById('connectionStatus');
        status.querySelector('.status-dot').classList.remove('status-connecting');
        status.querySelector('.status-dot').classList.add('status-connected');
        status.querySelector('span').textContent = 'Подключено к Binance';
        
        // Запуск обновления цен
        setInterval(updatePrices, 5000);
    }, 2000);
}

// Обновление цен
function updatePrices() {
    // Симуляция обновления цен
    allSymbols.concat(futuresSymbols).forEach(symbol => {
        const currentPrice = currentPrices[symbol] || 100;
        const change = (Math.random() * 2 - 1) * 0.5;
        currentPrices[symbol] = currentPrice * (1 + change / 100);
    });
    
    checkAlerts();
    updateDashboardPrices();
}

// Проверка срабатывания алертов
function checkAlerts() {
    alerts.forEach(alert => {
        if (!alert.isActive || alert.isTriggered) return;
        
        const currentPrice = currentPrices[alert.symbol] || 0;
        const conditionMet = 
            (alert.condition === '>' && currentPrice > alert.value) ||
            (alert.condition === '<' && currentPrice < alert.value);
        
        if (conditionMet) {
            triggerAlert(alert);
        }
    });
}

// Срабатывание алерта
function triggerAlert(alert) {
    alert.isTriggered = true;
    alert.triggeredAt = new Date().toISOString();
    
    if (alert.remainingNotifications > 0) {
        sendNotification(alert);
        alert.remainingNotifications--;
    }
    
    if (alert.remainingNotifications <= 0) {
        alert.isActive = false;
    }
    
    saveAlertsToStorage();
    renderAlerts();
}

// Отправка уведомления
function sendNotification(alert) {
    const direction = alert.condition === '>' ? 'выше' : 'ниже';
    const title = `Алерт сработал: ${alert.symbol}`;
    const message = `Цена ${alert.symbol} достигла ${alert.value} (${direction})`;
    
    showNotification(title, message);
    
    // Здесь должна быть логика отправки в Telegram/Email
    console.log(`Notification sent: ${title} - ${message}`);
}

// Обновление цен на dashboard
function updateDashboardPrices() {
    Object.keys(tickers).forEach(type => {
        tickers[type].forEach(ticker => {
            const priceElement = document.querySelector(`.ticker-item[data-ticker="${ticker}"] .ticker-price`);
            if (priceElement) {
                const currentPrice = currentPrices[ticker] || 0;
                priceElement.textContent = currentPrice.toFixed(2);
            }
        });
    });
}

// Инициализация аутентификации
function checkAuthStatus() {
    const savedUser = localStorage.getItem('cryptoUser');
    if (savedUser) {
        userData = JSON.parse(savedUser);
        updateAuthUI();
    }
}

// Обновление UI аутентификации
function updateAuthUI() {
    if (userData) {
        document.getElementById('loginMenuItem').classList.add('hidden');
        document.getElementById('registerMenuItem').classList.add('hidden');
        document.getElementById('logoutMenuItem').classList.remove('hidden');
        document.getElementById('userProfileBtn').classList.remove('hidden');
        document.getElementById('userName').textContent = userData.name || userData.email;
    } else {
        document.getElementById('loginMenuItem').classList.remove('hidden');
        document.getElementById('registerMenuItem').classList.remove('hidden');
        document.getElementById('logoutMenuItem').classList.add('hidden');
        document.getElementById('userProfileBtn').classList.add('hidden');
    }
}

// Обработка входа
function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // В реальном приложении здесь была бы проверка на сервере
    userData = { email, name: email.split('@')[0] };
    localStorage.setItem('cryptoUser', JSON.stringify(userData));
    
    updateAuthUI();
    closeLoginModal();
    showNotification('Вход выполнен', `Добро пожаловать, ${userData.name}!`);
}

// Обработка регистрации
function handleRegister() {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (password !== confirmPassword) {
        showError("Пароли не совпадают");
        return;
    }
    
    // В реальном приложении здесь была бы регистрация на сервере
    userData = { email, name: email.split('@')[0] };
    localStorage.setItem('cryptoUser', JSON.stringify(userData));
    
    updateAuthUI();
    closeRegisterModal();
    showNotification('Регистрация завершена', `Добро пожаловать, ${userData.name}!`);
}

// Обработка выхода
function handleLogout() {
    userData = null;
    localStorage.removeItem('cryptoUser');
    updateAuthUI();
    showNotification('Выход выполнен', 'Вы успешно вышли из системы');
}

// Модальные окна
function showLoginForm() {
    document.getElementById('loginModal').classList.add('flex');
    document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginModal').classList.remove('flex');
}

function showRegisterForm() {
    document.getElementById('registerModal').classList.add('flex');
    document.getElementById('registerModal').classList.remove('hidden');
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.add('hidden');
    document.getElementById('registerModal').classList.remove('flex');
}

function openTelegramSettings() {
    document.getElementById('telegramSettingsModal').classList.add('flex');
    document.getElementById('telegramSettingsModal').classList.remove('hidden');
}

function closeTelegramSettings() {
    document.getElementById('telegramSettingsModal').classList.add('hidden');
    document.getElementById('telegramSettingsModal').classList.remove('flex');
}

function saveTelegramSettings() {
    const chatId = document.getElementById('telegramChatId').value;
    if (!chatId) {
        showError("Пожалуйста, введите Chat ID");
        return;
    }
    
    document.getElementById('userChatId').value = chatId;
    closeTelegramSettings();
    showNotification('Настройки сохранены', 'Telegram уведомления активированы');
}

// Включение/выключение полей уведомлений
function toggleTelegramInput() {
    const isChecked = document.getElementById('telegram').checked;
    const chatIdInput = document.getElementById('userChatId');
    
    if (isChecked && !chatIdInput.value) {
        openTelegramSettings();
    }
}

function toggleEmailInput() {
    const isChecked = document.getElementById('email').checked;
    const emailInput = document.getElementById('userEmail');
    
    if (isChecked) {
        emailInput.classList.remove('hidden');
    } else {
        emailInput.classList.add('hidden');
    }
}

// Импорт алертов из файла
function handleBulkImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split('\n');
        let importedCount = 0;
        
        lines.forEach(line => {
            const parts = line.trim().split(' ');
            if (parts.length === 3) {
                const [symbol, condition, value] = parts;
                const formattedSymbol = symbol.toUpperCase() + '_PERP';
                
                if (futuresSymbols.includes(formattedSymbol) && !isNaN(parseFloat(value))) {
                    document.getElementById('coinSearch').value = formattedSymbol;
                    document.getElementById('condition').value = condition;
                    document.getElementById('value').value = parseFloat(value);
                    document.getElementById('alertForm').dispatchEvent(new Event('submit'));
                    importedCount++;
                }
            }
        });
        
        showNotification('Импорт завершен', `Успешно импортировано ${importedCount} алертов`);
    };
    
    reader.readAsText(file);
    e.target.value = ''; // Сброс значения input для возможности повторного выбора того же файла
}

// Экспорт всех алертов
function exportAllAlerts() {
    const activeAlerts = alerts.filter(alert => alert.isActive);
    if (activeAlerts.length === 0) {
        showError("Нет активных алертов для экспорта");
        return;
    }
    
    let exportText = '';
    activeAlerts.forEach(alert => {
        exportText += `${alert.symbol} ${alert.condition} ${alert.value}\n`;
    });
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crypto_alerts_export.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Экспорт завершен', `Экспортировано ${activeAlerts.length} алертов`);
}

// Очистка всех алертов
function clearAllAlerts() {
    if (confirm("Вы уверены, что хотите удалить все алерты?")) {
        alerts = [];
        saveAlertsToStorage();
        renderAlerts();
        showNotification('Алерты очищены', 'Все алерты были удалены');
    }
}

// Фильтрация алертов
function filterAlerts(type) {
    const buttons = ['showActiveAlerts', 'showTriggeredAlerts', 'showHistoryAlerts', 'showAllAlerts'];
    buttons.forEach(btn => {
        const element = document.getElementById(btn);
        if (btn === `show${type.charAt(0).toUpperCase() + type.slice(1)}Alerts`) {
            element.classList.add('bg-blue-900', 'text-blue-300');
            element.classList.remove('bg-gray-700', 'text-gray-300');
        } else {
            element.classList.remove('bg-blue-900', 'text-blue-300');
            element.classList.add('bg-gray-700', 'text-gray-300');
        }
    });
    
    renderAlerts(type);
}

// Поиск алертов
function searchAlerts() {
    const searchTerm = document.getElementById('alertSearch').value.toLowerCase();
    renderAlerts(null, searchTerm);
}

// Показать вкладку
function showTab(tab) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tab}Alerts`).classList.add('active');
    document.getElementById(`show${tab.charAt(0).toUpperCase() + tab.slice(1)}Alerts`).classList.add('active');
}

// Обновление счетчиков алертов
function updateAlertsCount() {
    const longCount = alerts.filter(a => a.direction === 'long' && a.isActive).length;
    const shortCount = alerts.filter(a => a.direction === 'short' && a.isActive).length;
    const totalCount = alerts.filter(a => a.isActive).length;
    
    document.getElementById('longAlertsCount').textContent = longCount;
    document.getElementById('shortAlertsCount').textContent = shortCount;
    document.getElementById('totalAlertsCount').textContent = `Всего: ${totalCount}`;
}

// Обновление счетчиков тикеров
function updateTickerCounts() {
    document.getElementById('total-tickers').textContent = 
        Object.values(tickers).reduce((sum, arr) => sum + arr.length, 0);
    document.getElementById('long-count').textContent = tickers.long.length;
    document.getElementById('short-count').textContent = tickers.short.length;
    document.getElementById('long-wait-count').textContent = tickers['long-wait'].length;
    document.getElementById('short-wait-count').textContent = tickers['short-wait'].length;
}

// Отображение алертов
function renderAlerts(filter = null, searchTerm = '') {
    const longContainer = document.getElementById('longAlerts');
    const shortContainer = document.getElementById('shortAlerts');
    
    longContainer.innerHTML = '';
    shortContainer.innerHTML = '';
    
    let filteredAlerts = [...alerts];
    
    // Применение фильтра
    if (filter === 'active') {
        filteredAlerts = alerts.filter(a => a.isActive && !a.isTriggered);
    } else if (filter === 'triggered') {
        filteredAlerts = alerts.filter(a => a.isTriggered);
    } else if (filter === 'history') {
        filteredAlerts = alerts.filter(a => !a.isActive);
    }
    
    // Применение поиска
    if (searchTerm) {
        filteredAlerts = filteredAlerts.filter(a => 
            a.symbol.toLowerCase().includes(searchTerm) ||
            a.value.toString().includes(searchTerm)
        );
    }
    
    // Группировка по направлению
    const longAlerts = filteredAlerts.filter(a => a.direction === 'long');
    const shortAlerts = filteredAlerts.filter(a => a.direction === 'short');
    
    // Рендеринг лонг алертов
    longAlerts.forEach(alert => {
        longContainer.appendChild(createAlertElement(alert));
    });
    
    // Рендеринг шорт алертов
    shortAlerts.forEach(alert => {
        shortContainer.appendChild(createAlertElement(alert));
    });
    
    updateAlertsCount();
}

// Создание элемента алерта
function createAlertElement(alert) {
    const alertElement = document.createElement('div');
    alertElement.className = `alert-item ${alert.isTriggered ? 'triggered' : ''} ${!alert.isActive ? 'inactive' : ''}`;
    alertElement.dataset.id = alert.id;
    
    const currentPrice = currentPrices[alert.symbol] || 0;
    const priceDiff = alert.condition === '>' ? 
        ((currentPrice - alert.value) / alert.value * 100).toFixed(2) :
        ((alert.value - currentPrice) / alert.value * 100).toFixed(2);
    
    const statusText = alert.isTriggered ? 
        `Сработал ${new Date(alert.triggeredAt).toLocaleString()}` :
        alert.isActive ? 'Активен' : 'Неактивен';
    
    alertElement.innerHTML = `
        <div class="alert-header">
            <span class="alert-symbol">${alert.symbol}</span>
            <span class="alert-status">${statusText}</span>
        </div>
        <div class="alert-body">
            <div class="alert-condition">
                <span>Цена ${alert.condition} ${alert.value}</span>
                <span class="alert-price-diff">${priceDiff}%</span>
            </div>
            <div class="alert-current-price">
                Текущая цена: ${currentPrice.toFixed(2)}
            </div>
            <div class="alert-notifications">
                <span class="alert-notification-count">
                    Уведомлений: ${alert.remainingNotifications}/${alert.notificationCount}
                </span>
                <span class="alert-created">
                    Создан: ${new Date(alert.createdAt).toLocaleString()}
                </span>
            </div>
        </div>
        <div class="alert-actions">
            <button class="alert-action-btn edit" onclick="editAlert('${alert.id}')">
                <i class="fas fa-edit"></i>
            </button>
            <button class="alert-action-btn delete" onclick="deleteAlert('${alert.id}')">
                <i class="fas fa-trash-alt"></i>
            </button>
            <button class="alert-action-btn ${alert.isActive ? 'deactivate' : 'activate'}" 
                onclick="${alert.isActive ? 'deactivateAlert' : 'activateAlert'}('${alert.id}')">
                <i class="fas ${alert.isActive ? 'fa-pause' : 'fa-play'}"></i>
            </button>
        </div>
    `;
    
    return alertElement;
}

// Редактирование алерта
function editAlert(id) {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    
    editAlertId = id;
    
    document.getElementById('coinSearch').value = alert.symbol;
    document.getElementById('alertType').value = alert.alertType;
    document.getElementById('condition').value = alert.condition;
    document.getElementById('value').value = alert.value;
    document.getElementById('notificationCount').value = alert.notificationCount;
    document.getElementById('telegram').checked = alert.useTelegram;
    document.getElementById('email').checked = alert.useEmail;
    document.getElementById('userChatId').value = alert.telegramChatId;
    document.getElementById('userEmail').value = alert.email;
    
    if (alert.useTelegram) {
        document.getElementById('userChatId').classList.remove('hidden');
    }
    
    if (alert.useEmail) {
        document.getElementById('userEmail').classList.remove('hidden');
    }
    
    document.getElementById('submitBtnText').textContent = 'Обновить алерт';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Удаление алерта
function deleteAlert(id) {
    if (confirm("Вы уверены, что хотите удалить этот алерт?")) {
        alerts = alerts.filter(a => a.id !== id);
        saveAlertsToStorage();
        renderAlerts();
        showNotification('Алерт удален', 'Алерт был успешно удален');
    }
}

// Деактивация алерта
function deactivateAlert(id) {
    const alert = alerts.find(a => a.id === id);
    if (alert) {
        alert.isActive = false;
        saveAlertsToStorage();
        renderAlerts();
        showNotification('Алерт деактивирован', 'Алерт был деактивирован');
    }
}

// Активация алерта
function activateAlert(id) {
    const alert = alerts.find(a => a.id === id);
    if (alert) {
        alert.isActive = true;
        saveAlertsToStorage();
        renderAlerts();
        showNotification('Алерт активирован', 'Алерт был активирован');
    }
}

// Сброс формы алерта
function resetAlertForm() {
    document.getElementById('alertForm').reset();
    document.getElementById('userChatId').classList.add('hidden');
    document.getElementById('userEmail').classList.add('hidden');
    document.getElementById('marketTypeHint').textContent = '';
    document.getElementById('currentPriceContainer').classList.add('hidden');
    document.getElementById('symbol').classList.add('hidden');
}

// Получение текущей цены
function fetchCurrentPrice(symbol, isFutures = false) {
    // В реальном приложении здесь был бы запрос к API Binance
    const price = isFutures ? 
        Math.random() * 10000 + 10000 : 
        Math.random() * 50000 + 10000;
    
    currentPrices[symbol] = price;
    
    const currentPriceContainer = document.getElementById('currentPriceContainer');
    currentPriceContainer.classList.remove('hidden');
    document.getElementById('currentPriceValue').textContent = price.toFixed(2);
}

// Применение текущей цены
function applyCurrentPrice() {
    const currentPrice = parseFloat(document.getElementById('currentPriceValue').textContent);
    if (!isNaN(currentPrice)) {
        document.getElementById('value').value = currentPrice.toFixed(2);
    }
}

// Показать ошибку
function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    
    const form = document.getElementById('alertForm');
    form.insertBefore(errorElement, form.firstChild);
    
    setTimeout(() => {
        errorElement.remove();
    }, 3000);
}

// Dashboard функции
function handleTickerInput(e) {
    const type = e.target.id.split('-')[0];
    const value = e.target.value.toUpperCase();
    const suggestions = document.getElementById(`${type}-suggestions`);
    
    if (value.length < 2) {
        suggestions.innerHTML = '';
        suggestions.classList.remove('active');
        return;
    }
    
    const filtered = allSymbols.concat(futuresSymbols)
        .filter(symbol => symbol.includes(value))
        .slice(0, 5);
    
    if (filtered.length === 0) {
        suggestions.innerHTML = '';
        suggestions.classList.remove('active');
        return;
    }
    
    suggestions.innerHTML = filtered.map(symbol => 
        `<div class="suggestion-item" onclick="selectTickerSuggestion('${type}', '${symbol}')">${symbol}</div>`
    ).join('');
    
    suggestions.classList.add('active');
}

function selectTickerSuggestion(type, symbol) {
    document.getElementById(`${type}-input`).value = symbol;
    document.getElementById(`${type}-suggestions`).innerHTML = '';
    document.getElementById(`${type}-suggestions`).classList.remove('active');
}

function showTickerError(type, message) {
    const errorElement = document.getElementById(`${type}-error`);
    errorElement.textContent = message;
    errorElement.classList.add('active');
    
    setTimeout(() => {
        errorElement.classList.remove('active');
    }, 3000);
}

function clearTickerError(type) {
    document.getElementById(`${type}-error`).classList.remove('active');
}

function renderTicker(type, ticker) {
    const list = document.getElementById(`${type}-list`);
    const price = currentPrices[ticker] || Math.random() * 10000 + 10000;
    
    const tickerElement = document.createElement('li');
    tickerElement.className = 'ticker-item';
    tickerElement.dataset.ticker = ticker;
    tickerElement.innerHTML = `
        <div class="ticker-info">
            <span class="ticker-name">${ticker}</span>
            <span class="ticker-price">${price.toFixed(2)}</span>
            <span class="ticker-change">${(Math.random() * 2 - 1).toFixed(2)}%</span>
        </div>
        <div class="ticker-actions">
            <button class="ticker-action-btn edit" onclick="editTickerPrice('${type}', '${ticker}')">
                <i class="fas fa-edit"></i>
            </button>
            <button class="ticker-action-btn chart" onclick="showTickerChart('${ticker}')">
                <i class="fas fa-chart-line"></i>
            </button>
            <button class="ticker-action-btn comment" onclick="addTickerComment('${type}', '${ticker}')">
                <i class="fas fa-comment"></i>
            </button>
            <button class="ticker-action-btn delete" onclick="removeTicker('${type}', '${ticker}')">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;
    
    list.appendChild(tickerElement);
}

function removeTicker(type, ticker) {
    tickers[type] = tickers[type].filter(t => t !== ticker);
    saveTickersToStorage();
    document.querySelector(`.ticker-item[data-ticker="${ticker}"]`).remove();
    updateTickerCounts();
}

function clearAllTickers(type) {
    if (confirm(`Вы уверены, что хотите очистить все тикеры в разделе ${type}?`)) {
        tickers[type] = [];
        saveTickersToStorage();
        document.getElementById(`${type}-list`).innerHTML = '';
        updateTickerCounts();
    }
}

function editTickerPrice(type, ticker) {
    const currentPrice = currentPrices[ticker] || 0;
    document.getElementById('priceInput').value = currentPrice.toFixed(2);
    document.getElementById('changeInput').value = '0.00';
    document.getElementById('modalTicker').textContent = ticker;
    document.getElementById('priceModal').classList.add('flex');
    document.getElementById('priceModal').classList.remove('hidden');
    
    // Сохраняем контекст для использования в confirmManualPrice
    window.currentTickerContext = { type, ticker };
}

function confirmManualPrice() {
    const { type, ticker } = window.currentTickerContext;
    const price = parseFloat(document.getElementById('priceInput').value);
    const change = parseFloat(document.getElementById('changeInput').value);
    
    if (!isNaN(price)) {
        currentPrices[ticker] = price;
        const priceElement = document.querySelector(`.ticker-item[data-ticker="${ticker}"] .ticker-price`);
        if (priceElement) {
            priceElement.textContent = price.toFixed(2);
        }
        
        const changeElement = document.querySelector(`.ticker-item[data-ticker="${ticker}"] .ticker-change`);
        if (changeElement) {
            changeElement.textContent = `${change.toFixed(2)}%`;
            changeElement.className = `ticker-change ${change >= 0 ? 'positive' : 'negative'}`;
        }
    }
    
    closeModal();
}

function addTickerComment(type, ticker) {
    document.getElementById('commentModalTicker').textContent = ticker;
    document.getElementById('commentInput').value = '';
    document.getElementById('commentModal').classList.add('flex');
    document.getElementById('commentModal').classList.remove('hidden');
    
    // Сохраняем контекст для использования в saveComment
    window.currentCommentContext = { type, ticker };
}

function saveComment() {
    const { type, ticker } = window.currentCommentContext;
    const comment = document.getElementById('commentInput').value;
    
    // В реальном приложении здесь бы сохранялся комментарий
    console.log(`Comment for ${ticker}: ${comment}`);
    
    closeCommentModal();
    showNotification('Комментарий сохранен', `Комментарий для ${ticker} был сохранен`);
}

function showTickerChart(ticker) {
    if (!allSymbols.concat(futuresSymbols).includes(ticker)) {
        document.getElementById('chartError').classList.remove('hidden');
        return;
    }
    
    document.getElementById('chartModalTitle').textContent = ticker;
    document.getElementById('chartModal').classList.add('flex');
    document.getElementById('chartModal').classList.remove('hidden');
    document.getElementById('chartError').classList.add('hidden');
    
    // Инициализация TradingView Widget
    if (window.TradingView) {
        new TradingView.widget({
            autosize: true,
            symbol: `BINANCE:${ticker}`,
            interval: "15",
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            locale: "ru",
            toolbar_bg: "#f1f3f6",
            enable_publishing: false,
            hide_top_toolbar: true,
            hide_side_toolbar: false,
            allow_symbol_change: true,
            container_id: "tradingview-widget"
        });
    }
}

function closeModal() {
    document.getElementById('priceModal').classList.add('hidden');
    document.getElementById('priceModal').classList.remove('flex');
}

function closeCommentModal() {
    document.getElementById('commentModal').classList.add('hidden');
    document.getElementById('commentModal').classList.remove('flex');
}

function closeChartModal() {
    document.getElementById('chartModal').classList.add('hidden');
    document.getElementById('chartModal').classList.remove('flex');
}

// Инициализация TradingView
function initTradingView() {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.onload = function() {
        window.TradingView = window.TradingView || {};
    };
    document.head.appendChild(script);
}

// Инициализация всех компонентов
initTradingView();
loadTickersFromStorage();
