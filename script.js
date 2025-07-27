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
    TREND_ANALYSIS_PERIOD: 14
};

// Общие переменные
const TG_BOT_TOKEN = '8044055704:AAGk8cQFayPqYCscLlEB3qGRj0Uw_NTpe30';
const popularTickers = {
    'BTCUSDT': { name: 'Bitcoin', type: 'spot' },
    'ETHUSDT': { name: 'Ethereum', type: 'spot' },
    // ... остальные популярные тикеры
};

// Глобальные объекты
const tickersData = {
    'long': {},
    'short': {},
    'long-wait': {},
    'short-wait': {}
};

let allBinanceTickers = {};
let tickersLoaded = false;
let apiManager;
let userAlerts = [];
let currentAlertFilter = 'active';
let alertCooldowns = {};
let activeTriggeredAlerts = {};
let currentPrices = {};

// Модальные окна
const priceModal = document.getElementById('priceModal');
const modalTicker = document.getElementById('modalTicker');
const priceInput = document.getElementById('priceInput');
const changeInput = document.getElementById('changeInput');
const commentModal = document.getElementById('commentModal');
const commentModalTicker = document.getElementById('commentModalTicker');
const commentInput = document.getElementById('commentInput');
let currentTicker = '';
let currentListType = '';
let tradingViewWidget = null;

// ================================ //
// КЛАСС BinanceAPIManager (расширенный)
// ================================ //
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

    async init() {
        await this.checkAPIConnection();
        this.startHealthCheck();
        await this.loadAllTickers();
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

    async loadAllTickers() {
        try {
            const response = await this._fetchWithTimeout(API_CONFIG.ENDPOINTS.ALL_TICKERS);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            allBinanceTickers = {};
            
            data.symbols.forEach(symbol => {
                if (symbol.status === 'TRADING' && symbol.symbol.endsWith('USDT')) {
                    allBinanceTickers[symbol.symbol] = {
                        name: symbol.baseAsset,
                        type: 'spot'
                    };
                }
            });
            
            await this.loadFuturesTickers();
            tickersLoaded = true;
        } catch (error) {
            console.error('Error loading all tickers:', error);
            this.loadDefaultTickers();
        }
    }

    async loadFuturesTickers() {
        try {
            const response = await this._fetchWithTimeout('https://fapi.binance.com/fapi/v1/exchangeInfo');
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            data.symbols.forEach(symbol => {
                if (symbol.status === 'TRADING' && symbol.symbol.endsWith('USDT')) {
                    allBinanceTickers[symbol.symbol] = {
                        name: symbol.baseAsset,
                        type: 'futures'
                    };
                }
            });
        } catch (error) {
            console.error('Error loading futures tickers:', error);
        }
    }

    loadDefaultTickers() {
        allBinanceTickers = { ...popularTickers };
    }

    async getCurrentPrice(symbol, marketType) {
        try {
            const endpoint = marketType === 'futures'
                ? `${API_CONFIG.ENDPOINTS.FUTURES}/fapi/v1/ticker/price?symbol=${symbol}`
                : `${API_CONFIG.ENDPOINTS.SPOT}/api/v3/ticker/price?symbol=${symbol}`;

            const response = await this._fetchWithTimeout(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data || typeof data.price !== 'string') return null;

            const price = parseFloat(data.price);
            return isNaN(price) ? null : price;
        } catch (error) {
            console.error(`Error getting price for ${symbol}:`, error);
            return null;
        }
    }

    async getPriceHistory(symbol, marketType = 'spot', days = API_CONFIG.TREND_ANALYSIS_PERIOD) {
        const cacheKey = `${symbol}-${marketType}-${days}`;
        
        if (this.priceHistoryCache[cacheKey] && 
            Date.now() - this.priceHistoryCache[cacheKey].timestamp < 600000) {
            return this.priceHistoryCache[cacheKey].data;
        }

        try {
            const interval = days <= 7 ? '1h' : days <= 30 ? '4h' : '1d';
            const limit = Math.min(days * 24, 1000);
            
            const endpoint = marketType === 'futures'
                ? `${API_CONFIG.ENDPOINTS.FUTURES}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
                : `${API_CONFIG.ENDPOINTS.SPOT}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

            const response = await this._fetchWithTimeout(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.priceHistoryCache[cacheKey] = {
                data: data,
                timestamp: Date.now()
            };

            return data;
        } catch (error) {
            console.error(`Error getting price history for ${symbol}:`, error);
            return null;
        }
    }

    async analyzeTrend(symbol, marketType = 'spot') {
        try {
            const history = await this.getPriceHistory(symbol, marketType);
            if (!history || history.length < 2) return null;

            const closes = history.map(item => parseFloat(item[4]));
            const sma = closes.reduce((sum, price) => sum + price, 0) / closes.length;
            const latestPrice = closes[closes.length - 1];
            
            if (latestPrice > sma * 1.05) {
                return { direction: 'up', confidence: Math.min(100, Math.round((latestPrice - sma) / sma * 1000)) };
            } else if (latestPrice < sma * 0.95) {
                return { direction: 'down', confidence: Math.min(100, Math.round((sma - latestPrice) / sma * 1000)) };
            } else {
                return { direction: 'neutral', confidence: 0 };
            }
        } catch (error) {
            console.error(`Error analyzing trend for ${symbol}:`, error);
            return null;
        }
    }
}

// ================================ //
// ОБЩИЕ ФУНКЦИИ
// ================================ //
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

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Успех', `Тикер ${text} скопирован в буфер`);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showNotification('Ошибка', 'Не удалось скопировать тикер');
    });
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ================================ //
// ФУНКЦИИ WATCHLIST
// ================================ //
function initializeSortableLists() {
    if (!document.querySelector('.ticker-list')) return;
    
    document.querySelectorAll('.ticker-list').forEach(list => {
        new Sortable(list, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function(evt) {
                const listType = evt.to.id.replace('-list', '');
                const tickers = Array.from(evt.to.children)
                    .filter(item => item.classList.contains('ticker-item'))
                    .map(item => item.dataset.ticker);

                const reorderedData = {};
                tickers.forEach(ticker => {
                    reorderedData[ticker] = tickersData[listType][ticker];
                });

                tickersData[listType] = reorderedData;
                saveTickersToStorage();
            }
        });
    });
}

