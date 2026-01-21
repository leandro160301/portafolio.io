/**
 * Portfolio Pro - Main Logic
 * Uses Firebase Firestore for persistence.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, setDoc, deleteDoc, doc, updateDoc, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAYxxlZRsao6upp6ZWODenfNWM-vvQXbXU",
    authDomain: "portafolio-personal-a2ea1.firebaseapp.com",
    projectId: "portafolio-personal-a2ea1",
    storageBucket: "portafolio-personal-a2ea1.firebasestorage.app",
    messagingSenderId: "283586972859",
    appId: "1:283586972859:web:c63e31f760794d541ded9e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- State Management ---
const AppData = {
    symbols: [],    // { ticker: string, ratio: number, _id: string }
    operations: [],  // { id, date, ticker, type, qty, mep, amount, _id: string }
    assets: []      // { id, name, value, _id: string }
};

const LAST_MEP_KEY = 'portfolio_pro_last_mep';
let portfolioChart = null; // Chart.js instance
let netWorthChart = null; // Net Worth Chart instance
let reportsChart = null; // Reports Chart instance
let currentCurrency = 'ARS'; // State for dashboard currency
let reportFreq = 'YEAR'; // 'YEAR' or 'MONTH'

// --- Security / Password Management ---
const SETTINGS_DOC_ID = 'app_settings';
let currentPassword = null; // Cached password from Firestore
let isAuthenticated = false;

/**
 * Load password from Firestore
 */
async function loadPasswordFromFirestore() {
    try {
        const settingsRef = doc(db, 'settings', SETTINGS_DOC_ID);
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            if (data && data.password) {
                currentPassword = data.password;
                return data.password;
            }
        }
        return null;
    } catch (e) {
        console.error('Error loading password from Firestore:', e);
        return null;
    }
}

/**
 * Save password to Firestore
 */
async function savePasswordToFirestore(password) {
    try {
        const settingsRef = doc(db, 'settings', SETTINGS_DOC_ID);
        await setDoc(settingsRef, { password: password || '' });
        currentPassword = password || null;
        console.log('Password saved to Firestore');
        return true;
    } catch (e) {
        console.error('Error saving password to Firestore:', e);
        alert('Error al guardar la contraseña en la base de datos.');
        return false;
    }
}

/**
 * Show login overlay
 */
function showLoginScreen() {
    const overlay = document.getElementById('login-overlay');
    const appContainer = document.querySelector('.app-container');

    overlay.style.display = 'flex';
    appContainer.style.filter = 'blur(10px)';
    appContainer.style.pointerEvents = 'none';

    // Focus on password input
    setTimeout(() => {
        document.getElementById('login-pass').focus();
    }, 100);
}

/**
 * Hide login overlay
 */
function hideLoginScreen() {
    const overlay = document.getElementById('login-overlay');
    const appContainer = document.querySelector('.app-container');

    overlay.style.display = 'none';
    appContainer.style.filter = 'none';
    appContainer.style.pointerEvents = 'auto';

    // Clear login input
    document.getElementById('login-pass').value = '';
    document.getElementById('login-error').style.display = 'none';
}

/**
 * Check authentication and show login if needed
 */
async function checkAuthenticationOnLoad() {
    const password = await loadPasswordFromFirestore();
    const loadingOverlay = document.getElementById('loading-overlay');
    const appContainer = document.querySelector('.app-container');

    if (password && password.trim() !== '') {
        // Password exists, require login
        showLoginScreen();
        isAuthenticated = false;
    } else {
        // No password set, allow access
        isAuthenticated = true;
        hideLoginScreen();
    }

    // Fade out loading, fade in app
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 300);
    }

    if (appContainer) {
        appContainer.style.opacity = '1';
    }
}

/**
 * Handle login form submission
 */
function setupLoginHandler() {
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const enteredPassword = document.getElementById('login-pass').value;

        if (enteredPassword === currentPassword) {
            // Correct password
            isAuthenticated = true;
            hideLoginScreen();
        } else {
            // Wrong password
            loginError.style.display = 'block';
            document.getElementById('login-pass').value = '';
            document.getElementById('login-pass').focus();

            // Shake animation
            const loginCard = document.querySelector('.login-card');
            loginCard.style.animation = 'shake 0.5s';
            setTimeout(() => {
                loginCard.style.animation = '';
            }, 500);
        }
    });
}

/**
 * Handle security form (change password)
 */
