// Merite WiFi - Login Page JavaScript

// API Endpoints
const API = {
    validateMsisdn: 'https://lucopay-backend.vercel.app/identity/msisdn',
    initializePayment: 'https://mintospay.vercel.app/v1/pay/initialize',
    verifyPayment: 'https://mintospay.vercel.app/v1/pay/verify',
    purchaseCode: 'https://merite-bill.vercel.app/api/purchase'
};

// Pricing Plans
const pricingPlans = [
    { duration: '3 HOURS', price: '500 UGX', amount: 500, data: '500 GB', popular: false },
    { duration: '24 HOURS', price: '950 UGX', amount: 950, data: '1TB', popular: false },
    { duration: '1 WEEK', price: '4,000 UGX', amount: 4000, data: 'Unlimited', popular: true },
    { duration: '15 DAYS', price: '9,000 UGX', amount: 9000, data: 'Unlimited', popular: false },
    { duration: '1 MONTH', price: '20,000 UGX', amount: 20000, data: 'Unlimited', popular: false },
];

// State
let isOnline = navigator.onLine;
let selectedPlan = null;
let validatedPhone = null;
let validatedIdentity = null;
let isPhoneValidated = false;
let isProcessingPayment = false;

// DOM Elements
const voucherForm = document.getElementById('voucherForm');
const voucherInput = document.getElementById('voucherInput');
const connectBtn = document.getElementById('connectBtn');
const errorMessage = document.getElementById('errorMessage');
const packagesGrid = document.getElementById('packagesGrid');
const trialBtn = document.getElementById('trialBtn');
const modal = document.getElementById('paymentModal');
const modalClose = document.getElementById('modalClose');
const phoneForm = document.getElementById('phoneForm');
const phoneInput = document.getElementById('phoneInput');
const payBtn = document.getElementById('payBtn');
const selectedPlanInfo = document.getElementById('selectedPlanInfo');
const validatedNameDiv = document.getElementById('validatedName');

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    window.addEventListener('online', () => { isOnline = true; });
    window.addEventListener('offline', () => { isOnline = false; });

    renderPackages();

    if (voucherForm) {
        voucherForm.addEventListener('submit', handleVoucherSubmit);
    }
    
    if (trialBtn) {
        trialBtn.addEventListener('click', handleTrialAccess);
    }

    if (modalClose) {
        modalClose.addEventListener('click', () => {
            if (!isProcessingPayment) closeModal();
        });
    }

    if (phoneForm) {
        phoneForm.addEventListener('submit', handlePaymentSubmit);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal && !isProcessingPayment) closeModal();
        });
    }

    // Listen for phone input changes to reset validation
    if (phoneInput) {
        phoneInput.addEventListener('input', () => {
            if (isPhoneValidated) {
                isPhoneValidated = false;
                validatedPhone = null;
                validatedIdentity = null;
                if (validatedNameDiv) validatedNameDiv.classList.add('hidden');
                if (payBtn) payBtn.textContent = 'Validate Number';
            }
        });
    }

    if (voucherInput) voucherInput.focus();
}

function renderPackages() {
    packagesGrid.innerHTML = '';

    pricingPlans.forEach((plan, index) => {
        const card = document.createElement('div');
        card.className = `package-card ${plan.popular ? 'popular' : ''}`;
        card.innerHTML = `
      ${plan.popular ? '<span class="package-badge">POPULAR</span>' : ''}
      <div class="package-duration">${plan.duration}</div>
      <div class="package-price">${plan.price}</div>
      <div class="package-data">${plan.data}</div>
    `;
        card.addEventListener('click', () => handlePackageClick(plan));
        packagesGrid.appendChild(card);
    });
}

function handleVoucherSubmit(e) {
    e.preventDefault();
    hideError();

    const voucher = voucherInput.value.trim();
    if (voucher.length < 3) {
        showError('Invalid code');
        voucherInput.focus();
        return;
    }

    setButtonLoading(connectBtn, true);

    // MIKROTIK REAL LOGIN
    if (window.chapId && document.sendin) {
        try {
            document.sendin.username.value = voucher;
            document.sendin.password.value = hexMD5(window.chapId + voucher + window.chapChallenge);
            document.sendin.submit();
            return;
        } catch (err) {
            console.error("Login error:", err);
            showError("Login Error: " + err.message);
            setButtonLoading(connectBtn, false);
            return;
        }
    }

    // Fallback for Local Testing (No MikroTik)
    setTimeout(() => {
        setButtonLoading(connectBtn, false);
        if (!window.chapId) {
            console.log("Simulating Login (No CHAP ID detected)");
        }

        // Simulate success
        if (voucher.length > 3) {
            const session = {
                username: `Voucher-${voucher.slice(0, 4).toUpperCase()}`,
                ip: `192.168.20.${Math.floor(Math.random() * 254) + 1}`,
                mac: 'AC:DE:48:00:11:22',
                loginMethod: 'voucher',
                connectedAt: new Date().toISOString()
            };
            localStorage.setItem('wifiSession', JSON.stringify(session));
            window.location.href = 'alogin.html';
        } else {
            showError('Code expired or invalid');
            voucherInput.focus();
        }
    }, 1200);
}

