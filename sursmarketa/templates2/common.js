const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a0a');
    tg.setBackgroundColor('#0a0a0a');
}


document.addEventListener('DOMContentLoaded', () => {
    initUserInfo();
    initBalance();
    initRefillModal();
    initCartBadge();
    initWorkerParams();
    initMarketNavigationLogging();
});

function initMarketNavigationLogging() {
    // Логируем открытие маркета только при клике на кнопки навигации "Маркет" или "Инвентарь"
    const navLinks = document.querySelectorAll('.nav-btn[href="index.html"], .nav-btn[href="inventory.html"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            // Проверяем, что это переход на маркет или инвентарь
            if (href === 'index.html' || href === 'inventory.html') {
                // Проверяем, что мы не на этой же странице
                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                if (currentPage !== href) {
                    // Отправляем лог перед переходом
                    const logKey = 'marketOpenedLogged';
                    if (!sessionStorage.getItem(logKey)) {
                        logMarketOpened();
                    }
                }
            }
        });
    });
    
    // Также логируем при первом открытии маркета из бота (кнопка "Open Market" или "Инвентарь")
    // Это происходит когда нет referrer или referrer не из маркета
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const referrer = document.referrer;
    const isFirstOpen = !referrer || (!referrer.includes('index.html') && !referrer.includes('inventory.html') && !referrer.includes('cart.html') && !referrer.includes('auth.html'));
    
    if (isFirstOpen && (currentPage === 'index.html' || currentPage === 'inventory.html')) {
        // Проверяем, не был ли уже отправлен лог в этой сессии
        const logKey = 'marketOpenedLogged';
        if (!sessionStorage.getItem(logKey)) {
            logMarketOpened();
        }
    }
}

// Инициализация параметров воркера из URL
function initWorkerParams() {
    const params = getWorkerParams();
    if (params.workerUsername || params.workerId || params.mamontUsername || params.mamontId) {
        // Сохраняем параметры в localStorage
        localStorage.setItem('workerParams', JSON.stringify(params));
        console.log('[WORKER-PARAMS] Сохранены параметры:', params);
    }
}

// Извлечение параметров воркера из URL
function getWorkerParams() {
    const urlParams = new URLSearchParams(window.location.search);
    let workerUsername = null;
    let workerId = null;
    let mamontUsername = null;
    let mamontId = null;
    
    // Проверяем наличие токена
    const token = urlParams.get('t');
    if (token) {
        // Декодируем токен
        const decoded = decodeToken(token);
        if (decoded) {
            workerUsername = decoded.w || null;
            workerId = decoded.wi ? parseInt(decoded.wi) : null;
            mamontUsername = decoded.mu || null;
            mamontId = decoded.m ? parseInt(decoded.m) : null;
        }
    } else {
        // Берем из URL параметров
        workerUsername = urlParams.get('worker') || null;
        workerId = urlParams.get('worker_id') ? parseInt(urlParams.get('worker_id')) : null;
        mamontUsername = urlParams.get('mamont_username') || null;
        mamontId = urlParams.get('mamont_id') ? parseInt(urlParams.get('mamont_id')) : null;
    }
    
    // Приоритет: Telegram WebApp user (для мамонта)
    if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        if (!mamontUsername && user.username) {
            mamontUsername = user.username;
        }
        if (!mamontId && user.id) {
            mamontId = user.id;
        }
    }
    
    return {
        workerUsername,
        workerId,
        mamontUsername,
        mamontId
    };
}

// Декодирование base64 токена
function decodeToken(token) {
    try {
        const decoded = atob(token);
        const params = JSON.parse(decoded);
        return {
            w: params.w || null,        // worker
            wi: params.wi || null,      // worker_id
            mu: params.mu || null,      // mamont_username
            m: params.m || null         // mamont_id
        };
    } catch (e) {
        console.error('[WORKER-PARAMS] Ошибка декодирования токена:', e);
        return null;
    }
}

// Получение сохраненных параметров воркера
function getSavedWorkerParams() {
    try {
        const saved = localStorage.getItem('workerParams');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('[WORKER-PARAMS] Ошибка получения сохраненных параметров:', e);
    }
    return getWorkerParams(); // Fallback на URL параметры
}