function setupSecurityForm() {
    const securityForm = document.getElementById('security-form');
    const oldPassGroup = document.getElementById('old-pass-group');

    securityForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const oldPass = document.getElementById('sec-old-pass').value;
        const newPass = document.getElementById('sec-new-pass').value;

        // If there's a current password, verify old password
        if (currentPassword && currentPassword.trim() !== '') {
            if (oldPass !== currentPassword) {
                alert('La contraseña actual es incorrecta.');
                return;
            }
        }

        // Save new password (empty string removes password)
        const success = await savePasswordToFirestore(newPass);

        if (success) {
            if (newPass && newPass.trim() !== '') {
                alert('Contraseña actualizada correctamente.');
                // Show old password field for next time
                oldPassGroup.style.display = 'block';
            } else {
                alert('Seguridad desactivada.');
                oldPassGroup.style.display = 'none';
            }

            // Reset form
            securityForm.reset();
        }
    });

    // Show/hide old password field based on current state
    if (currentPassword && currentPassword.trim() !== '') {
        oldPassGroup.style.display = 'block';
    } else {
        oldPassGroup.style.display = 'none';
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Setup security handlers first
    setupLoginHandler();

    // Check authentication
    await checkAuthenticationOnLoad();

    // Setup security form after password is loaded
    setupSecurityForm();

    // Continue with normal initialization
    initUI();
    loadLastMep();
    loadData().then(() => {
        renderAll();
    });
    setupEventListeners();
});

// --- Firestore Data Operations ---

async function loadData() {
    try {
        // Load Symbols
        const symSnap = await getDocs(collection(db, "symbols"));
        AppData.symbols = [];
        symSnap.forEach(doc => {
            AppData.symbols.push({ ...doc.data(), _id: doc.id });
        });

        // Load Operations
        const opSnap = await getDocs(collection(db, "operations"));
        AppData.operations = [];
        opSnap.forEach(doc => {
            AppData.operations.push({ ...doc.data(), _id: doc.id });
        });

        // Load Assets
        const assetSnap = await getDocs(collection(db, "assets"));
        AppData.assets = [];
        assetSnap.forEach(doc => {
            AppData.assets.push({ ...doc.data(), _id: doc.id });
        });

        console.log("Data loaded from Firestore");
    } catch (e) {
        console.error("Error loading data from Firestore:", e);
        alert("Error cargando datos de la base de datos.");
    }
}

async function addSymbolToDB(symbolData) {
    try {
        // Use ticker as Doc ID
        await setDoc(doc(db, "symbols", symbolData.ticker), symbolData);
        // Update local state
        AppData.symbols.push({ ...symbolData, _id: symbolData.ticker });
        renderAll();
    } catch (e) {
        console.error("Error adding symbol:", e);
        alert("Error al guardar la acción.");
    }
}

async function deleteSymbolFromDB(ticker, index) {
    try {
        await deleteDoc(doc(db, "symbols", ticker));
        AppData.symbols.splice(index, 1);
        renderAll();
    } catch (e) {
        console.error("Error deleting symbol:", e);
        // Fallback: reload data
        loadData().then(renderAll);
        alert("Error al borrar la acción.");
    }
}

async function addOperationToDB(opData) {
    try {
        // Use op document ID if provided (from import/update), else auto-gen ID is fine, but we use op.id (timestamp) as ID
        const docId = String(opData.id);
        await setDoc(doc(db, "operations", docId), opData);

        // Update local
        const existingIdx = AppData.operations.findIndex(o => o.id === opData.id);
        if (existingIdx !== -1) {
            AppData.operations[existingIdx] = { ...opData, _id: docId };
        } else {
            AppData.operations.push({ ...opData, _id: docId });
        }
        renderAll();
    } catch (e) {
        console.error("Error saving operation:", e);
        alert("Error al guardar la operación.");
    }
}

async function deleteOperationFromDB(id, docId) {
    try {
        await deleteDoc(doc(db, "operations", String(docId)));
        AppData.operations = AppData.operations.filter(op => op.id !== id);
        renderAll();
    } catch (e) {
        console.error("Error deleting operation:", e);
        alert("Error al borrar la operación.");
    }
}

async function addAssetToDB(assetData) {
    try {
        const docId = String(assetData.id);
        await setDoc(doc(db, "assets", docId), assetData);
        AppData.assets.push({ ...assetData, _id: docId });
        renderAll();
    } catch (e) {
        console.error("Error saving asset:", e);
        alert("Error al guardar el activo.");
    }
}

async function deleteAssetFromDB(id, docId) {
    try {
        await deleteDoc(doc(db, "assets", String(docId)));
        AppData.assets = AppData.assets.filter(a => a.id !== id);
        renderAll();
    } catch (e) {
        console.error("Error deleting asset:", e);
        alert("Error al borrar el activo.");
    }
}


function loadLastMep() {
    const lastMep = localStorage.getItem(LAST_MEP_KEY);
    if (lastMep) {
        document.getElementById('op-mep').value = lastMep;
    }
}