function handleTrialAccess() {
    if (!isOnline) {
        showError('No internet connection detected');
        return;
    }

    setButtonLoading(trialBtn, true, 'accent');

    setTimeout(() => {
        setButtonLoading(trialBtn, false);
        const session = {
            username: 'trial',
            ip: `10.5.50.${Math.floor(Math.random() * 254) + 1}`,
            mac: 'AC:DE:48:00:11:22',
            loginMethod: 'trial',
            connectedAt: new Date().toISOString()
        };
        localStorage.setItem('wifiSession', JSON.stringify(session));
        window.location.href = 'connection.html';
    }, 800);
}

function handlePackageClick(plan) {
    if (!isOnline) return;
    selectedPlan = plan;
    isPhoneValidated = false;
    validatedPhone = null;
    validatedIdentity = null;
    showModal();
}

function showModal() {
    selectedPlanInfo.innerHTML = `
    <span class="plan-name">${selectedPlan.duration}</span> - 
    <span class="plan-price">${selectedPlan.price}</span> 
    (${selectedPlan.data})
  `;
    phoneInput.value = '';
    validatedNameDiv.classList.add('hidden');
    payBtn.textContent = 'Validate Number';
    modal.classList.add('active');
    setTimeout(() => phoneInput.focus(), 100);
}

function closeModal() {
    if (isProcessingPayment) return; // Prevent closing during payment
    modal.classList.remove('active');
    selectedPlan = null;
    isPhoneValidated = false;
    validatedPhone = null;
    validatedIdentity = null;
    hideModalError();
}

// Format phone number to international format
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '256' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('256')) {
        cleaned = '256' + cleaned;
    }
    return '+' + cleaned;
}

// Format phone for payment API (local format)
function formatPhoneLocal(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('256')) {
        cleaned = '0' + cleaned.slice(3);
    }
    if (!cleaned.startsWith('0')) {
        cleaned = '0' + cleaned;
    }
    return cleaned;
}

// Generate unique reference
function generateReference() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Step 1: Validate phone number
async function validateMsisdn(phone) {
    const response = await fetch(API.validateMsisdn, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ msisdn: phone })
    });
    return response.json();
}

// Step 2: Initialize payment
async function initializePayment(amount, phone, reference) {
    const response = await fetch(API.initializePayment, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            amount: amount,
            callback_url: 'https://mintospay.vercel.app/webhook/callback',
            country: 'UG',
            description: `Merite WiFi - ${selectedPlan.duration} Package`,
            phone_number: phone,
            reference: reference
        })
    });
    return response.json();
}

