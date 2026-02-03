
const state = {
    cart: JSON.parse(localStorage.getItem('cart')) || [],
    gifts: [],
    sortOrder: 'desc'
};


const elements = {
    giftsGrid: document.getElementById('giftsGrid'),
    sortBtn: document.getElementById('sortBtn')
};


function init() {
    loadGifts();
    bindEvents();
    updateCartBadge();
}


async function loadGifts() {
    try {
        elements.giftsGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #666;"><div style="width: 40px; height: 40px; border: 3px solid rgba(14, 165, 233, 0.3); border-top-color: #0ea5e9; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div><p>Загрузка подарков...</p></div>';


        const response = await fetch('processed_links.txt');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        state.gifts = parseGiftsFromText(text);

        renderGifts(state.gifts);
    } catch (error) {
        console.error('Error loading gifts:', error);
        elements.giftsGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #ef4444;"><p style="font-size: 18px; margin-bottom: 8px;">Ошибка загрузки</p><p style="font-size: 14px;">Попробуйте обновить страницу</p></div>';
    }
}


function parseGiftsFromText(text) {
    const lines = text.split('\n');
    const gifts = [];

    for (const line of lines) {

        if (line.startsWith('#') || !line.trim()) continue;


        const match = line.match(/https:\/\/t\.me\/nft\/(\w+)-(\d+)\s*-\s*([\d.]+)\s*TON\s*\(([\d.]+)/);

        if (match) {
            const [, giftName, giftId, tonPrice, rubPrice] = match;


            const formattedName = giftName.replace(/([A-Z])/g, ' $1').trim();

            gifts.push({
                name: formattedName,
                originalName: giftName,
                id: giftId,
                tonPrice: parseFloat(tonPrice),
                rubPrice: parseFloat(rubPrice),
                imageUrl: `https://nft.fragment.com/gift/${giftName.toLowerCase()}-${giftId}.medium.jpg`,
                telegramUrl: `https://t.me/nft/${giftName}-${giftId}`
            });
        }
    }

    console.log(`✅ Loaded ${gifts.length} gifts`);
    return gifts;
}


function renderGifts(gifts) {
    elements.giftsGrid.innerHTML = '';

    if (gifts.length === 0) {
        elements.giftsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #666;">
                <p style="font-size: 18px; margin-bottom: 8px;">Подарки не найдены</p>
                <p style="font-size: 14px;">Попробуйте изменить фильтры</p>
            </div>
        `;
        return;
    }

    gifts.forEach(gift => {
        const card = createGiftCard(gift);
        elements.giftsGrid.appendChild(card);
    });
}


function createGiftCard(gift) {
    const card = document.createElement('div');
    const isInCart = state.cart.some(item => item.id === gift.id);

    card.className = 'gift-card';
    if (isInCart) {
        card.classList.add('in-cart');
    }

    card.innerHTML = `
        <div class="gift-image">
            <img src="${gift.imageUrl}" alt="${gift.name}" onerror="this.src='https://via.placeholder.com/200?text=Gift'">
            ${isInCart ? '<div class="cart-badge">В корзине</div>' : ''}
        </div>
        <div class="gift-info">
            <div class="gift-details">
                <div class="gift-name">${gift.name}</div>
                <div class="gift-id">#${gift.id}</div>
                <div class="gift-price">${gift.rubPrice.toFixed(2)} ₽</div>
            </div>
            <button class="cart-btn ${isInCart ? 'remove' : ''}" onclick="event.stopPropagation();">
                ${isInCart ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                ` : `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1" fill="currentColor"/>
                        <circle cx="20" cy="21" r="1" fill="currentColor"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
                    </svg>
                `}
            </button>
        </div>
    `;

    const btn = card.querySelector('.cart-btn');
    if (isInCart) {
        btn.addEventListener('click', () => removeFromCart(gift));
    } else {
        btn.addEventListener('click', () => addToCart(gift));
    }

    return card;
}


function addToCart(gift) {
    const exists = state.cart.find(item => item.id === gift.id);

    if (!exists) {
        state.cart.push({
            id: gift.id,
            name: gift.name,
            price: gift.rubPrice,
            image: gift.imageUrl,
            tonPrice: gift.tonPrice
        });
        localStorage.setItem('cart', JSON.stringify(state.cart));
        updateCartBadge();
        showNotification(`${gift.name} добавлен в корзину`, 'success');


        renderGifts(state.gifts);
    } else {
        showNotification('Этот подарок уже в корзине', 'info');
    }
}


function removeFromCart(gift) {
    state.cart = state.cart.filter(item => item.id !== gift.id);
    localStorage.setItem('cart', JSON.stringify(state.cart));
    updateCartBadge();
    showNotification(`${gift.name} удален из корзины`, 'info');


    renderGifts(state.gifts);
}


function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    if (badge) {
        badge.textContent = state.cart.length;
        badge.style.display = state.cart.length > 0 ? 'block' : 'none';
    }
}


function toggleSort() {

    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';

    let sorted = [...state.gifts];

    if (state.sortOrder === 'asc') {
        sorted.sort((a, b) => a.rubPrice - b.rubPrice);
    } else {
        sorted.sort((a, b) => b.rubPrice - a.rubPrice);
    }

    renderGifts(sorted);


    if (elements.sortBtn) {
        if (state.sortOrder === 'desc') {
            elements.sortBtn.classList.add('desc');
        } else {
            elements.sortBtn.classList.remove('desc');
        }
    }
}


function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#0ea5e9'};
        color: white;
        border-radius: 12px;
        font-weight: 600;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}


function bindEvents() {

    if (elements.sortBtn) {
        elements.sortBtn.addEventListener('click', toggleSort);
    }


    const filterToggle = document.getElementById('filterToggle');
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            populateGiftFilters();
            const filterModal = document.getElementById('filterModal');
            if (filterModal) filterModal.classList.add('active');
        });
    }


    const filterClose = document.getElementById('filterClose');
    if (filterClose) {
        filterClose.addEventListener('click', () => {
            const filterModal = document.getElementById('filterModal');
            if (filterModal) filterModal.classList.remove('active');
        });
    }


    const giftDropdownToggle = document.getElementById('giftDropdownToggle');
    const giftDropdown = document.getElementById('giftDropdown');
    if (giftDropdownToggle && giftDropdown) {
        giftDropdownToggle.addEventListener('click', () => {
            const isOpen = giftDropdown.style.display === 'block';
            giftDropdown.style.display = isOpen ? 'none' : 'block';
            giftDropdownToggle.classList.toggle('open', !isOpen);
        });
    }


    const btnApplyFilters = document.getElementById('btnApplyFilters');
    if (btnApplyFilters) {
        btnApplyFilters.addEventListener('click', () => {
            applyFilters();
            const filterModal = document.getElementById('filterModal');
            if (filterModal) filterModal.classList.remove('active');
        });
    }


    const btnClearFilters = document.getElementById('btnClearFilters');
    if (btnClearFilters) {
        btnClearFilters.addEventListener('click', () => {

            document.querySelectorAll('#giftDropdown input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            document.getElementById('filterGiftId').value = '';
            document.getElementById('filterPriceFrom').value = '';
            document.getElementById('filterPriceTo').value = '';
            document.getElementById('giftDropdownToggle').textContent = 'Все';


            renderGifts(state.gifts);
            showNotification('Фильтры очищены', 'info');
        });
    }
}