function setupInputHandlers() {
    document.querySelectorAll('.ticker-input').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const panel = this.closest('.panel');
                const type = panel.id.replace('-panel', '');
                addTicker(type);
            }
        });

        input.addEventListener('input', function(e) {
            const panel = this.closest('.panel');
            const type = panel.id.replace('-panel', '');
            showTickerSuggestions(this.value.trim().toUpperCase(), type);
        });

        input.addEventListener('blur', function() {
            setTimeout(() => {
                const panel = this.closest('.panel');
                const type = panel.id.replace('-panel', '');
                document.getElementById(`${type}-suggestions`).style.display = 'none';
            }, 200);
        });
    });
}

function showTickerSuggestions(query, listType) {
    const suggestionsContainer = document.getElementById(`${listType}-suggestions`);
    if (!suggestionsContainer) return;
    
    suggestionsContainer.innerHTML = '';

    if (!query || query.length < 2) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    const filteredTickers = Object.keys(allBinanceTickers)
        .filter(ticker => ticker.includes(query))
        .slice(0, 10);

    if (filteredTickers.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    filteredTickers.forEach(ticker => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'suggestion-item';
        suggestionItem.innerHTML = `
            <span class="suggestion-ticker">${ticker}</span>
            <span class="suggestion-type ${allBinanceTickers[ticker].type === 'spot' ? 'spot-type' : 'futures-type'}">
                ${allBinanceTickers[ticker].type === 'spot' ? 'SPOT' : 'FUTURES'}
            </span>
        `;

        suggestionItem.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const input = document.getElementById(`${listType}-input`);
            input.value = ticker;
            suggestionsContainer.style.display = 'none';
            input.focus();
        });

        suggestionsContainer.appendChild(suggestionItem);
    });

    suggestionsContainer.style.display = 'block';
}

function loadTickersFromStorage() {
    const savedData = localStorage.getItem('cryptoDashboardTickers');

    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);

            for (const listType in parsedData) {
                if (parsedData.hasOwnProperty(listType)) {
                    tickersData[listType] = parsedData[listType];
                    const list = document.getElementById(`${listType}-list`);
                    if (!list) continue;
                    
                    list.innerHTML = '';
                    for (const ticker in parsedData[listType]) {
                        if (parsedData[listType].hasOwnProperty(ticker)) {
                            addTickerToList(ticker, listType);
                        }
                    }
                }
            }
            updateStats();
        } catch (e) {
            console.error('Ошибка при загрузке данных:', e);
        }
    }
}

function saveTickersToStorage() {
    try {
        localStorage.setItem('cryptoDashboardTickers', JSON.stringify(tickersData));
        updateStats();
    } catch (e) {
        console.error('Ошибка при сохранении данных:', e);
    }
}

