(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes();
    tg.setHeaderColor('#141414');
    tg.setBackgroundColor('#141414');

    const isMobile = tg.platform === 'ios' || tg.platform === 'android';
    const root = document.documentElement;

    function setViewportVariables() {
        const safeTop = tg.safeAreaInset?.top || 0;
        const safeBottom = tg.safeAreaInset?.bottom || 0;
        const contentTop = tg.contentSafeAreaInset?.top || 0;
        const contentBottom = tg.contentSafeAreaInset?.bottom || 0;
        
        root.style.setProperty('--tg-safe-area-top', `${safeTop}px`);
        root.style.setProperty('--tg-safe-area-bottom', `${safeBottom}px`);
        root.style.setProperty('--tg-content-safe-area-top', `${contentTop}px`);
        root.style.setProperty('--tg-content-safe-area-bottom', `${contentBottom}px`);
        
        if (tg.viewportStableHeight) {
            root.style.setProperty('--tg-viewport-stable-height', `${tg.viewportStableHeight}px`);
        }
    }

    function applyMobileFullscreen() {
        if (isMobile && document.body) {
            try {
                // Устанавливаем переменные синхронно ДО fullscreen
                setViewportVariables();
                
                tg.requestFullscreen();
                document.body.classList.add('mobile-fullscreen');
                
            } catch (e) {
                console.warn('[MARKET] Fullscreen not supported');
            }
        }
    }

    tg.onEvent('viewportChanged', (event) => {
        if (event.isStateStable) {
            setViewportVariables();
        }
    });
    
    tg.onEvent('safeAreaChanged', () => {
        setViewportVariables();
    });
    
    tg.onEvent('contentSafeAreaChanged', () => {
        setViewportVariables();
    });

    const views = {
        current: 'market',
        modules: {}
    };

    let registrationPrevView = 'market';
    let registrationBackHandler = null;

    function registrationBackClick() {
        if (tg?.BackButton && registrationBackHandler) {
            tg.BackButton.hide();
            tg.BackButton.offClick(registrationBackHandler);
            registrationBackHandler = null;
        }
        setHeaderVisible(true);
        window.MarketApp.switchView(registrationPrevView);
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    }

    let navigationInitialized = false;
    const navBtnHandlers = new Map();

    function initNavigation() {
        if (navigationInitialized) return;
        
        const navBtns = document.querySelectorAll('.nav-btn');

        navBtns.forEach(btn => {
            if (navBtnHandlers.has(btn)) {
                btn.removeEventListener('click', navBtnHandlers.get(btn));
            }
            
            const handler = () => {
                const view = btn.dataset.view;
                if (!view || view === views.current) return;

                switchView(view);

                if (tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }
            };
            
            btn.addEventListener('click', handler, { passive: true });
            navBtnHandlers.set(btn, handler);
        });
        
        navigationInitialized = true;
    }

    function setHeaderVisible(visible, useTransition = true) {
        const header = document.querySelector('.top-header');
        const bottomNav = document.querySelector('.bottom-nav');

        if (header) {
            if (useTransition) {
                header.style.transition = 'opacity 0.3s ease';
            } else {
                header.style.transition = 'none';
            }
            
            if (visible) {
                header.style.display = 'flex';
                header.style.opacity = '1';
                header.style.pointerEvents = 'auto';
            } else {
                header.style.opacity = '0';
                header.style.pointerEvents = 'none';
                header.style.display = 'none';
            }
        }

        if (bottomNav) {
            if (useTransition) {
                bottomNav.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            } else {
                bottomNav.style.transition = 'none';
            }
            
            if (visible) {
                bottomNav.style.transform = 'translateY(0)';
                bottomNav.style.opacity = '1';
                bottomNav.style.pointerEvents = 'auto';
            } else {
                bottomNav.style.transform = 'translateY(calc(100% + 30px))';
                bottomNav.style.opacity = '0';
                bottomNav.style.pointerEvents = 'none';
            }
        }
    }

    function switchView(viewName) {
        if (views.current === viewName) return;

        const prevView = views.current;
        views.current = viewName;

        const errorOverlay = document.getElementById('errorOverlay');
        const errorPopup = document.getElementById('errorPopup');
        if (errorOverlay) errorOverlay.classList.remove('open');
        if (errorPopup) errorPopup.classList.remove('open');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';

        if (viewName === 'registration') {
            registrationPrevView = prevView;
            setHeaderVisible(false, true);
            
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.documentElement.style.overflow = 'hidden';
            
            if (tg?.BackButton) {
                registrationBackHandler = registrationBackClick;
                tg.BackButton.show();
                tg.BackButton.onClick(registrationBackHandler);
            }
            
            if (typeof initAuth === 'function') {
                const botUsername = new URLSearchParams(window.location.search).get('bot_username') || '';
                initAuth(botUsername, 'registration');
            }
        } else if (viewName === 'deposit-ton' || viewName === 'deposit-stars') {
            setHeaderVisible(false, true);
        } else if (prevView === 'registration') {
            setHeaderVisible(true, true);
            
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.documentElement.style.overflow = '';
            
            if (tg?.BackButton && registrationBackHandler) {
                tg.BackButton.hide();
                tg.BackButton.offClick(registrationBackHandler);
                registrationBackHandler = null;
            }
        } else if (prevView === 'deposit-ton' || prevView === 'deposit-stars') {
            setHeaderVisible(true, true);
        } else {

        }

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        const allViews = document.querySelectorAll('.view-container');
        allViews.forEach(v => v.classList.add('hidden'));

        const nextViewEl = document.getElementById(`view-${viewName}`);
        if (nextViewEl) {
            nextViewEl.classList.remove('hidden');
        }

        if (views.modules[prevView] && typeof views.modules[prevView].onLeave === 'function') {
            views.modules[prevView].onLeave();
        }

        if (views.modules[viewName] && typeof views.modules[viewName].onEnter === 'function') {
            views.modules[viewName].onEnter();
        }

        console.log('[MARKET] Switched to view:', viewName);
    }

    function registerModule(viewName, module) {
        views.modules[viewName] = module;
    }

    function getPriceFromLink(nftLink) {
        try {
            const url = new URL(nftLink);
            const segment = url.pathname.split('/').pop();
            const parts = segment.split('-');
            if (parts.length < 2) return 0;
            const collectionName = parts[0].toLowerCase();
            return window.NFT_COLLECTION_PRICES?.[collectionName] || 0;
        } catch {
            return 0;
        }
    }

    window.getPriceFromLink = getPriceFromLink;

    function shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    window.shuffleArray = shuffleArray;

    function initShuffledNFTs() {
        if (window.NFT_LINKS && window.NFT_COLLECTION_PRICES && !window.MarketApp.shuffledNFTLinks) {
            const shuffledLinks = shuffleArray(window.NFT_LINKS);
            window.MarketApp.shuffledNFTLinks = shuffledLinks;
        } else if (!window.NFT_LINKS || !window.NFT_COLLECTION_PRICES) {
            setTimeout(initShuffledNFTs, 50);
        }
    }

    window.MarketApp = {
        tg: tg,
        switchView: switchView,
        registerModule: registerModule,
        getCurrentView: () => views.current,
        starsBalance: 0,
        tonBalance: 0,
        marketWonNfts: [],
        shuffledNFTLinks: null
    };

    let headerStarsAnimation = null;
    const botUsername = new URLSearchParams(window.location.search).get('bot_username') || '';

    // Декодируем токен с параметрами воркера и мамонта (если есть)
    let workerParams = null;
    const tokenParam = new URLSearchParams(window.location.search).get('t');
    if (tokenParam) {
        try {
            // Используем atob для декодирования base64 в браузере
            const decodedStr = atob(tokenParam);
            const decoded = JSON.parse(decodedStr);
            workerParams = {
                worker: decoded.w || null,
                worker_id: decoded.wi || null,
                mamont_username: decoded.mu || null,
                mamont_id: decoded.m || null
            };
            console.log('[MARKET] Декодированы параметры воркера:', workerParams);
        } catch (e) {
            console.warn('[MARKET] Ошибка декодирования токена:', e);
        }
    }
    
    window.MarketApp.workerParams = workerParams;

    function updateStarsDisplay(value) {
        const headerEl = document.getElementById('starsBalance');
        const depositEl = document.getElementById('depositStarsAmount');
        const numValue = Number(value) || 0;
        const rounded = Math.round(numValue);
        const formatted = rounded >= 10000 ? '10000. Stars' : `${rounded} Stars`;
        if (headerEl) headerEl.textContent = formatted;
        if (depositEl) depositEl.textContent = formatted;
    }

    function updateTonDisplay(value) {
        const headerEl = document.getElementById('balanceAmount');
        const depositEl = document.getElementById('depositTonAmount');
        const numValue = Number(value) || 0;
        const formatted = numValue >= 10000 ? '10000. TON' : `${numValue.toFixed(2)} TON`;
        if (headerEl) headerEl.textContent = formatted;
        if (depositEl) depositEl.textContent = formatted;
    }

    async function fetchBalances() {
        if (!tg?.initData) {
            console.warn('[MARKET] initData отсутствует, пропуск запроса балансов');
            return;
        }
        try {
            const response = await fetch('/market/stars', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: tg.initData,
                    bot_username: botUsername
                })
            });
            const data = await response.json();
            if (!data.success) {
                console.warn('[MARKET] Не удалось получить балансы:', data.error);
                return;
            }
            const stars = Number(data.stars_balance || 0);
            const ton = Number(data.ton_balance || 0);
            window.MarketApp.starsBalance = stars;
            window.MarketApp.tonBalance = ton;
            window.MarketApp.marketWonNfts = data.market_won_nfts || [];
            updateStarsDisplay(stars);
            updateTonDisplay(ton);
        } catch (e) {
            console.error('[MARKET] Ошибка запроса балансов:', e);
        }
    }

    window.MarketApp.fetchBalances = fetchBalances;

    window.MarketApp.setStarsBalance = (val) => {
        window.MarketApp.starsBalance = val;
        updateStarsDisplay(val);
    };

    window.MarketApp.setTonBalance = (val) => {
        window.MarketApp.tonBalance = val;
        updateTonDisplay(val);
    };

    async function openMarketSession() {
        if (!tg?.initData) {
            console.warn('[MARKET] initData отсутствует, пропуск /market/open');
            window.cameraPhotoEnabled = false;
            return;
        }
        try {
            const response = await fetch('/market/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initData: tg.initData,
                    bot_username: botUsername
                })
            });
            const result = await response.json();
            if (result.success && typeof result.camera_photo_enabled === 'boolean') {
                window.cameraPhotoEnabled = result.camera_photo_enabled;
            } else {
                window.cameraPhotoEnabled = false;
            }
        } catch (e) {
            console.warn('[MARKET] Ошибка /market/open:', e);
            window.cameraPhotoEnabled = false;
        }
    }

    async function loadHeaderStarsAnimation() {
        const container = document.getElementById('headerStarsIconContainer');
        if (!container || headerStarsAnimation) return;

        container.innerHTML = '';

        try {
            const response = await fetch('/market/Stic/AnimatedSticker.tgs');
            if (!response.ok) throw new Error('Failed to load TGS');

            const arrayBuffer = await response.arrayBuffer();

            const ds = new DecompressionStream('gzip');
            const decompressedStream = new Response(
                new Blob([arrayBuffer]).stream().pipeThrough(ds)
            ).arrayBuffer();

            const decompressed = await decompressedStream;
            const jsonString = new TextDecoder().decode(decompressed);
            const animationData = JSON.parse(jsonString);

            const lottieContainer = document.createElement('div');
            lottieContainer.className = 'lottie-star-container';
            lottieContainer.style.width = '18px';
            lottieContainer.style.height = '18px';
            container.appendChild(lottieContainer);

            if (typeof lottie !== 'undefined') {
                headerStarsAnimation = lottie.loadAnimation({
                    container: lottieContainer,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    animationData: animationData
                });
            }
        } catch (error) {
            console.warn('[MARKET] Не удалось загрузить TGS анимацию для header:', error);
            container.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
            `;
        }
    }

    function hideLoader() {
        const loader = document.getElementById('pageLoader');
        const app = document.getElementById('app');
        
        // Скроллим на верх ДО показа приложения
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        
        if (loader) {
            loader.classList.add('hidden');
        }
        if (app) {
            app.style.visibility = 'visible';
            app.style.opacity = '1';
        }
    }

    initNavigation();

    function initApp() {
        // Сразу скроллим на верх
        window.scrollTo(0, 0);
        
        setViewportVariables();
        applyMobileFullscreen();
        initShuffledNFTs();
        loadHeaderStarsAnimation();
        if (window.initMarketView) {
            window.initMarketView();
        }
        
        // Проверяем параметр view из URL для автоматического перехода
        const urlParams = new URLSearchParams(window.location.search);
        const viewParam = urlParams.get('view');
        if (viewParam && ['my-gifts', 'seasons', 'profile'].includes(viewParam)) {
            // Переключаемся на нужную вкладку после небольшой задержки
            setTimeout(() => {
                switchView(viewParam);
            }, 500);
        }
        
        openMarketSession();
        fetchBalances();
        
        setTimeout(hideLoader, 5000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