function populateGiftFilters() {
    const giftDropdown = document.getElementById('giftDropdown');
    if (!giftDropdown || giftDropdown.children.length > 0) return;


    const uniqueGifts = [...new Set(state.gifts.map(g => g.name))].sort();

    uniqueGifts.forEach(giftName => {
        const checkbox = document.createElement('div');
        checkbox.className = 'filter-checkbox';
        checkbox.innerHTML = `
            <input type="checkbox" id="gift_${giftName.replace(/\s/g, '_')}" value="${giftName}">
            <label for="gift_${giftName.replace(/\s/g, '_')}">${giftName}</label>
        `;
        giftDropdown.appendChild(checkbox);
    });
}


function applyFilters() {
    let filtered = [...state.gifts];


    const selectedGifts = [];
    document.querySelectorAll('#giftDropdown input[type="checkbox"]:checked').forEach(cb => {
        selectedGifts.push(cb.value);
    });

    if (selectedGifts.length > 0) {
        filtered = filtered.filter(gift => selectedGifts.includes(gift.name));
    }


    const giftId = document.getElementById('filterGiftId').value.trim();
    if (giftId) {
        const cleanId = giftId.replace('#', '');
        filtered = filtered.filter(gift => gift.id.includes(cleanId));
    }


    const priceFrom = parseFloat(document.getElementById('filterPriceFrom').value);
    if (!isNaN(priceFrom)) {
        filtered = filtered.filter(gift => gift.rubPrice >= priceFrom);
    }


    const priceTo = parseFloat(document.getElementById('filterPriceTo').value);
    if (!isNaN(priceTo)) {
        filtered = filtered.filter(gift => gift.rubPrice <= priceTo);
    }


    renderGifts(filtered);


    const giftDropdownToggle = document.getElementById('giftDropdownToggle');
    if (selectedGifts.length > 0) {
        giftDropdownToggle.textContent = `Выбрано: ${selectedGifts.length}`;
    } else {
        giftDropdownToggle.textContent = 'Все';
    }

    showNotification(`Найдено подарков: ${filtered.length}`, 'success');
}


document.addEventListener('DOMContentLoaded', init);