async function addTicker(listType) {
    const input = document.getElementById(`${listType}-input`);
    const errorElement = document.getElementById(`${listType}-error`);
    if (!input || !errorElement) return;
    
    let ticker = input.value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '');

    if (!ticker) {
        errorElement.textContent = 'Введите тикер';
        errorElement.style.display = 'block';
        return;
    }

    if (ticker.includes('.P')) {
        ticker = ticker.replace('.P', '');
    } else if (!ticker.endsWith('USDT')) {
        ticker += 'USDT';
    }

    if (tickersData[listType][ticker]) {
        errorElement.textContent = 'Этот тикер уже добавлен';
        errorElement.style.display = 'block';
        return;
    }

    const now = new Date();
    const isBinanceTicker = allBinanceTickers.hasOwnProperty(ticker);
    
    tickersData[listType][ticker] = {
        name: isBinanceTicker ? allBinanceTickers[ticker].name : ticker.replace(/USDT$/, ''),
        price: '0.000000',
        change: '0.00',
        isBinance: isBinanceTicker,
        addedDate: now.toISOString(),
        stars: 0,
        marketType: isBinanceTicker ? allBinanceTickers[ticker].type : 'spot',
        comment: '',
        trend: null
    };

    if (isBinanceTicker) {
        try {
            const marketType = tickersData[listType][ticker].marketType;
            const apiUrl = marketType === 'futures' 
                ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${ticker}`
                : `https://api.binance.com/api/v3/ticker/24hr?symbol=${ticker}`;

            const response = await fetch(apiUrl);
            if (response.ok) {
                const data = await response.json();
                tickersData[listType][ticker].price = parseFloat(data.lastPrice).toFixed(6);
                tickersData[listType][ticker].change = parseFloat(data.priceChangePercent).toFixed(2);
                const trend = await apiManager.analyzeTrend(ticker, marketType);
                if (trend) {
                    tickersData[listType][ticker].trend = trend;
                }
            }
        } catch (error) {
            console.error(`Ошибка при проверке тикера ${ticker}:`, error);
        }
    }

    const list = document.getElementById(`${listType}-list`);
    if (list) {
        addTickerToList(ticker, listType);
    }
    saveTickersToStorage();
    input.value = '';
    errorElement.style.display = 'none';
    document.getElementById(`${listType}-suggestions`).style.display = 'none';

    if (!tickersData[listType][ticker].isBinance) {
        editTicker(ticker, listType);
    }
}

function addTickerToList(ticker, listType) {
    const list = document.getElementById(`${listType}-list`);
    if (!list) return;
    
    const tickerData = tickersData[listType][ticker];
    const changeNum = parseFloat(tickerData.change);
    const changeClass = changeNum > 0 ? 'positive' : changeNum < 0 ? 'negative' : 'neutral';
    const addedDate = new Date(tickerData.addedDate);
    const formattedDate = addedDate.toLocaleString();

    const starsHtml = Array(3).fill(0).map((_, i) =>
        `<i class="star ${i < tickerData.stars ? 'fas' : 'far'} fa-star"
            onclick="rateTicker(event, '${ticker}', '${listType}', ${i + 1})"></i>`
    ).join('');

    let trendIndicator = '';
    if (tickerData.trend) {
        const trendClass = tickerData.trend.direction === 'up' ? 'trend-up' :
                         tickerData.trend.direction === 'down' ? 'trend-down' : 'trend-neutral';
        const trendIcon = tickerData.trend.direction === 'up' ? 'fa-arrow-up' :
                         tickerData.trend.direction === 'down' ? 'fa-arrow-down' : 'fa-arrows-left-right';
        
        trendIndicator = `
            <span class="trend-indicator ${trendClass}" title="Тренд: ${tickerData.trend.direction}, уверенность: ${tickerData.trend.confidence}%">
                <i class="fas ${trendIcon}"></i>
                ${tickerData.trend.confidence}%
            </span>
        `;
    }

    const listItem = document.createElement('li');
    listItem.className = 'ticker-item';
    listItem.dataset.ticker = ticker;
    listItem.dataset.listType = listType;

    listItem.innerHTML = `
        <div class="ticker-info">
            <div class="ticker-name-container">
                <span class="ticker-symbol">${ticker}</span>
                ${trendIndicator}
                <div class="star-rating">${starsHtml}</div>
            </div>
            <div class="price-info">
                <div class="price-value">
                    $${tickerData.price}
                    <span class="price-change ${changeClass}">${tickerData.change}%</span>
                </div>
                <div class="added-date">${formattedDate}</div>
            </div>
        </div>
        <div class="action-buttons">
            <button class="action-btn move-btn" onclick="moveTickerUp(event, this)">
                <i class="fas fa-arrow-up"></i>
            </button>
            <button class="action-btn move-btn" onclick="moveTickerDown(event, this)">
                <i class="fas fa-arrow-down"></i>
            </button>
            <button class="action-btn comment-btn" onclick="editComment(event, '${ticker}', '${listType}')">
                <i class="fas fa-comment${tickerData.comment ? '' : '-dots'}"></i>
                ${tickerData.comment ? `<div class="comment-tooltip">${tickerData.comment}</div>` : ''}
            </button>
            <button class="action-btn copy-btn" onclick="copyToClipboard('${ticker}')">
                <i class="fas fa-copy"></i>
            </button>
            <button class="action-btn delete-btn" onclick="removeTicker(event, this)">×</button>
        </div>
    `;

    listItem.querySelector('.ticker-info').addEventListener('click', function() {
        openTradingViewChart(ticker, listType);
    });

    list.appendChild(listItem);
}

function editComment(event, ticker, listType) {
    event.stopPropagation();
    currentTicker = ticker;
    currentListType = listType;
    
    const tickerData = tickersData[listType][ticker];
    if (commentModalTicker) commentModalTicker.textContent = ticker;
    if (commentInput) commentInput.value = tickerData.comment || '';
    if (commentModal) commentModal.style.display = 'flex';
}

