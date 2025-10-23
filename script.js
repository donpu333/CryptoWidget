// Конфигурация API
const API_CONFIG = {
    RECONNECT_INTERVAL: 5000,
    TIMEOUT: 10000,
    MAX_RETRIES: 3,
    ENDPOINTS: {
        TEST: 'https://api.binance.com/api/v3/ping',
        FUTURES: 'https://fapi.binance.com',
        SPOT: 'https://api.binance.com/api/v3',
        HISTORICAL: 'https://api.binance.com/api/v3/klines',
        ALL_TICKERS: 'https://api.binance.com/api/v3/exchangeInfo'
    },
    PRICE_COMPARISON_EPSILON: 0.00000001,
    TREND_ANALYSIS_PERIOD: 14 // Days for trend analysis
};

const TG_BOT_TOKEN = '8044055704:AAGk8cQFayPqYCscLlEB3qGRj0Uw_NTpe30';

// Объект для хранения данных о тикерах
const tickersData = {
    'long': {},
    'short': {},
    'long-wait': {},
    'short-wait': {}
};

// Кэш для всех тикеров Binance
let allBinanceTickers = {};
let tickersLoaded = false;

// Переменные для модальных окон
const priceModal = document.getElementById('priceModal');
const modalTicker = document.getElementById('modalTicker');
const priceInput = document.getElementById('priceInput');
const changeInput = document.getElementById('changeInput');
const commentModal = document.getElementById('commentModal');
const commentModalTicker = document.getElementById('commentModalTicker');
const commentInput = document.getElementById('commentInput');
let currentTicker = '';
let currentListType = '';

// Переменная для хранения виджета TradingView
let tradingViewWidget = null;
let apiManager;

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

// Переменные для алертов
let userAlerts = [];
let currentAlertFilter = 'active';
let alertCooldowns = {};
let activeTriggeredAlerts = {};
let currentPrices = {};

// Объект для отслеживания мерцающих тикеров в списках вотчлиста
const blinkingTickers = {
    'long': new Set(),
    'short': new Set(),
    'long-wait': new Set(),
    'short-wait': new Set()
};

