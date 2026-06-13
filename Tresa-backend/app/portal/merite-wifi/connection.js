// Merite WiFi - Connection Page JavaScript

// State
let session = null;
let isOnline = navigator.onLine;
let elapsedTime = 0;
let dataPoints = [];
let currentSpeed = { up: 0, down: 0 };
let timers = {};

// DOM Elements
const sessionIp = document.getElementById('sessionIp');
const sessionIdDisplay = document.getElementById('sessionIdDisplay');
const statusDot = document.getElementById('statusDot');
const durationDisplay = document.getElementById('durationDisplay');
const downloadDisplay = document.getElementById('downloadDisplay');
const uploadDisplay = document.getElementById('uploadDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const chartCanvas = document.getElementById('chartCanvas');
const ctx = chartCanvas ? chartCanvas.getContext('2d') : null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Check for session
    const storedSession = localStorage.getItem('wifiSession');
    if (!storedSession) {
        window.location.href = 'login.html';
        return;
    }

    session = JSON.parse(storedSession);

    // Online/offline handlers
    window.addEventListener('online', () => {
        isOnline = true;
        statusDot.classList.remove('offline');
    });
    window.addEventListener('offline', () => {
        isOnline = false;
        statusDot.classList.add('offline');
    });

    // Update UI with session info
    sessionIp.textContent = session.ip;
    sessionIdDisplay.textContent = `Session ID: ${session.mac.slice(-8)}`;

    // Event listeners
    logoutBtn.addEventListener('click', handleLogout);

    // Start timers
    startTimers();

    // Resize canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function startTimers() {
    // Calculate elapsed time from session start
    const startTime = new Date(session.connectedAt);
    elapsedTime = Math.floor((Date.now() - startTime.getTime()) / 1000);

    // Duration timer
    timers.duration = setInterval(() => {
        elapsedTime++;
        durationDisplay.textContent = formatTime(elapsedTime);
    }, 1000);

    // Speed updates
    timers.speed = setInterval(() => {
        currentSpeed.down = Math.floor(Math.random() * 15) + 2;
        currentSpeed.up = Math.floor(Math.random() * 5) + 1;

        downloadDisplay.innerHTML = `${currentSpeed.down} <span class="stat-unit">Mbps</span>`;
        uploadDisplay.innerHTML = `${currentSpeed.up} <span class="stat-unit">Mbps</span>`;

        // Add data point
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        dataPoints.push({ time: timeStr, download: currentSpeed.down, upload: currentSpeed.up });
        if (dataPoints.length > 20) dataPoints.shift();

        drawChart();
    }, 2000);

    // Initial display
    durationDisplay.textContent = formatTime(elapsedTime);
}

function drawChart() {
    if (!ctx || dataPoints.length < 2) return;

    const width = chartCanvas.width;
    const height = chartCanvas.height;
    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(...dataPoints.map(d => d.download), 20);

    // Draw area
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);

    dataPoints.forEach((point, i) => {
        const x = padding + (i / (dataPoints.length - 1)) * chartWidth;
        const y = height - padding - (point.download / maxVal) * chartHeight;
        ctx.lineTo(x, y);
    });

    ctx.lineTo(padding + chartWidth, height - padding);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(245, 200, 66, 0.15)');
    gradient.addColorStop(1, 'rgba(245, 200, 66, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    dataPoints.forEach((point, i) => {
        const x = padding + (i / (dataPoints.length - 1)) * chartWidth;
        const y = height - padding - (point.download / maxVal) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#F5C842';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function handleLogout() {
    clearInterval(timers.duration);
    clearInterval(timers.speed);
    localStorage.removeItem('wifiSession');
    window.location.href = 'login.html';
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function resizeCanvas() {
    if (chartCanvas) {
        chartCanvas.width = chartCanvas.offsetWidth;
        chartCanvas.height = chartCanvas.offsetHeight;
        drawChart();
    }
}