function saveComment() {
    if (!currentTicker || !currentListType) return;
    
    const comment = commentInput ? commentInput.value.trim() : '';
    tickersData[currentListType][currentTicker].comment = comment;
    
    const listItem = document.querySelector(`.ticker-item[data-ticker="${currentTicker}"][data-list-type="${currentListType}"]`);
    if (listItem) {
        const commentBtn = listItem.querySelector('.comment-btn');
        const hasComment = comment !== '';
        
        if (commentBtn) {
            const icon = commentBtn.querySelector('i');
            if (icon) icon.className = hasComment ? 'fas fa-comment' : 'fas fa-comment-dots';
            
            let tooltip = commentBtn.querySelector('.comment-tooltip');
            if (hasComment) {
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.className = 'comment-tooltip';
                    commentBtn.appendChild(tooltip);
                }
                tooltip.textContent = comment;
            } else if (tooltip) {
                tooltip.remove();
            }
        }
    }
    
    saveTickersToStorage();
    closeCommentModal();
}

function closeCommentModal() {
    if (commentModal) commentModal.style.display = 'none';
}

function rateTicker(event, ticker, listType, rating) {
    event.stopPropagation();
    const tickerData = tickersData[listType][ticker];
    tickerData.stars = tickerData.stars === rating ? 0 : rating;

    const stars = event.target.parentElement.querySelectorAll('.star');
    stars.forEach((star, i) => {
        star.classList.toggle('fas', i < tickerData.stars);
        star.classList.toggle('far', i >= tickerData.stars);
    });

    saveTickersToStorage();
}

function moveTickerUp(event, button) {
    event.stopPropagation();
    const listItem = button.closest('.ticker-item');
    const prevItem = listItem.previousElementSibling;

    if (prevItem) {
        const list = listItem.parentElement;
        list.insertBefore(listItem, prevItem);
        updateTickersOrder(list.id.replace('-list', ''));
    }
}

function moveTickerDown(event, button) {
    event.stopPropagation();
    const listItem = button.closest('.ticker-item');
    const nextItem = listItem.nextElementSibling;

    if (nextItem) {
        const list = listItem.parentElement;
        list.insertBefore(nextItem, listItem);
        updateTickersOrder(list.id.replace('-list', ''));
    }
}

function updateTickersOrder(listType) {
    const list = document.getElementById(`${listType}-list`);
    if (!list) return;
    
    const tickers = Array.from(list.children)
        .filter(item => item.classList.contains('ticker-item'))
        .map(item => item.dataset.ticker);

    const reorderedData = {};
    tickers.forEach(ticker => {
        reorderedData[ticker] = tickersData[listType][ticker];
    });

    tickersData[listType] = reorderedData;
    saveTickersToStorage();
}

function editTicker(ticker, listType) {
    currentTicker = ticker;
    currentListType = listType;
    const tickerData = tickersData[listType][ticker];

    if (modalTicker) modalTicker.textContent = ticker;
    if (priceInput) priceInput.value = tickerData.price;
    if (changeInput) changeInput.value = tickerData.change;
    if (priceModal) priceModal.style.display = 'flex';
}

function closeModal() {
    if (priceModal) priceModal.style.display = 'none';
}

function confirmManualPrice() {
    if (!currentTicker || !currentListType) return;
    
    const price = priceInput ? parseFloat(priceInput.value) : 0;
    const change = changeInput ? parseFloat(changeInput.value) || 0 : 0;

    if (!isNaN(price)) {
        tickersData[currentListType][currentTicker].price = price.toFixed(6);
        tickersData[currentListType][currentTicker].change = change.toFixed(2);
        updateTickerOnPage(currentTicker, currentListType);
        saveTickersToStorage();
        closeModal();
    }
}

function updateTickerOnPage(ticker, listType) {
    const tickerData = tickersData[listType][ticker];
    const listItem = document.querySelector(`.ticker-item[data-ticker="${ticker}"][data-list-type="${listType}"]`);

    if (listItem) {
        const changeNum = parseFloat(tickerData.change);
        const changeClass = changeNum > 0 ? 'positive' : changeNum < 0 ? 'negative' : 'neutral';
        const addedDate = new Date(tickerData.addedDate);
        const formattedDate = addedDate.toLocaleString();

        const priceValue = listItem.querySelector('.price-value');
        if (priceValue) {
            priceValue.innerHTML = `$${tickerData.price} <span class="price-change ${changeClass}">${tickerData.change}%</span>`;
        }
        
        const addedDateEl = listItem.querySelector('.added-date');
        if (addedDateEl) {
            addedDateEl.textContent = formattedDate;
        }
    }
}

function removeTicker(event, button) {
    event.stopPropagation();
    const listItem = button.closest('.ticker-item');
    const ticker = listItem.dataset.ticker;
    const listType = listItem.dataset.listType;

    delete tickersData[listType][ticker];
    listItem.remove();
    saveTickersToStorage();
}

function clearAllTickers(listType) {
    if (confirm(`Вы уверены, что хотите удалить все тикеры из списка ${listType}?`)) {
        tickersData[listType] = {};
        const list = document.getElementById(`${listType}-list`);
        if (list) list.innerHTML = '';
        saveTickersToStorage();
    }
}