function renderAll() {
    renderDashboard();
    renderNetWorth();
    renderReports();
    renderSymbolsTable();
    updateSymbolDropdown();
    renderOperationsTable();
    renderAssetsTable();
    updateDateDisplay();
}

// --- UI Rendering ---

function updateDateDisplay() {
    const now = new Date();
    document.getElementById('current-date').textContent = now.toLocaleDateString();
}

function initUI() {
    // Navigation
    const tabs = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.view');
    const title = document.getElementById('page-title');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');

            const titles = {
                'dashboard': 'Resumen del Portafolio',
                'networth': 'Patrimonio Global',
                'reports': 'Reporte de Movimientos',
                'symbols': 'Configuración de Acciones',
                'operations': 'Registro de Operaciones',
                'assets': 'Gestión de Otros Activos',
                'settings': 'Gestión de Datos'
            };
            title.textContent = titles[targetId];
        });
    });

    // Mobile Sidebar Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }

    // Close on overlay click
    overlay.addEventListener('click', toggleSidebar);

    // Close on nav item click (mobile only)
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            }
        });
    });
}

function renderSymbolsTable() {
    const tbody = document.querySelector('#symbols-table tbody');
    tbody.innerHTML = '';

    if (AppData.symbols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-secondary)">No hay acciones configuradas</td></tr>';
        return;
    }

    AppData.symbols.sort((a, b) => a.ticker.localeCompare(b.ticker)).forEach((sym, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${sym.ticker}</td>
            <td>${sym.ratio}%</td>
            <td>
                <button class="btn-icon delete" onclick="deleteSymbol(${index})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('total-symbols').textContent = AppData.symbols.length;
}

function updateSymbolDropdown() {
    const select = document.getElementById('op-symbol');
    const currentVal = select.value;

    select.innerHTML = '<option value="" disabled selected>Seleccionar...</option>';

    AppData.symbols.sort((a, b) => a.ticker.localeCompare(b.ticker)).forEach(sym => {
        const opt = document.createElement('option');
        opt.value = sym.ticker;
        opt.textContent = sym.ticker;
        select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
}

function renderOperationsTable() {
    const tbody = document.querySelector('#operations-table tbody');
    tbody.innerHTML = '';

    const sortedOps = [...AppData.operations].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sortedOps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary)">No hay operaciones registradas</td></tr>';
    } else {
        sortedOps.forEach((op) => {
            const tr = document.createElement('tr');
            const isBuy = op.type === 'BUY';
            const color = isBuy ? 'var(--success)' : 'var(--danger)';
            const icon = isBuy ? 'fa-arrow-down' : 'fa-arrow-up';

            const formattedAmount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(op.amount || 0);
            const formattedMep = op.mep ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(op.mep) : '-';

            tr.innerHTML = `
                <td>${formatDate(op.date)}</td>
                <td style="font-weight:600">${op.ticker}</td>
                <td style="color:${color}"><i class="fa-solid ${icon}"></i> ${op.type === 'BUY' ? 'Compra' : 'Venta'}</td>
                <td>${op.qty}</td>
                <td>${formattedAmount}</td>
                <td>${formattedMep}</td>
                <td>
                    <button class="btn-icon" onclick="editOperation(${op.id})" title="Editar">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-icon delete" onclick="deleteOperation(${op.id})" title="Borrar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('total-ops').textContent = AppData.operations.length;
}

function renderAssetsTable() {
    const tbody = document.querySelector('#assets-table tbody');
    tbody.innerHTML = '';

    let totalVal = 0;

    if (AppData.assets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-secondary)">No hay activos registrados</td></tr>';
    } else {
        AppData.assets.forEach((asset) => {
            totalVal += asset.value;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${asset.name}</td>
                <td>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(asset.value)}</td>
                <td>
                    <button class="btn-icon delete" onclick="deleteAsset(${asset.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('total-assets-value').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalVal);
}

function renderDashboard() {
    const holdings = {};
    const costBasisComp = {}; // Track estimated cost basis per symbol (Computed based on currency)

    // Init totals
    let totalInvestedComp = 0;

    // Process Operations
    AppData.operations.forEach(op => {
        const ticker = op.ticker;
        const qty = parseInt(op.qty) || 0;
        let amount = parseFloat(op.amount) || 0;

        // Contextualize Amount based on Currency
        if (currentCurrency === 'USD') {
            const mep = op.mep && op.mep > 0 ? op.mep : 1;
            if (op.mep && op.mep > 0) {
                amount = amount / op.mep;
            } else {
                amount = 0;
            }
        }

        if (!holdings[ticker]) holdings[ticker] = 0;
        if (!costBasisComp[ticker]) costBasisComp[ticker] = 0;

        if (op.type === 'BUY') {
            holdings[ticker] += qty;
            costBasisComp[ticker] += amount;
            totalInvestedComp += amount;
        } else {
            // Sell logic
            holdings[ticker] -= qty;
            totalInvestedComp -= amount;
            costBasisComp[ticker] -= amount;
        }
    });

    // Valid Symbols + Zombies
    const tableData = [];
    const chartLabels = [];
    const chartData = [];
    const chartColors = [];

    // Combine symbols list with holdings
    const allTickers = new Set([...AppData.symbols.map(s => s.ticker), ...Object.keys(holdings)]);

    // First pass to build data list
    let tempData = [];

    allTickers.forEach(ticker => {
        const qty = holdings[ticker] || 0;
        const cost = costBasisComp[ticker] || 0;
        const symbolConfig = AppData.symbols.find(s => s.ticker === ticker);
        const targetRatio = symbolConfig ? symbolConfig.ratio : 0;

        if (qty !== 0 || symbolConfig) {
            tempData.push({
                ticker: ticker + (symbolConfig ? '' : ' (No Listado)'),
                qty: qty,
                cost: cost,
                targetRatio: targetRatio,
                rawTicker: ticker // for color gen
            });
        }
    });

    // Update Overall Total Display
    const currencyFormat = currentCurrency === 'ARS' ? 'es-AR' : 'en-US';
    const currencyCode = currentCurrency === 'ARS' ? 'ARS' : 'USD';

    document.getElementById('total-money').textContent = new Intl.NumberFormat(currencyFormat, { style: 'currency', currency: currencyCode }).format(totalInvestedComp);

    // Update Table & Chart Arrays
    const tbody = document.querySelector('#holdings-table tbody');
    tbody.innerHTML = '';

    if (tempData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary)">Sin datos</td></tr>';
    } else {
        // Sort by cost descending for nice chart/table
        tempData.sort((a, b) => b.cost - a.cost);

        tempData.forEach(row => {
            // Calculate actual %

            let pct = 0;
            if (row.cost > 0 && totalInvestedComp > 0) {
                pct = (row.cost / totalInvestedComp) * 100;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600">${row.ticker}</td>
                <td>${row.qty}</td>
                <td>${new Intl.NumberFormat(currencyFormat, { style: 'currency', currency: currencyCode }).format(row.cost)}</td>
                <td style="font-weight: 500; color: var(--accent-primary);">${pct.toFixed(2)}%</td>
                <td>${row.targetRatio}%</td>
            `;
            tbody.appendChild(tr);

            // Chart Data
            // Only show positive holdings in pie chart
            if (row.cost > 0) {
                chartLabels.push(row.ticker);
                chartData.push(row.cost);
                chartColors.push(generateColor(row.rawTicker));
            }
        });
    }

    // Chart Update
    // Update tooltip formatter to match currency
    renderChart(chartLabels, chartData, chartColors, currencyFormat, currencyCode);
}

function renderChart(labels, data, colors, locale, currency) {
    const ctx = document.getElementById('portfolioChart');
    if (!ctx) return;

    if (portfolioChart) {
        portfolioChart.destroy();
    }

    if (data.length === 0) return;

    portfolioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter' },
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(context.parsed);
                                // Add percentage to tooltip
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const val = context.parsed;
                                const pct = ((val / total) * 100).toFixed(1);
                                label += ` (${pct}%)`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderNetWorth() {
    // 1. Calculate Portfolio Invested in USD
    let portfolioUSD = 0;
    AppData.operations.forEach(op => {
        let amount = parseFloat(op.amount) || 0;
        const mep = op.mep && op.mep > 0 ? op.mep : 1;

        let valUSD = 0;
        if (op.mep && op.mep > 0) {
            valUSD = amount / mep;
        }

        if (op.type === 'BUY') {
            portfolioUSD += valUSD;
        } else {
            portfolioUSD -= valUSD;
        }
    });

    // 2. Calculate Assets in USD
    let assetsUSD = 0;
    AppData.assets.forEach(a => {
        assetsUSD += (parseFloat(a.value) || 0);
    });

    // 3. Total
    const totalNetWorth = portfolioUSD + assetsUSD;

    // 4. Update UI
    document.getElementById('nw-portfolio-val').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(portfolioUSD);
    document.getElementById('nw-assets-val').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(assetsUSD);
    document.getElementById('nw-total-val').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalNetWorth);

    // 5. Chart Data
    const chartLabels = ['Portafolio de Acciones'];
    const chartData = [Math.max(0, portfolioUSD)];
    const chartColors = ['#4f46e5']; // Primary color for portfolio

    AppData.assets.forEach(a => {
        chartLabels.push(a.name);
        chartData.push(a.value);
        chartColors.push(generateColor(a.name + '_asset'));
    });

    // Render Net Worth Chart
    renderNetWorthChart(chartLabels, chartData, chartColors);
}

function renderReports() {
    // Aggregate Data
    const groups = {};

    AppData.operations.forEach(op => {
        if (!op.date) return;
        const parts = op.date.split('-');
        const year = parts[0];
        const month = parts[1];

        const key = reportFreq === 'YEAR' ? year : `${year}-${month}`;

        if (!groups[key]) {
            groups[key] = {
                buyArs: 0,
                sellArs: 0,
                buyUsd: 0,
                sellUsd: 0
            };
        }

        const amount = parseFloat(op.amount) || 0;
        const mep = op.mep && op.mep > 0 ? op.mep : 0;
        const amountUsd = mep > 0 ? (amount / mep) : 0;

        if (op.type === 'BUY') {
            groups[key].buyArs += amount;
            groups[key].buyUsd += amountUsd;
        } else if (op.type === 'SELL') {
            groups[key].sellArs += amount;
            groups[key].sellUsd += amountUsd;
        }
    });

    const sortedKeys = Object.keys(groups).sort(); // Sort chronological

    const tbody = document.querySelector('#reports-table tbody');
    tbody.innerHTML = '';

    // Arrays for Chart
    const labels = [];
    const netUsdData = [];

    if (sortedKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary)">Sin datos para mostrar</td></tr>';
    } else {
        sortedKeys.forEach(key => {
            const d = groups[key];
            const netArs = d.buyArs - d.sellArs;
            const netUsd = d.buyUsd - d.sellUsd;

            const tr = document.createElement('tr');

            const fmtArs = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
            const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

            tr.innerHTML = `
                <td style="font-weight: 600;">${key}</td>
                <td style="color: var(--success);">${fmtArs.format(d.buyArs)}</td>
                <td style="color: var(--danger);">${fmtArs.format(d.sellArs)}</td>
                <td style="font-weight: 500;">${fmtArs.format(netArs)}</td>
                <td style="color: var(--success);">${fmtUsd.format(d.buyUsd)}</td>
                <td style="color: var(--danger);">${fmtUsd.format(d.sellUsd)}</td>
                <td style="font-weight: 500;">${fmtUsd.format(netUsd)}</td>
            `;
            tbody.appendChild(tr);

            labels.push(key);
            netUsdData.push(netUsd);
        });
    }

    // Render Chart
    // Bar chart of Net USD Flow
    renderReportsChart(labels, netUsdData);
}