// Step 3: Verify payment (with retries)
async function verifyPayment(uuid) {
    try {
        const response = await fetch(`${API.verifyPayment}/${uuid}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        // Return null on network errors to trigger retry
        console.warn('Verification request failed:', err.message);
        return null;
    }
}

// Step 4: Purchase/Issue voucher code
async function purchaseCode(amount, phone) {
    const response = await fetch(API.purchaseCode, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            amount: amount,
            phoneNumber: phone
        })
    });
    return response.json();
}

// Poll payment status with better error handling
async function pollPaymentStatus(uuid, maxAttempts = 60) {
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds

        const result = await verifyPayment(uuid);

        if (result === null) {
            // Network error
            consecutiveErrors++;
            if (consecutiveErrors >= maxConsecutiveErrors) {
                return { success: false, error: 'Network connection issues. Please check your internet.' };
            }
            updatePayButtonStatus(`Verifying... (retrying)`);
            continue;
        }

        // Reset error counter on successful request
        consecutiveErrors = 0;

        const status = result.data?.transaction?.status?.toLowerCase();

        if (status === 'success' || status === 'complete' || status === 'completed') {
            return { success: true, data: result.data };
        } else if (status === 'failed' || status === 'cancelled') {
            return { success: false, error: 'Payment failed or cancelled' };
        }

        // Still processing, continue polling
        updatePayButtonStatus(`Checking payment... (${i + 1})`);
    }

    return { success: false, error: 'Payment verification timeout. Please contact support.' };
}

function updatePayButtonStatus(text) {
    payBtn.innerHTML = `<span class="spinner"></span> ${text}`;
}

// Main payment handler - two-step process
async function handlePaymentSubmit(e) {
    e.preventDefault();

    const phone = phoneInput.value.trim();
    if (phone.length < 5) {
        showModalError('Please enter a valid phone number');
        return;
    }

    hideModalError();

    // Step 1: Validate phone number if not yet validated
    if (!isPhoneValidated) {
        setButtonLoading(payBtn, true);

        try {
            const internationalPhone = formatPhoneNumber(phone);
            const validation = await validateMsisdn(internationalPhone);

            if (!validation.success) {
                throw new Error(validation.message || 'Phone validation failed');
            }

            // Show validated name to user
            validatedIdentity = validation.identityname;
            validatedPhone = internationalPhone;
            isPhoneValidated = true;

            validatedNameDiv.innerHTML = `
        Account holder: <strong>${validatedIdentity}</strong>
      `;
            validatedNameDiv.classList.remove('hidden');

            setButtonLoading(payBtn, false);
            payBtn.textContent = 'Confirm & Pay';
            phoneInput.disabled = true;

        } catch (err) {
            console.error('Validation error:', err);
            setButtonLoading(payBtn, false);
            showModalError(err.message || 'Failed to validate phone number');
        }
        return;
    }

    // Step 2: Process payment (phone already validated)
    isProcessingPayment = true;
    setButtonLoading(payBtn, true);

    try {
        const localPhone = formatPhoneLocal(validatedPhone);

        // Initialize payment
        updatePayButtonStatus('Initiating...');
        const reference = generateReference();
        const payment = await initializePayment(selectedPlan.amount, localPhone, reference);

        if (payment.status !== 'success') {
            throw new Error(payment.message || 'Payment initialization failed');
        }

        const transactionUuid = payment.data.transaction.uuid;

        // Poll for payment completion
        updatePayButtonStatus('Waiting for payment...');
        const paymentResult = await pollPaymentStatus(transactionUuid);

        if (!paymentResult.success) {
            throw new Error(paymentResult.error || 'Payment verification failed');
        }

        // Issue voucher code
        updatePayButtonStatus('Issuing code...');
        const purchase = await purchaseCode(selectedPlan.amount, validatedPhone);

        if (!purchase.success) {
            throw new Error(purchase.message || 'Failed to issue voucher code');
        }

        // Success!
        isProcessingPayment = false;
        setButtonLoading(payBtn, false);
        phoneInput.disabled = false;
        closeModal();

        voucherInput.value = purchase.code;
        showSuccess(`✓ Payment successful! Code: ${purchase.code}. Connecting automatically...`);

        setTimeout(() => {
            // Trigger login automatically
            handleVoucherSubmit({ preventDefault: () => { } });
        }, 1500);

    } catch (err) {
        console.error('Payment error:', err);
        isProcessingPayment = false;
        setButtonLoading(payBtn, false);
        phoneInput.disabled = false;
        payBtn.textContent = 'Confirm & Pay';
        showModalError(err.message || 'Payment failed. Please try again.');
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    errorMessage.style.background = '';
    errorMessage.style.color = '';
    errorMessage.style.borderColor = '';
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showSuccess(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    errorMessage.style.background = '#113311';
    errorMessage.style.color = '#44ff44';
    errorMessage.style.borderColor = '#005500';

    setTimeout(() => {
        hideError();
    }, 8000);
}

function showModalError(message) {
    let modalError = document.getElementById('modalError');
    if (!modalError) {
        modalError = document.createElement('div');
        modalError.id = 'modalError';
        modalError.className = 'error-message';
        modalError.style.marginBottom = '1rem';
        const form = document.getElementById('phoneForm');
        form.parentNode.insertBefore(modalError, form);
    }
    modalError.textContent = message;
    modalError.classList.remove('hidden');
}

function hideModalError() {
    const modalError = document.getElementById('modalError');
    if (modalError) modalError.remove();
}

function setButtonLoading(button, loading, spinnerType = 'default') {
    const originalText = button.dataset.originalText || button.innerHTML;

    if (loading) {
        button.dataset.originalText = originalText;
        button.disabled = true;
        button.innerHTML = `<span class="spinner ${spinnerType === 'accent' ? 'accent' : ''}"></span>`;
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText;
        delete button.dataset.originalText;
    }
}