// Объект для отслеживания активных сработавших алертов (постоянное мерцание)
const activeBlinkingAlerts = new Set();

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
            console.log('Loaded all Binance tickers:', Object.keys(allBinanceTickers).length);
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
                : `${API_CONFIG.ENDPOINTS.SPOT}/v3/ticker/price?symbol=${symbol}`;
            const response = await this._fetchWithTimeout(endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
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
                : `${API_CONFIG.ENDPOINTS.SPOT}/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
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

// Функции для работы с тикерами
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Успех', `Тикер ${text} скопирован в буфер`);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        showNotification('Ошибка', 'Не удалось скопировать тикер');
    });
}

function initializeSortableLists() {
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
                const type = panel.classList.contains('long') ? 'long' :
                            panel.classList.contains('short') ? 'short' :
                            panel.classList.contains('long-wait') ? 'long-wait' : 'short-wait';
                addTicker(type);
            }
        });
        
        input.addEventListener('input', function(e) {
            const panel = this.closest('.panel');
            const type = panel.classList.contains('long') ? 'long' :
                        panel.classList.contains('short') ? 'short' :
                        panel.classList.contains('long-wait') ? 'long-wait' : 'short-wait';
            showTickerSuggestions(this.value.trim().toUpperCase(), type);
        });
        
        input.addEventListener('blur', function() {
            setTimeout(() => {
                const panel = this.closest('.panel');
                const type = panel.classList.contains('long') ? 'long' :
                            panel.classList.contains('short') ? 'short' :
                            panel.classList.contains('long-wait') ? 'long-wait' : 'short-wait';
                document.getElementById(`${type}-suggestions`).style.display = 'none';
            }, 200);
        });
    });
}

function showTickerSuggestions(query, listType) {
    const suggestionsContainer = document.getElementById(`${listType}-suggestions`);
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
                    list.innerHTML = '';
                    for (const ticker in parsedData[listType]) {
                        if (parsedData[listType].hasOwnProperty(ticker)) {
                            addTickerToList(ticker, listType);
                        }
                    }
                    sortTickersByStars(listType);
                }
            }
            updateStats();
        } catch (e) {
            console.error('Ошибка при загрузке данных из localStorage:', e);
        }
    }
}

function saveTickersToStorage() {
    try {
        localStorage.setItem('cryptoDashboardTickers', JSON.stringify(tickersData));
        updateStats();
    } catch (e) {
        console.error('Ошибка при сохранении данных в localStorage:', e);
    }
}

function sortTickersByStars(listType) {
    const list = document.getElementById(`${listType}-list`);
    if (!list) return;

    const items = Array.from(list.children)
        .filter(item => item.classList.contains('ticker-item'))
        .sort((a, b) => {
            const aStars = tickersData[listType][a.dataset.ticker].stars || 0;
            const bStars = tickersData[listType][b.dataset.ticker].stars || 0;
            return bStars - aStars;
        });

    list.innerHTML = '';
    items.forEach(item => list.appendChild(item));
}

async function addTicker(listType) {
    const input = document.getElementById(`${listType}-input`);
    const errorElement = document.getElementById(`${listType}-error`);
    let ticker = input.value.trim().toUpperCase();
    
    ticker = ticker.replace(/[^A-Z0-9.]/g, '');
    if (!ticker) {
        showError(errorElement, 'Введите тикер');
        return;
    }
    
    if (ticker.includes('.P')) {
        ticker = ticker.replace('.P', '');
    } else if (!ticker.endsWith('USDT')) {
        ticker += 'USDT';
    }
    
    if (tickersData[listType][ticker]) {
        showError(errorElement, 'Этот тикер уже добавлен');
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
            let apiUrl;
            const marketType = tickersData[listType][ticker].marketType;
            if (marketType === 'futures') {
                apiUrl = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${ticker}`;
            } else {
                apiUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${ticker}`;
            }
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
    addTickerToList(ticker, listType);
    saveTickersToStorage();
    input.value = '';
    hideError(errorElement);
    document.getElementById(`${listType}-suggestions`).style.display = 'none';
    
    if (!tickersData[listType][ticker].isBinance) {
        editTicker(ticker, listType);
    }
    
    sortTickersByStars(listType);
}

function addTickerToList(ticker, listType) {
    const list = document.getElementById(`${listType}-list`);
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
    commentModalTicker.textContent = ticker;
    commentInput.value = tickerData.comment || '';
    commentModal.style.display = 'flex';
}

function saveComment() {
    const comment = commentInput.value.trim();
    tickersData[currentListType][currentTicker].comment = comment;

    const listItem = document.querySelector(`.ticker-item[data-ticker="${currentTicker}"][data-list-type="${currentListType}"]`);
    if (listItem) {
        const commentBtn = listItem.querySelector('.comment-btn');
        const hasComment = comment !== '';

        const icon = commentBtn.querySelector('i');
        icon.className = hasComment ? 'fas fa-comment' : 'fas fa-comment-dots';

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

    saveTickersToStorage();
    closeCommentModal();
}

function closeCommentModal() {
    commentModal.style.display = 'none';
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
    sortTickersByStars(listType);
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
    modalTicker.textContent = ticker;
    priceInput.value = tickerData.price;
    changeInput.value = tickerData.change;
    priceModal.style.display = 'flex';
}

function closeModal() {
    priceModal.style.display = 'none';
}

function confirmManualPrice() {
    const price = parseFloat(priceInput.value);
    const change = parseFloat(changeInput.value) || 0;
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
        listItem.querySelector('.price-value').innerHTML = `$${tickerData.price} <span class="price-change ${changeClass}">${tickerData.change}%</span>`;
        listItem.querySelector('.added-date').textContent = formattedDate;
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
        document.getElementById(`${listType}-list`).innerHTML = '';
        saveTickersToStorage();
    }
}

async function updateTickerPrice(ticker, listType) {
    const tickerData = tickersData[listType][ticker];
    if (!tickerData.isBinance) return;
    
    try {
        let apiUrl;
        const marketType = tickerData.marketType;
        if (marketType === 'futures') {
            apiUrl = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${ticker}`;
        } else {
            apiUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${ticker}`;
        }
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
    
    document.getElementById('total-tickers').textContent = totalTickers;
    document.getElementById('long-count').textContent = longCount;
    document.getElementById('short-count').textContent = shortCount;
    document.getElementById('long-wait-count').textContent = longWaitCount;
    document.getElementById('short-wait-count').textContent = shortWaitCount;
}

function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 3000);
}

function hideError(element) {
    element.style.display = 'none';
}

function openTradingViewChart(ticker, listType) {
    currentTicker = ticker;
    currentListType = listType;
    
    const tickerData = tickersData[listType][ticker];
    let displayTicker = ticker;
    
    if (tickerData.marketType === 'futures') {
        displayTicker = ticker + '.P';
    }

    document.getElementById('chartModalTitle').textContent = displayTicker;
    document.getElementById('chartModal').style.display = 'flex';
    document.getElementById('chartError').classList.add('hidden');

    loadTradingViewWidget(displayTicker);
}

function loadTradingViewWidget(ticker) {
    const widgetContainer = document.getElementById('tradingview-widget');
    widgetContainer.innerHTML = '';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.onload = () => {
        document.getElementById('chartError').classList.add('hidden');
    };
    script.onerror = () => {
        document.getElementById('chartError').classList.remove('hidden');
    };

    script.innerHTML = JSON.stringify({
        "allow_symbol_change": true,
        "calendar": false,
        "details": false,
        "hide_side_toolbar": false,
        "hide_top_toolbar": false,
        "hide_legend": false,
        "hide_volume": false,
        "hotlist": false,
        "interval": "D",
        "locale": "ru",
        "save_image": true,
        "style": "0",
        "symbol": `BINANCE:${ticker}`,
        "theme": "dark",
        "timezone": "Etc/UTC",
        "backgroundColor": "rgba(0, 0, 0, 1)",
        "gridColor": "rgba(0, 0, 0, 0)",
        "watchlist": [],
        "withdateranges": false,
        "compareSymbols": [],
        "studies": [],
        "autosize": true
    });

    widgetContainer.appendChild(script);
}

function closeChartModal() {
    document.getElementById('chartModal').style.display = 'none';
}

// Функции для мерцания
function startTickerBlinking(symbol, watchlistType, condition) {
    if (!watchlistType || watchlistType === 'none') return;
    
    blinkingTickers[watchlistType].add(symbol);
    
    const tickerElement = document.querySelector(`.ticker-item[data-ticker="${symbol}"][data-list-type="${watchlistType}"]`);
    if (!tickerElement) return;
    
    const blinkClass = condition === '>' ? 'blinking-long' : 'blinking-short';
    tickerElement.classList.add(blinkClass);
    
    console.log(`Запущено мерцание для ${symbol} в списке ${watchlistType}`);
}

function stopTickerBlinking(symbol, watchlistType) {
    if (!watchlistType || watchlistType === 'none') return;
    
    blinkingTickers[watchlistType].delete(symbol);
    
    const tickerElement = document.querySelector(`.ticker-item[data-ticker="${symbol}"][data-list-type="${watchlistType}"]`);
    if (tickerElement) {
        tickerElement.classList.remove('blinking-long', 'blinking-short');
    }
    
    console.log(`Остановлено мерцание для ${symbol} в списке ${watchlistType}`);
}

function startAlertBlinking(alertId, condition) {
    const alertElement = document.getElementById(`alert-${alertId}`);
    if (!alertElement) return;
    
    activeBlinkingAlerts.add(alertId);
    
    const blinkClass = condition === '>' ? 'alert-triggered-long' : 'alert-triggered-short';
    alertElement.classList.add(blinkClass);
    
    console.log(`Запущено постоянное мерцание для алерта ${alertId}`);
}

function stopAlertBlinking(alertId) {
    const alertElement = document.getElementById(`alert-${alertId}`);
    if (alertElement) {
        alertElement.classList.remove('alert-triggered-long', 'alert-triggered-short');
    }
    
    activeBlinkingAlerts.delete(alertId);
    
    console.log(`Остановлено мерцание для алерта ${alertId}`);
}

function hasAllNotificationsSent(alert) {
    if (alert.notificationCount === 0) return false;
    return alert.triggeredCount >= alert.notificationCount;
}

function restoreBlinkingAlerts() {
    userAlerts.forEach(alert => {
        // Восстанавливаем мерцание для активных сработавших алертов
        if (alert.triggeredCount > 0 && !hasAllNotificationsSent(alert)) {
            startAlertBlinking(alert.id, alert.condition);
            if (alert.watchlistType && alert.watchlistType !== 'none') {
                startTickerBlinking(alert.symbol, alert.watchlistType, alert.condition);
            }
        }
        
        // Восстанавливаем мерцание для сработавших алертов (triggered = true)
        if (alert.triggered && !hasAllNotificationsSent(alert)) {
            startAlertBlinking(alert.id, alert.condition);
            if (alert.watchlistType && alert.watchlistType !== 'none') {
                startTickerBlinking(alert.symbol, alert.watchlistType, alert.condition);
            }
        }
    });
}

// Функции для алертов
function saveTriggeredAlert(alert) {
    const history = JSON.parse(localStorage.getItem('triggeredAlertsHistory') || '[]');
    history.push({
        ...alert,
        triggeredAt: new Date().toISOString()
    });
    localStorage.setItem('triggeredAlertsHistory', JSON.stringify(history));
}

function loadTriggeredAlerts() {
    return JSON.parse(localStorage.getItem('triggeredAlertsHistory') || '[]');
}

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
        console.log("Состояние сохранено");
        return true;
    } catch (error) {
        console.error("Ошибка при сохранении состояния:", error);
        return false;
    }
}

function loadAppState() {
    try {
        const savedAlerts = localStorage.getItem('cryptoAlerts');
        if (savedAlerts) {
            userAlerts = JSON.parse(savedAlerts);
        }

        const savedFilter = localStorage.getItem('alertFilter');
        if (savedFilter) {
            currentAlertFilter = savedFilter;
        }

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
            const price = await apiManager.getCurrentPrice(alert.symbol, alert.marketType);
            if (price === null) continue;

            const conditionMet = comparePrices(price, alert.condition, alert.value);

            if (conditionMet) {
                const cooldownKey = `${alert.symbol}_${alert.condition}_${alert.value}`;
                const lastNotification = alertCooldowns[cooldownKey] || 0;

                if (now - lastNotification > 60000) {
                    console.log(`Alert triggered: ${alert.symbol} ${alert.condition} ${alert.value} | Current: ${price} | Time: ${new Date().toISOString()}`);

                    // Запускаем мерцание
                    if (alert.watchlistType && alert.watchlistType !== 'none') {
                        startTickerBlinking(alert.symbol, alert.watchlistType, alert.condition);
                    }

                    startAlertBlinking(alert.id, alert.condition);

                    // Отправка уведомлений
                    await handleTriggeredAlert(alert, price);
                    alertCooldowns[cooldownKey] = now;
                    activeTriggeredAlerts[alert.id] = true;

                    // Увеличиваем счетчик срабатываний
                    alert.triggeredCount = (alert.triggeredCount || 0) + 1;

                    // Проверяем лимит уведомлений
                    if (alert.notificationCount > 0 && alert.triggeredCount >= alert.notificationCount) {
                        alert.triggered = true;
                        if (alert.watchlistType && alert.watchlistType !== 'none') {
                            stopTickerBlinking(alert.symbol, alert.watchlistType);
                        }
                        stopAlertBlinking(alert.id);
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

async function handleTriggeredAlert(alert, currentPrice) {
    const message = `🚨 Алерт сработал!\nСимвол: ${alert.symbol}\n` +
        `Условие: ${alert.condition} ${alert.value}\n` +
        `Текущая цена: ${formatNumber(currentPrice, 8)}`;

    // Отправка в Telegram
    if (alert.notificationMethods.includes('telegram') && alert.chatId) {
        try {
            await sendTelegramNotification(message, alert.chatId);
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

function formatNumber(num, decimals) {
    return parseFloat(num.toFixed(decimals));
}

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
    if (allBinanceTickers[symbol]) {
        return allBinanceTickers[symbol].type;
    }
    
    const futuresMatch = Object.keys(popularTickers).find(key => 
        key === symbol && popularTickers[key].type === 'futures'
    );
    if (futuresMatch) return 'futures';

    const spotMatch = Object.keys(popularTickers).find(key => 
        key === symbol && popularTickers[key].type === 'spot'
    );
    if (spotMatch) return 'spot';

    return 'spot';
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
    if (telegramCheckbox && telegramCheckbox.checked) {
        const chatId = localStorage.getItem('tg_chat_id') || document.getElementById('userChatId')?.value;
        if (!chatId) {
            showBotConnectionHint();
            isValid = false;
        }
    }

    const coinSearch = document.getElementById('coinSearch');
    const symbol = document.getElementById('symbol');
    if (!coinSearch || !symbol || !coinSearch.value.trim() || !symbol.value) {
        showValidationError('coinSearch', 'Пожалуйста, выберите криптовалюту');
        isValid = false;
    } else {
        hideValidationError('coinSearch');
    }

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

    const symbolValue = symbol.value;
    const conditionValue = document.getElementById('condition').value;
    if (symbolValue && conditionValue && value.value && isDuplicateAlert(symbolValue, conditionValue, value.value)) {
        showValidationError('value', 'Такой алерт уже существует');
        isValid = false;
    }

    if (telegramCheckbox && telegramCheckbox.checked) {
        const userChatId = document.getElementById('userChatId');
        if (!userChatId || !userChatId.value.trim()) {
            showValidationError('userChatId', 'Пожалуйста, укажите Telegram Chat ID');
            isValid = false;
        }
    }

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

let allFutures = [];
let allSpot = [];

async function loadMarketData() {
    try {
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

    hideValidationError('coinSearch');
    hideValidationError('value');

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

function addTickerToWatchlist(symbol, watchlistType) {
    if (!tickersData[watchlistType][symbol]) {
        const now = new Date();
        const isBinanceTicker = allBinanceTickers.hasOwnProperty(symbol);
        
        tickersData[watchlistType][symbol] = {
            name: isBinanceTicker ? allBinanceTickers[symbol].name : symbol.replace(/USDT$/, ''),
            price: '0.000000',
            change: '0.00',
            isBinance: isBinanceTicker,
            addedDate: now.toISOString(),
            stars: 0,
            marketType: isBinanceTicker ? allBinanceTickers[symbol].type : 'spot',
            comment: '',
            trend: null
        };

        const list = document.getElementById(`${watchlistType}-list`);
        addTickerToList(symbol, watchlistType);
        saveTickersToStorage();
        sortTickersByStars(watchlistType);
        
        console.log(`Тикер ${symbol} добавлен в список ${watchlistType}`);
    }
}

async function addUserAlert(symbol, type, condition, value, notificationMethods, notificationCount, chatId, watchlistType = null) {
    try {
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
            lastNotificationTime: 0,
            marketType,
            watchlistType: watchlistType
        };

        userAlerts.push(newAlert);
        saveAppState();

        if (watchlistType && watchlistType !== 'none') {
            addTickerToWatchlist(symbol, watchlistType);
        }

        loadUserAlerts(currentAlertFilter);
        
        showNotification('Успешно', `Алерт для ${symbol} создан`);
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
        const aTriggered = activeBlinkingAlerts.has(a.id) || false;
        const bTriggered = activeBlinkingAlerts.has(b.id) || false;

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
        const isActiveTriggered = activeBlinkingAlerts.has(alert.id) && !isHistory;
        const currentPrice = currentPrices[alert.symbol] || 'Загрузка...';

        const priceDisplay = !isHistory ? `
            <div class="current-price-container mt-2">
                <span class="current-price-label">Текущая цена:</span>
                <span class="current-price-value">${currentPrice}</span>
            </div>
        ` : '';

        const watchlistBadge = alert.watchlistType && alert.watchlistType !== 'none' ? `
            <span class="watchlist-badge ${alert.watchlistType}">
                ${getWatchlistTypeName(alert.watchlistType)}
            </span>
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
                                        ${watchlistBadge}
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

    updateAlertsCounter();
}