async function updateTickerPrice(ticker, listType) {
    const tickerData = tickersData[listType][ticker];
    if (!tickerData.isBinance) return;

    try {
        const marketType = tickerData.marketType;
        const apiUrl = marketType === 'futures' 
            ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${ticker}`
            : `https://api.binance.com/api/v3/ticker/24hr?symbol=${ticker}`;

        const response = await fetch(apiUrl);
        if (response.ok) {
            const data = await response.json();
            const newPrice = parseFloat(data.lastPrice).toFixed(6);
            const newChange = parseFloat(data.priceChangePercent).toFixed(2);

            if (tickerData.price !== newPrice || tickerData.change !== newChange) {
                tickerData.price = newPrice;
                tickerData.change = newChange;

                const trend = await apiManager.analyzeTrend(ticker, marketType);
                if (trend) {
                    tickerData.trend = trend;
                }

                updateTickerOnPage(ticker, listType);
                saveTickersToStorage();
            }
        }
    } catch (error) {
        console.error(`Ошибка при обновлении ${ticker}:`, error);
    }
}

function updateAllPrices() {
    for (const listType in tickersData) {
        if (tickersData.hasOwnProperty(listType)) {
            for (const ticker in tickersData[listType]) {
                if (tickersData[listType].hasOwnProperty(ticker)) {
                    updateTickerPrice(ticker, listType);
                }
            }
        }
    }
}

function updateStats() {
    let totalTickers = 0;
    let longCount = 0;
    let shortCount = 0;
    let longWaitCount = 0;
    let shortWaitCount = 0;

    for (const listType in tickersData) {
        if (tickersData.hasOwnProperty(listType)) {
            const count = Object.keys(tickersData[listType]).length;
            totalTickers += count;

            if (listType === 'long') longCount = count;
            if (listType === 'short') shortCount = count;
            if (listType === 'long-wait') longWaitCount = count;
            if (listType === 'short-wait') shortWaitCount = count;
        }
    }

    const totalEl = document.getElementById('total-tickers');
    const longEl = document.getElementById('long-count');
    const shortEl = document.getElementById('short-count');
    const longWaitEl = document.getElementById('long-wait-count');
    const shortWaitEl = document.getElementById('short-wait-count');

    if (totalEl) totalEl.textContent = totalTickers;
    if (longEl) longEl.textContent = longCount;
    if (shortEl) shortEl.textContent = shortCount;
    if (longWaitEl) longWaitEl.textContent = longWaitCount;
    if (shortWaitEl) shortWaitEl.textContent = shortWaitCount;
}

function openTradingViewChart(ticker, listType) {
    currentTicker = ticker;
    currentListType = listType;
    
    const chartModalTitle = document.getElementById('chartModalTitle');
    const chartModal = document.getElementById('chartModal');
    const chartError = document.getElementById('chartError');
    
    if (chartModalTitle) chartModalTitle.textContent = ticker;
    if (chartModal) chartModal.style.display = 'flex';
    if (chartError) chartError.classList.add('hidden');
    
    loadTradingViewWidget(ticker);
}

function loadTradingViewWidget(ticker) {
    const widgetContainer = document.getElementById('tradingview-widget');
    if (!widgetContainer) return;
    
    widgetContainer.innerHTML = '';
    
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.onload = () => {
        const chartError = document.getElementById('chartError');
        if (chartError) chartError.classList.add('hidden');
    };
    script.onerror = () => {
        const chartError = document.getElementById('chartError');
        if (chartError) chartError.classList.remove('hidden');
    };
    
    script.innerHTML = JSON.stringify({
        "symbol": `BINANCE:${ticker}`,
        "interval": "D",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "0",
        "locale": "ru",
        "allow_symbol_change": true,
        "save_image": true,
        "container_id": "tradingview-widget"
    });
    
    widgetContainer.appendChild(script);
}

function closeChartModal() {
    const chartModal = document.getElementById('chartModal');
    if (chartModal) chartModal.style.display = 'none';
}

// ================================ //
// ФУНКЦИИ АЛЕРТОВ
// ================================ //
function saveAppState() {
    try {
        localStorage.setItem('cryptoAlerts', JSON.stringify(userAlerts));
        localStorage.setItem('alertFilter', currentAlertFilter);
        
        const telegramCheckbox = document.getElementById('telegram');
        const tgSettings = {
            chatId: localStorage.getItem('tg_chat_id'),
            enabled: telegramCheckbox ? telegramCheckbox.checked : false
        };
        localStorage.setItem('tgSettings', JSON.stringify(tgSettings));
        
        return true;
    } catch (error) {
        console.error("Ошибка при сохранении состояния:", error);
        return false;
    }
}