function renderReportsChart(labels, data) {
    const ctx = document.getElementById('reportsChart');
    if (!ctx) return;

    if (reportsChart) {
        reportsChart.destroy();
    }

    if (data.length === 0) return;

    const colors = data.map(v => v >= 0 ? 'rgba(74, 222, 128, 0.6)' : 'rgba(248, 113, 113, 0.6)');
    const borders = data.map(v => v >= 0 ? '#4ade80' : '#f87171');

    reportsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Flujo Neto (USD)',
                data: data,
                backgroundColor: colors,
                borderColor: borders,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}


function renderNetWorthChart(labels, data, colors) {
    const ctx = document.getElementById('netWorthChart');
    if (!ctx) return;

    if (netWorthChart) {
        netWorthChart.destroy();
    }

    if (data.length === 0 || data.every(v => v === 0)) return;

    netWorthChart = new Chart(ctx, {
        type: 'pie', // Pie for distinction from doughnut
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter' },
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed);
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const val = context.parsed;
                                const pct = ((val / total) * 100).toFixed(1);
                                label += ` (${pct}%)`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function generateColor(str) {
    // Generate consistent pastel color from string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = hash % 360;
    return `hsl(${h}, 70%, 60%)`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// --- Event Listeners & Actions ---

function setupEventListeners() {
    // Report Freq Selector
    const reportFreqSel = document.getElementById('report-freq');
    if (reportFreqSel) {
        reportFreqSel.addEventListener('change', (e) => {
            reportFreq = e.target.value;
            renderReports();
        });
    }

    // Currency Selector
    const currencySelector = document.getElementById('currency-selector');
    if (currencySelector) {
        currencySelector.addEventListener('change', (e) => {
            currentCurrency = e.target.value;
            renderDashboard();
        });
    }

    // Symbol Form
    document.getElementById('symbol-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const ticker = document.getElementById('symbol-ticker').value.trim().toUpperCase();
        const ratio = parseFloat(document.getElementById('symbol-ratio').value);

        if (!ticker || isNaN(ratio)) return;

        if (AppData.symbols.find(s => s.ticker === ticker)) {
            alert('El símbolo ya existe.');
            return;
        }

        addSymbolToDB({ ticker, ratio });
        e.target.reset();
    });

    // Operation Form
    document.getElementById('operation-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const idInput = document.getElementById('op-id').value;
        const ticker = document.getElementById('op-symbol').value;
        const type = document.getElementById('op-type').value;
        const qty = parseInt(document.getElementById('op-qty').value);
        const date = document.getElementById('op-date').value;
        const mep = parseFloat(document.getElementById('op-mep').value);
        const amount = parseFloat(document.getElementById('op-amount').value);

        if (!ticker || !type || !qty || !date) return;

        const opData = {
            id: idInput ? parseInt(idInput) : Date.now(), // timestamp ID for internal logic
            ticker,
            type,
            qty,
            date,
            mep: mep || 0,
            amount: amount || 0
        };

        addOperationToDB(opData); // Handles update or create

        // Save last MEP
        if (mep) {
            localStorage.setItem(LAST_MEP_KEY, mep);
        }

        resetOpForm();
        document.getElementById('op-mep').value = mep; // Restore MEP after reset
    });

    // Asset Form
    document.getElementById('asset-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('asset-name').value.trim();
        const value = parseFloat(document.getElementById('asset-value').value);

        if (!name || isNaN(value)) return;

        const assetData = {
            id: Date.now(),
            name: name,
            value: value
        };
        addAssetToDB(assetData);
        e.target.reset();
    });

    // Cancel Edit
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        resetOpForm();
        loadLastMep();
    });

    // Data Export
    document.getElementById('btn-export-symbols').addEventListener('click', () => {
        exportToCSV(AppData.symbols, 'portfolio_symbols.csv');
    });

    document.getElementById('btn-export-ops').addEventListener('click', () => {
        exportToCSV(AppData.operations, 'portfolio_operations.csv');
    });

    document.getElementById('btn-export-assets').addEventListener('click', () => {
        exportToCSV(AppData.assets, 'portfolio_assets.csv');
    });

    document.getElementById('btn-export-all').addEventListener('click', () => {
        exportAllData();
    });

    // Data Import
    document.getElementById('file-import-symbols').addEventListener('change', (e) => {
        importFromCSV(e.target.files[0], 'symbols');
        e.target.value = '';
    });

    document.getElementById('file-import-ops').addEventListener('change', (e) => {
        importFromCSV(e.target.files[0], 'operations');
        e.target.value = '';
    });

    document.getElementById('file-import-assets').addEventListener('change', (e) => {
        importFromCSV(e.target.files[0], 'assets');
        e.target.value = '';
    });

    document.getElementById('file-import-folder').addEventListener('change', (e) => {
        importFromFolder(e.target.files);
        e.target.value = '';
    });

    // Clear Data
    document.getElementById('btn-clear-all').addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que quieres borrar TODOS los datos de la base de datos? Esta acción es irreversible.')) {
            // Firestore deletion
            // We need to delete all documents.
            try {
                // Delete all symbols
                const batch = writeBatch(db);
                // Batch limit is 500. For safety we iterate if simple. For now assuming small data.

                // Since deleting entire collections from web client is not native, we iterate fetches.
                const p1 = getDocs(collection(db, "symbols")).then(snap => {
                    snap.forEach(d => deleteDoc(d.ref));
                });
                const p2 = getDocs(collection(db, "operations")).then(snap => {
                    snap.forEach(d => deleteDoc(d.ref));
                });
                const p3 = getDocs(collection(db, "assets")).then(snap => {
                    snap.forEach(d => deleteDoc(d.ref));
                });

                await Promise.all([p1, p2, p3]);

                AppData.symbols = [];
                AppData.operations = [];
                AppData.assets = [];
                localStorage.removeItem(LAST_MEP_KEY);
                renderAll();
                document.getElementById('op-mep').value = '';
                alert("Base de datos limpiada.");

            } catch (e) {
                console.error("Error clearing DB", e);
                alert("Error borrando base de datos.");
            }
        }
    });
}