function getWatchlistTypeName(watchlistType) {
    const names = {
        'long': 'Пробой лонг',
        'short': 'Пробой шорт', 
        'long-wait': 'Ложный пробой лонг',
        'short-wait': 'Ложный пробой шорт'
    };
    return names[watchlistType] || watchlistType;
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
        stopAlertBlinking(alertId);
        saveAppState();
        loadUserAlerts(currentAlertFilter);
        showNotification('Успешно', 'Алерт удален');
    }
}

function clearAllAlerts() {
    if (confirm('Вы уверены, что хотите удалить все алерты?')) {
        userAlerts = [];
        activeTriggeredAlerts = {};
        activeBlinkingAlerts.clear();
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
    
    if (alert.watchlistType && alert.watchlistType !== 'none') {
        stopTickerBlinking(alert.symbol, alert.watchlistType);
    }
    stopAlertBlinking(alertId);
    
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
                <label class="block text-gray-300 text-sm font-medium mb-2">Вотчлист</label>
                <select id="editWatchlistType" class="w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary">
                    <option value="none" ${!alert.watchlistType || alert.watchlistType === 'none' ? 'selected' : ''}>Не добавлять в вотчлист</option>
                    <option value="long" ${alert.watchlistType === 'long' ? 'selected' : ''}>Пробой лонг</option>
                    <option value="short" ${alert.watchlistType === 'short' ? 'selected' : ''}>Пробой шорт</option>
                    <option value="long-wait" ${alert.watchlistType === 'long-wait' ? 'selected' : ''}>Ложный пробой лонг</option>
                    <option value="short-wait" ${alert.watchlistType === 'short-wait' ? 'selected' : ''}>Ложный пробой шорт</option>
                </select>
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
        if (price !== null) {
            const currentPriceValue = document.getElementById('editCurrentPriceValue');
            if (currentPriceValue) {
                currentPriceValue.textContent = price;
            }
        }
    });

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
    const watchlistType = document.getElementById('editWatchlistType')?.value;
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
        marketType: getMarketTypeBySymbol(symbol),
        watchlistType: watchlistType
    };

    userAlerts = userAlerts.map(a => a.id === parseInt(alertId) ? updatedAlert : a);
    
    const oldAlert = userAlerts.find(a => a.id === parseInt(alertId));
    if (oldAlert && oldAlert.watchlistType !== watchlistType) {
        if (oldAlert.watchlistType && oldAlert.watchlistType !== 'none') {
            stopTickerBlinking(symbol, oldAlert.watchlistType);
            delete tickersData[oldAlert.watchlistType][symbol];
        }
        if (watchlistType && watchlistType !== 'none') {
            addTickerToWatchlist(symbol, watchlistType);
        }
        saveTickersToStorage();
    }

    saveAppState();

    if (useEmail) {
        localStorage.setItem('userEmail', userEmail);
    }

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