function loadAppState() {
    try {
        const savedAlerts = localStorage.getItem('cryptoAlerts');
        if (savedAlerts) userAlerts = JSON.parse(savedAlerts);
        
        const savedFilter = localStorage.getItem('alertFilter');
        if (savedFilter) currentAlertFilter = savedFilter;
        
        const tgSettings = JSON.parse(localStorage.getItem('tgSettings') || '{}');
        if (tgSettings.chatId) {
            localStorage.setItem('tg_chat_id', tgSettings.chatId);
            const userChatId = document.getElementById('userChatId');
            if (userChatId) userChatId.value = tgSettings.chatId;
        }
        
        if (tgSettings.enabled !== undefined) {
            const telegramCheckbox = document.getElementById('telegram');
            if (telegramCheckbox) telegramCheckbox.checked = tgSettings.enabled;
        }
        
        return true;
    } catch (error) {
        console.error("Ошибка при загрузке состояния:", error);
        return false;
    }
}

async function updateCurrentPrices() {
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
}

function updateAlertPriceDisplay(symbol, price) {
    const alertElements = document.querySelectorAll(`.alert-card[data-symbol="${symbol}"]`);
    alertElements.forEach(el => {
        const priceElement = el.querySelector('.current-price-value');
        if (priceElement) {
            priceElement.textContent = price;
            
            const alertId = el.id.split('-')[1];
            const alert = userAlerts.find(a => a.id == alertId);
            if (alert) {
                const isAboveTarget = price > alert.value;
                priceElement.className = `current-price-value ${isAboveTarget ? 'price-up' : 'price-down'}`;
            }
        }
    });
}

function comparePrices(currentPrice, condition, targetPrice) {
    const epsilon = API_CONFIG.PRICE_COMPARISON_EPSILON;
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
            const marketType = getMarketTypeBySymbol(alert.symbol);
            const price = await apiManager.getCurrentPrice(alert.symbol, marketType);
            if (price === null) continue;
            
            const conditionMet = comparePrices(price, alert.condition, alert.value);
            
            if (conditionMet) {
                const cooldownKey = `${alert.symbol}_${alert.condition}_${alert.value}`;
                const lastNotification = alertCooldowns[cooldownKey] || 0;
                
                if (now - lastNotification > 60000) {
                    await handleTriggeredAlert(alert, price);
                    alertCooldowns[cooldownKey] = now;
                    activeTriggeredAlerts[alert.id] = true;
                    highlightTriggeredAlert(alert.id, alert.condition);
                    
                    if (alert.notificationCount > 0 && alert.triggeredCount >= alert.notificationCount) {
                        alert.triggered = true;
                    }
                    
                    saveAppState();
                    loadUserAlerts(currentAlertFilter);
                }
            }
        } catch (error) {
            console.error(`Error checking alert ${alert.id}:`, error);
        }
    }
}

function highlightTriggeredAlert(alertId, condition) {
    const alertElement = document.getElementById(`alert-${alertId}`);
    if (!alertElement) return;
    
    if (condition === '>') {
        alertElement.classList.add('alert-triggered-long');
    } else {
        alertElement.classList.add('alert-triggered-short');
    }
    
    const container = alertElement.parentElement;
    if (container) {
        container.insertBefore(alertElement, container.firstChild);
    }
    
    setTimeout(() => {
        alertElement.classList.remove('alert-triggered-long', 'alert-triggered-short');
    }, 5000);
}

async function handleTriggeredAlert(alert, currentPrice) {
    const message = `🚨 Алерт сработал!\nСимвол: ${alert.symbol}\n` +
        `Условие: ${alert.condition} ${alert.value}\n` +
        `Текущая цена: ${currentPrice}`;
    
    if (alert.notificationMethods.includes('telegram') && alert.chatId) {
        try {
            await sendTelegramNotification(message, alert.chatId);
            alert.triggeredCount = (alert.triggeredCount || 0) + 1;
        } catch (error) {
            console.error('Failed to send Telegram alert:', error);
        }
    }
    
    showNotification('Алерт сработал',
        `Символ: ${alert.symbol}\n` +
        `Условие: ${alert.condition} ${alert.value}\n` +
        `Текущая цена: ${currentPrice}`);
}

async function sendTelegramNotification(message, chatId) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message })
        });
        
        const data = await response.json();
        return data.ok;
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        return false;
    }
}

function applyCurrentPrice() {
    const currentPriceValue = document.getElementById('currentPriceValue');
    if (!currentPriceValue) return;
    
    const priceText = currentPriceValue.textContent;
    const price = parseFloat(priceText);
    
    if (!isNaN(price)) {
        const valueInput = document.getElementById('value');
        if (valueInput) valueInput.value = price;
    }
}

function applyCurrentPriceForEdit() {
    const currentPriceValue = document.getElementById('editCurrentPriceValue');
    if (!currentPriceValue) return;
    
    const priceText = currentPriceValue.textContent;
    const price = parseFloat(priceText);
    
    if (!isNaN(price)) {
        const valueInput = document.getElementById('editValue');
        if (valueInput) valueInput.value = price;
    }
}