// Global functions for inline HTML events
window.deleteSymbol = function (index) {
    const sym = AppData.symbols[index];
    if (!sym) return;
    if (confirm(`¿Borrar acción ${sym.ticker}?`)) {
        deleteSymbolFromDB(sym.ticker, index);
    }
};

window.deleteOperation = function (id) {
    const op = AppData.operations.find(o => o.id === id);
    if (!op) return;
    // docId is op._id
    if (confirm('¿Borrar esta operación?')) {
        deleteOperationFromDB(id, op._id || op.id);
    }
};

window.deleteAsset = function (id) {
    const asset = AppData.assets.find(a => a.id === id);
    if (!asset) return;
    if (confirm('¿Borrar este activo?')) {
        deleteAssetFromDB(id, asset._id || asset.id);
    }
};

window.editOperation = function (id) {
    const op = AppData.operations.find(o => o.id === id);
    if (!op) return;

    // Populate form
    document.getElementById('op-id').value = op.id;
    document.getElementById('op-symbol').value = op.ticker;
    document.getElementById('op-type').value = op.type;
    document.getElementById('op-qty').value = op.qty;
    document.getElementById('op-date').value = op.date;
    document.getElementById('op-mep').value = op.mep;
    document.getElementById('op-amount').value = op.amount;

    // Change UI state
    document.getElementById('btn-submit-op').innerHTML = '<i class="fa-solid fa-check"></i> Actualizar';
    document.getElementById('btn-cancel-edit').style.display = 'flex';

    // Scroll to form
    document.getElementById('operation-form').scrollIntoView({ behavior: 'smooth' });
};