function showBotConnectionHint() {
    const modal = document.getElementById('botConnectionHint');
    if (modal) modal.classList.add('active');
}

function closeBotConnectionHint() {
    const modal = document.getElementById('botConnectionHint');
    if (modal) modal.classList.remove('active');
}

function toggleMenu() {
    const menuContent = document.getElementById('menuContent');
    if (menuContent) {
        menuContent.classList.toggle('show');
    }
}

function showCalculator() {
    toggleMenu();
    window.location.href = 'calculator.html';
}

function showAlerts() {
    toggleMenu();
    window.location.href = 'alerts.html';
}

function showWidget() {
    toggleMenu();
    window.location.href = 'widget.html';
}

function showMainPage() {
    toggleMenu();
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

        const telegramCheckbox = document.getElementById('telegram');
        if (telegramCheckbox) {
            telegramCheckbox.checked = true;
        }

        const emailCheckbox = document.getElementById('email');
        if (emailCheckbox) {
            emailCheckbox.checked = false;
        }

        const watchlistType = document.getElementById('watchlistType');
        if (watchlistType) {
            watchlistType.value = 'none';
        }

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

        const notificationCountSelect = document.getElementById('notificationCount');
        if (notificationCountSelect) {
            notificationCountSelect.value = '5';
        }

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

            hideValidationError('coinSearch');

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

            const telegramCheckbox = document.getElementById('telegram');
            if (telegramCheckbox && telegramCheckbox.checked && !localStorage.getItem('tg_chat_id')) {
                showBotConnectionHint();
                return;
            }

            if (!validateForm()) return;

            const symbol = document.getElementById('symbol')?.value;
            const alertType = document.getElementById('alertType')?.value;
            const condition = document.getElementById('condition')?.value;
            const value = document.getElementById('value')?.value;
            const watchlistType = document.getElementById('watchlistType')?.value;
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
                    marketType: getMarketTypeBySymbol(symbol),
                    watchlistType: watchlistType
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
                const success = await addUserAlert(symbol, alertType, condition, value, notificationMethods, notificationCount, userChatId, watchlistType);
                if (success) {
                    showNotification('Успешно', `Алерт для ${symbol} создан`);
                    resetForm();
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

                const useTelegram = document.getElementById('telegram')?.checked || false;
                const useEmail = document.getElementById('email')?.checked || false;
                const userChatId = useTelegram ? (localStorage.getItem('tg_chat_id') || document.getElementById('userChatId')?.value) : null;
                const userEmail = useEmail ? document.getElementById('userEmail')?.value : null;
                const notificationCount = document.getElementById('notificationCount')?.value || '5';
                const alertType = document.getElementById('alertType')?.value || 'price';
                const watchlistType = document.getElementById('watchlistType')?.value || 'none';

                const notificationMethods = [];
                if (useTelegram) notificationMethods.push('telegram');
                if (useEmail) notificationMethods.push('email');

                if (notificationMethods.length === 0) {
                    showNotification('Ошибка', 'Выберите хотя бы один метод уведомлений перед импортом');
                    return;
                }

                if (notificationMethods.includes('telegram') && !userChatId) {
                    showBotConnectionHint();
                    return;
                }

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

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

                    const isFutures = allFutures.some(f => f.symbol === symbol);
                    if (!isFutures) {
                        skippedCount++;
                        continue;
                    }

                    const success = await addUserAlert(
                        symbol,
                        alertType,
                        condition,
                        parseFloat(value),
                        notificationMethods,
                        notificationCount,
                        userChatId,
                        watchlistType
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

                event.target.value = '';
            };
            reader.readAsText(file);
        });
    }

    const menuButton = document.getElementById('menuButton');
    if (menuButton) {
        menuButton.addEventListener('click', toggleMenu);
    }

    window.addEventListener('click', function(event) {
        const menuContent = document.getElementById('menuContent');
        const menuButton = document.getElementById('menuButton');

        if (menuContent && menuButton &&
            !menuContent.contains(event.target) &&
            !menuButton.contains(event.target)) {
            menuContent.classList.remove('show');
        }
    });

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
        
        // Восстанавливаем мерцание при загрузке страницы
        restoreBlinkingAlerts();

        const savedChatId = localStorage.getItem('tg_chat_id');
        if (savedChatId) {
            const userChatId = document.getElementById('userChatId');
            if (userChatId) {
                userChatId.value = savedChatId;
            }
        }

        const savedEmail = localStorage.getItem('userEmail');
        if (savedEmail) {
            const userEmail = document.getElementById('userEmail');
            if (userEmail) {
                userEmail.value = savedEmail;
            }
        }

        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser && currentUser.email) {
            updateUserUI(currentUser.email);
        }

        setInterval(checkAlerts, 2000);
        setInterval(updateCurrentPrices, 5000);
        updateCurrentPrices();

        initializeSortableLists();
        setupInputHandlers();
        loadTickersFromStorage();
        updateStats();
        setInterval(updateAllPrices, 10000);
        
        const menuButton = document.getElementById('menuButton');
        if (menuButton) {
            menuButton.addEventListener('click', toggleMenu);
        }
        
        window.addEventListener('click', function(event) {
            const menuContent = document.getElementById('menuContent');
            const menuButton = document.getElementById('menuButton');
            if (menuContent && menuButton &&
                !menuContent.contains(event.target) &&
                !menuButton.contains(event.target)) {
                menuContent.classList.remove('show');
            }
        });
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showNotification('Critical Error', 'Failed to connect to Binance API');
    }
});

// Глобальные функции для вызова из HTML
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