function getMarketTypeBySymbol(symbol) {
    if (allBinanceTickers[symbol]) {
        return allBinanceTickers[symbol].type;
    }
    return 'spot';
}

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
    const telegramCheckbox = document.getElementById('telegram');
    const coinSearch = document.getElementById('coinSearch');
    const symbol = document.getElementById('symbol');
    
    if (telegramCheckbox && telegramCheckbox.checked) {
        const chatId = localStorage.getItem('tg_chat_id') || document.getElementById('userChatId')?.value;
        if (!chatId) {
            showBotConnectionHint();
            isValid = false;
        }
    }
    
    if (!coinSearch || !symbol || !coinSearch.value.trim() || !symbol.value) {
        isValid = false;
    }
    
    const value = document.getElementById('value');
    if (!value || !value.value.trim() || isNaN(parseFloat(value.value))) {
        isValid = false;
    }
    
    const symbolValue = symbol.value;
    const conditionValue = document.getElementById('condition').value;
    if (symbolValue && conditionValue && value.value && isDuplicateAlert(symbolValue, conditionValue, value.value)) {
        isValid = false;
    }
    
    return isValid;
}

function validateEditForm() {
    const value = document.getElementById('editValue');
    return value && value.value.trim() && !isNaN(parseFloat(value.value));
}

async function loadMarketData() {
    if (!apiManager.connectionState.connected) {
        await apiManager.checkAPIConnection();
    }
}

async function addUserAlert(symbol, type, condition, value, notificationMethods, notificationCount, chatId) {
    if (notificationMethods.includes('telegram')) {
        const savedChatId = localStorage.getItem('tg_chat_id') || chatId;
        if (!savedChatId) {
            showBotConnectionHint();
            return false;
        }
    }
    
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
        marketType
    };
    
    userAlerts.push(newAlert);
    saveAppState();
    loadUserAlerts(currentAlertFilter);
    return true;
}

function loadUserAlerts(filter = 'active') {
    const longAlertsContainer = document.getElementById('longAlerts');
    const shortAlertsContainer = document.getElementById('shortAlerts');
    if (!longAlertsContainer || !shortAlertsContainer) return;
    
    currentAlertFilter = filter;
    saveAppState();
    
    let filteredAlerts = [];
    
    if (filter === 'history') {
        filteredAlerts = loadTriggeredAlerts();
    } else {
        switch(filter) {
            case 'active': filteredAlerts = userAlerts.filter(alert => !alert.triggered); break;
            case 'triggered': filteredAlerts = userAlerts.filter(alert => alert.triggered); break;
            case 'all': filteredAlerts = [...userAlerts]; break;
        }
    }
    
    filteredAlerts.sort((a, b) => {
        const aTriggered = activeTriggeredAlerts[a.id] || false;
        const bTriggered = activeTriggeredAlerts[b.id] || false;
        if (aTriggered && !bTriggered) return -1;
        if (!aTriggered && bTriggered) return 1;
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
        
        if (isUp) longHtml += alertHtml;
        else shortHtml += alertHtml;
    });
    
    longAlertsContainer.innerHTML = longHtml || '<div class="text-center text-gray-400 py-4">Нет лонг алертов</div>';
    shortAlertsContainer.innerHTML = shortHtml || '<div class="text-center text-gray-400 py-4">Нет шорт алертов</div>';
    updateAlertsCounter();
}

function updateAlertsCounter() {
    const activeLongAlertsCount = userAlerts.filter(alert => !alert.triggered && alert.condition === '>').length;
    const activeShortAlertsCount = userAlerts.filter(alert => !alert.triggered && alert.condition === '<').length;
    const totalActiveAlertsCount = userAlerts.filter(alert => !alert.triggered).length;
    
    const longEl = document.getElementById('longAlertsCount');
    const shortEl = document.getElementById('shortAlertsCount');
    const totalEl = document.getElementById('totalAlertsCount');
    
    if (longEl) longEl.textContent = activeLongAlertsCount;
    if (shortEl) shortEl.textContent = activeShortAlertsCount;
    if (totalEl) totalEl.textContent = `Всего: ${totalActiveAlertsCount}`;
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
    
    apiManager.getCurrentPrice(alert.symbol, alert.marketType).then(price => {
        const currentPriceValue = document.getElementById('editCurrentPriceValue');
        if (currentPriceValue && price !== null) {
            currentPriceValue.textContent = price;
        }
    });
    
    const telegramCheckbox = document.getElementById('editTelegram');
    if (telegramCheckbox) {
        telegramCheckbox.addEventListener('change', function() {
            const userChatId = document.getElementById('editUserChatId');
            if (!userChatId) return;
            
            if (this.checked) {
                userChatId.classList.remove('hidden');
                const savedChatId = localStorage.getItem('tg_chat_id');
                if (savedChatId) userChatId.value = savedChatId;
            } else {
                userChatId.classList.add('hidden');
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
                const savedEmail = localStorage.getItem('userEmail');
                if (savedEmail) userEmail.value = savedEmail;
            } else {
                userEmail.classList.add('hidden');
            }
        });
    }
    
    const editForm = document.getElementById('editAlertForm');
    if (editForm) {
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleEditSubmit(alert.id);
        });
    }
    
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
    
    const notificationMethods = [];
    if (useTelegram) notificationMethods.push('telegram');
    if (useEmail) notificationMethods.push('email');
    
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
        marketType: getMarketTypeBySymbol(symbol)
    };
    
    userAlerts = userAlerts.map(a => a.id === parseInt(alertId) ? updatedAlert : a);
    saveAppState();
    
    if (useEmail) localStorage.setItem('userEmail', userEmail);
    
    loadUserAlerts(currentAlertFilter);
    showNotification('Успешно', `Алерт для ${symbol} обновлен`);
    closeEditModal();
}