function resetOpForm() {
    document.getElementById('operation-form').reset();
    document.getElementById('op-id').value = '';
    document.getElementById('btn-submit-op').innerHTML = '<i class="fa-solid fa-paper-plane"></i> Registrar';
    document.getElementById('btn-cancel-edit').style.display = 'none';
}

// --- CSV Handlers ---

function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        alert('No hay datos para exportar.');
        return;
    }

    // Filter out internal fields like _id if desired, or keep them. 
    // Keeping them might cause issues on re-import if we don't handle them.
    // The original code exported keys of the first object. AppData objects now have _id.
    // Let's exclude _id for clean CSV.

    const cleanData = data.map(({ _id, ...rest }) => rest);

    const headers = Object.keys(cleanData[0]);
    const csvContent = [
        headers.join(','),
        ...cleanData.map(row => headers.map(fieldName => JSON.stringify(row[fieldName])).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importFromCSV(file, type) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const text = e.target.result;
        try {
            const result = parseCSV(text);

            // We use batching for better performance if possible, or parallel requests
            const batch = writeBatch(db);
            // Note: batch has limit of 500 ops.

            if (type === 'symbols') {
                const first = result[0];
                if (!first || !first.hasOwnProperty('ticker')) {
                    alert('CSV inválido. Se requieren columnas "ticker" y "ratio".');
                    return;
                }

                // REPLACE Strategy: Delete all first? Or just Overwrite? 
                // Previous logic said "Reemplaza lista actual".
                // Deleting all is safer for "Replace".
                // But efficient usage would be just overwriting or adding.
                // Let's conform to "Restore/Replace" logic:
                // 1. Delete all existing symbols (local and DB)
                // Warning: heavy op.

                if (confirm("Importar CSV de Acciones reemplazará toda la lista actual. ¿Continuar?")) {
                    // Delete All Logic
                    const snap = await getDocs(collection(db, "symbols"));
                    for (const d of snap.docs) {
                        await deleteDoc(d.ref); // Sequential delete for simplicity despite slowness
                    }
                    AppData.symbols = [];

                    // Add new
                    for (const r of result) {
                        const s = {
                            ticker: String(r.ticker).toUpperCase(),
                            ratio: parseFloat(r.ratio) || 0
                        };
                        await setDoc(doc(db, "symbols", s.ticker), s);
                        AppData.symbols.push({ ...s, _id: s.ticker });
                    }
                    alert(`Importadas ${result.length} acciones.`);
                }

            } else if (type === 'operations') {
                const first = result[0];
                if (!first || !first.hasOwnProperty('ticker')) {
                    alert('CSV inválido para operaciones.');
                    return;
                }

                // APPEND Strategy
                let count = 0;
                for (const r of result) {
                    const op = {
                        id: r.id ? parseInt(r.id) : Date.now() + Math.random(),
                        ticker: String(r.ticker).toUpperCase(),
                        type: r.type || 'BUY',
                        qty: parseInt(r.qty) || 0,
                        date: r.date || new Date().toISOString().split('T')[0],
                        mep: parseFloat(r.mep) || 0,
                        amount: parseFloat(r.amount) || 0
                    };
                    const docId = String(op.id);
                    await setDoc(doc(db, "operations", docId), op);
                    AppData.operations.push({ ...op, _id: docId });
                    count++;
                }
                alert(`Importadas ${count} operaciones.`);

            } else if (type === 'assets') {
                const first = result[0];
                if (!first || !first.hasOwnProperty('name')) {
                    alert('CSV inválido para activos.');
                    return;
                }
                let count = 0;
                for (const r of result) {
                    const a = {
                        id: r.id ? parseInt(r.id) : Date.now() + Math.random(),
                        name: String(r.name),
                        value: parseFloat(r.value) || 0
                    };
                    const docId = String(a.id);
                    await setDoc(doc(db, 'assets', docId), a);
                    AppData.assets.push({ ...a, _id: docId });
                    count++;
                }
                alert(`Importados ${count} activos.`);
            }
            renderAll();
        } catch (err) {
            console.error(err);
            alert('Error al importar CSV o guardar en BD.');
        }
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const currentline = lines[i].split(',').map(val => val.replace(/^"|"$/g, '').trim());

        // Skip malformed lines
        if (currentline.length < headers.length) continue;

        headers.forEach((h, index) => {
            obj[h] = currentline[index];
        });
        result.push(obj);
    }
    return result;
}