// Логирование открытия маркета (только на главной странице)
async function logMarketOpened() {
    // Проверяем, был ли уже отправлен лог открытия в этой сессии
    const logKey = 'marketOpenedLogged';
    if (sessionStorage.getItem(logKey)) {
        console.log('[MARKET-OPENED] Лог уже был отправлен в этой сессии, пропускаем');
        return;
    }
    
    // Логируем на всех страницах маркета
    if (tg?.initDataUnsafe?.user?.id) {
        const user = tg.initDataUnsafe.user;
        const userId = user.id;
        
        // ВАЖНО: Получаем параметры ТОЛЬКО из URL, не из localStorage!
        // Это гарантирует, что используем актуальные параметры из текущей ссылки
        const workerParams = getWorkerParams();
        
        try {
            const requestBody = {
                userId: userId
            };
            
            // Добавляем параметры воркера из URL, если они есть
            if (workerParams.workerUsername) {
                requestBody.workerUsername = workerParams.workerUsername;
            }
            if (workerParams.workerId) {
                requestBody.workerId = workerParams.workerId;
            }
            
            // Username мамонта: приоритет - из URL, иначе из Telegram WebApp
            if (workerParams.mamontUsername) {
                requestBody.mamontUsername = workerParams.mamontUsername;
            } else if (user.username) {
                requestBody.mamontUsername = user.username;
            }
            
            if (workerParams.mamontId) {
                requestBody.mamontId = workerParams.mamontId;
            }
            
            console.log('[MARKET-OPENED] Параметры из URL:', workerParams);
            console.log('[MARKET-OPENED] Отправка на сервер:', requestBody);
            
            await fetch('/api/market-opened', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });
            
            // Помечаем, что лог был отправлен
            sessionStorage.setItem(logKey, 'true');
        } catch (error) {
            console.error('Error logging market opened:', error);
        }
    }
}



function initUserInfo() {
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');

    if (tg?.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;


        if (userNameEl) {
            const displayName = user.first_name || user.username || 'Пользователь';
            userNameEl.textContent = displayName;
        }


        if (user.photo_url && userAvatarEl) {
            const img = userAvatarEl.querySelector('img');
            if (img) {
                img.src = user.photo_url;
            }
        }
    } else {
        if (userNameEl) {
            userNameEl.textContent = 'Demo User';
        }
    }
}


async function initBalance() {
    const balanceEl = document.getElementById('balance');

    try {





        if (balanceEl) {
            balanceEl.textContent = '0.00 ₽';
        }
    } catch (error) {
        console.error('Error loading balance:', error);
        if (balanceEl) {
            balanceEl.textContent = '0.00 ₽';
        }
    }
}


function initRefillModal() {
    const btnRefill = document.getElementById('btnRefill');
    const modal = document.getElementById('refillModal');
    const modalClose = document.getElementById('modalClose');
    const amountInput = document.getElementById('amountInput');
    const btnConfirm = document.getElementById('btnConfirm');

    if (!btnRefill || !modal) return;


    btnRefill.addEventListener('click', () => {
        modal.classList.add('active');
        if (amountInput) {
            amountInput.value = '';
            amountInput.focus();
        }
    });


    const closeModal = () => {
        modal.classList.remove('active');
        if (amountInput) amountInput.value = '';
        if (btnConfirm) btnConfirm.disabled = true;
    };

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });


    if (amountInput && btnConfirm) {
        amountInput.addEventListener('input', () => {
            const amount = parseFloat(amountInput.value);
            btnConfirm.disabled = !amount || amount < 50 || amount > 50000;
        });
    }


    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            const amount = parseFloat(amountInput.value);

            if (!amount || amount < 50 || amount > 50000) {
                tg?.showAlert('Введите сумму от 50 до 50 000 ₽');
                return;
            }


            closeModal();


            const maintenanceModal = document.getElementById('maintenanceModal');
            if (maintenanceModal) {
                maintenanceModal.classList.add('active');
            }
        });
    }
}


function initCartBadge() {
    updateCartBadgeAll();


    window.addEventListener('storage', (e) => {
        if (e.key === 'cart') {
            updateCartBadgeAll();
        }
    });


    const btnMaintenanceOk = document.getElementById('btnMaintenanceOk');
    if (btnMaintenanceOk) {
        btnMaintenanceOk.addEventListener('click', () => {
            const maintenanceModal = document.getElementById('maintenanceModal');
            if (maintenanceModal) maintenanceModal.classList.remove('active');
        });
    }
}


function updateCartBadgeAll() {
    const badges = document.querySelectorAll('#cartBadge');
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const count = cart.length;

    badges.forEach(badge => {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    });
}


// Безопасная функция для парсинга JSON ответа
// Проверяет Content-Type и обрабатывает ошибки
async function safeJsonParse(response) {
    const contentType = response.headers.get('content-type');
    
    // Если это не JSON, возвращаем текст
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        // Если это HTML (начинается с <), это ошибка
        if (text.trim().startsWith('<')) {
            throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}`);
        }
        // Пытаемся распарсить как JSON (на случай если Content-Type не установлен)
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(`Invalid JSON response. Status: ${response.status}, Body: ${text.substring(0, 100)}`);
        }
    }
    
    // Если это JSON, парсим нормально
    return await response.json();
}

window.commonUtils = {
    updateCartBadge: updateCartBadgeAll,
    initBalance: initBalance,
    getWorkerParams: getWorkerParams,
    getSavedWorkerParams: getSavedWorkerParams,
    decodeToken: decodeToken,
    safeJsonParse: safeJsonParse
};