function closeEditModal() {
    const editModal = document.getElementById('editModal');
    const editFormContent = document.getElementById('editFormContent');
    
    if (editModal) editModal.classList.remove('active');
    if (editFormContent) editFormContent.innerHTML = '';
}

// ================================ //
// ОБЩИЕ ОБРАБОТЧИКИ И ИНИЦИАЛИЗАЦИЯ
// ================================ //
function toggleMenu() {
    const menuContent = document.getElementById('menuContent');
    if (menuContent) menuContent.classList.toggle('show');
}

function setupEventListeners() {
    // Обработчики для watchlist
    if (document.getElementById('long-input')) {
        setupInputHandlers();
        document.getElementById('clearLong').addEventListener('click', () => clearAllTickers('long'));
        document.getElementById('clearShort').addEventListener('click', () => clearAllTickers('short'));
        document.getElementById('clearLongWait').addEventListener('click', () => clearAllTickers('long-wait'));
        document.getElementById('clearShortWait').addEventListener('click', () => clearAllTickers('short-wait'));
    }

    // Обработчики для алертов
    if (document.getElementById('alertForm')) {
        const alertForm = document.getElementById('alertForm');
        if (alertForm) {
            alertForm.addEventListener('submit', async function(e) {
                e.preventDefault();
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
                
                const notificationMethods = [];
                if (useTelegram) notificationMethods.push('telegram');
                if (useEmail) notificationMethods.push('email');
                
                await addUserAlert(symbol, alertType, condition, value, notificationMethods, notificationCount, userChatId);
                if (useEmail) localStorage.setItem('userEmail', userEmail);
                resetForm();
            });
        }

        document.getElementById('clearAlerts').addEventListener('click', clearAllAlerts);
        document.getElementById('exportAllAlerts').addEventListener('click', exportAllActiveAlerts);
        document.getElementById('showActiveAlerts').addEventListener('click', () => loadUserAlerts('active'));
        document.getElementById('showTriggeredAlerts').addEventListener('click', () => loadUserAlerts('triggered'));
        document.getElementById('showHistoryAlerts').addEventListener('click', () => loadUserAlerts('history'));
        document.getElementById('showAllAlerts').addEventListener('click', () => loadUserAlerts('all'));
    }

    // Общие обработчики
    document.getElementById('menuButton')?.addEventListener('click', toggleMenu);
    window.addEventListener('click', function(event) {
        const menuContent = document.getElementById('menuContent');
        const menuButton = document.getElementById('menuButton');
        if (menuContent && menuButton && !menuContent.contains(event.target) && !menuButton.contains(event.target)) {
            menuContent.classList.remove('show');
        }
    });
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    apiManager = new BinanceAPIManager();
    await apiManager.init();
    loadAppState();
    setupEventListeners();

    // Инициализация watchlist
    if (document.getElementById('long-input')) {
        initializeSortableLists();
        loadTickersFromStorage();
        setInterval(updateAllPrices, 10000);
    }

    // Инициализация алертов
    if (document.getElementById('alertForm')) {
        await loadMarketData();
        loadUserAlerts(currentAlertFilter);
        setInterval(checkAlerts, 2000);
        setInterval(updateCurrentPrices, 5000);
        updateCurrentPrices();
    }

    // Проверка авторизации
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser && currentUser.email) {
        updateUserUI(currentUser.email);
    }
});

// Глобальные функции
window.copyToClipboard = copyToClipboard;
window.addTicker = addTicker;
window.clearAllTickers = clearAllTickers;
window.removeTicker = removeTicker;
window.editTicker = editTicker;
window.editComment = editComment;
window.saveComment = saveComment;
window.closeCommentModal = closeCommentModal;
window.closeModal = closeModal;
window.confirmManualPrice = confirmManualPrice;
window.rateTicker = rateTicker;
window.moveTickerUp = moveTickerUp;
window.moveTickerDown = moveTickerDown;
window.toggleMenu = toggleMenu;
window.openTradingViewChart = openTradingViewChart;
window.closeChartModal = closeChartModal;
window.deleteAlert = deleteAlert;
window.applyCurrentPrice = applyCurrentPrice;
window.applyCurrentPriceForEdit = applyCurrentPriceForEdit;
window.editAlert = editAlert;
window.closeEditModal = closeEditModal;
window.reactivateAlert = reactivateAlert;
window.exportAlertToTelegram = exportAlertToTelegram;
window.exportAllActiveAlerts = exportAllActiveAlerts;