function exportAllData() {
    const zip = new JSZip();

    const createCSV = (data) => {
        if (!data || data.length === 0) return null;
        const cleanData = data.map(({ _id, ...rest }) => rest);
        const headers = Object.keys(cleanData[0]);
        return [
            headers.join(','),
            ...cleanData.map(row => headers.map(fieldName => JSON.stringify(row[fieldName])).join(','))
        ].join('\r\n');
    };

    const symbolsCSV = createCSV(AppData.symbols);
    if (symbolsCSV) zip.file("portfolio_symbols.csv", symbolsCSV);

    const opsCSV = createCSV(AppData.operations);
    if (opsCSV) zip.file("portfolio_operations.csv", opsCSV);

    const assetsCSV = createCSV(AppData.assets);
    if (assetsCSV) zip.file("portfolio_assets.csv", assetsCSV);

    if (Object.keys(zip.files).length === 0) {
        alert("No hay datos para exportar.");
        return;
    }

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Backup_Portafolio_${dateStr}.zip`;

    zip.generateAsync({ type: "blob" }).then(function (content) {
        const url = URL.createObjectURL(content);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
    });
}

function importFromFolder(fileList) {
    if (!fileList || fileList.length === 0) return;

    let symbolsFile = null;
    let opsFile = null;
    let assetsFile = null;

    for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        if (f.name === 'portfolio_symbols.csv') symbolsFile = f;
        if (f.name === 'portfolio_operations.csv') opsFile = f;
        if (f.name === 'portfolio_assets.csv') assetsFile = f;
    }

    if (!symbolsFile && !opsFile && !assetsFile) {
        alert("No se encontraron archivos válidos en la carpeta.");
        return;
    }

    const processFile = (file, type) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const result = parseCSV(e.target.result);
                    if (type === 'symbols') {
                        const snap = await getDocs(collection(db, "symbols"));
                        for (const d of snap.docs) await deleteDoc(d.ref);
                        AppData.symbols = [];
                        for (const r of result) {
                            const s = { ticker: String(r.ticker).toUpperCase(), ratio: parseFloat(r.ratio) || 0 };
                            await setDoc(doc(db, "symbols", s.ticker), s);
                            AppData.symbols.push({ ...s, _id: s.ticker });
                        }
                    } else if (type === 'operations') {
                        // Full backup restore often implies wipe/replace or append?
                        // "Restaurar Copia de Seguridad" implies replace state to match backup.
                        // The previous code did: `AppData.operations = []` at start.
                        // So we should wipe operations too.
                        const snap = await getDocs(collection(db, "operations"));
                        for (const d of snap.docs) await deleteDoc(d.ref);
                        AppData.operations = [];
                        for (const r of result) {
                            const op = {
                                id: r.id ? parseInt(r.id) : Date.now() + Math.random(),
                                ticker: String(r.ticker).toUpperCase(),
                                type: r.type || 'BUY',
                                qty: parseInt(r.qty) || 0,
                                date: r.date || new Date().toISOString().split('T')[0],
                                mep: parseFloat(r.mep) || 0,
                                amount: parseFloat(r.amount) || 0
                            };
                            await setDoc(doc(db, "operations", String(op.id)), op);
                            AppData.operations.push({ ...op, _id: String(op.id) });
                        }
                    } else if (type === 'assets') {
                        const snap = await getDocs(collection(db, "assets"));
                        for (const d of snap.docs) await deleteDoc(d.ref);
                        AppData.assets = [];
                        for (const r of result) {
                            const a = {
                                id: r.id ? parseInt(r.id) : Date.now() + Math.random(),
                                name: String(r.name),
                                value: parseFloat(r.value) || 0
                            };
                            await setDoc(doc(db, "assets", String(a.id)), a);
                            AppData.assets.push({ ...a, _id: String(a.id) });
                        }
                    }
                    resolve();
                } catch (err) {
                    console.error(err);
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    };

    // Sequential refactoring
    (async () => {
        try {
            if (symbolsFile) await processFile(symbolsFile, 'symbols');
            if (opsFile) await processFile(opsFile, 'operations');
            if (assetsFile) await processFile(assetsFile, 'assets');
            renderAll();
            alert("Restauración completada.");
        } catch (e) {
            alert("Error en restauración.");
        }
    })();
}
