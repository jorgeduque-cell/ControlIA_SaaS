/* ==========================================================================
   CONTROLIA SAAS — Mini App Logic
   SPA Router, Telegram SDK Integration, API Client
   ========================================================================== */

// ─── MODULE DEFINITIONS (mirrors backend MODULES dict) ───
const MODULES = {
  crm: {
    icon: '👥', title: 'CRM',
    desc: 'Gestión de clientes, notas y seguimiento',
    commands: [
      { icon: '👤', label: 'Nuevo Cliente', cmd: 'nuevo_cliente' },
      { icon: '👥', label: 'Ver Cartera', cmd: 'clientes' },
      { icon: '🔍', label: 'Buscar', cmd: 'buscar' },
      { icon: '📋', label: 'Ficha Cliente', cmd: 'ficha' },
      { icon: '📝', label: 'Nota de Visita', cmd: 'nota' },
      { icon: '📊', label: 'Pipeline', cmd: 'seguimiento' },
      { icon: '📡', label: 'Radar Comercial', cmd: 'radar' },
      { icon: '📅', label: 'Asignar Día', cmd: 'asignar_dia' },
    ],
  },
  ventas: {
    icon: '🛒', title: 'VENTAS',
    desc: 'Pedidos, entregas y cobros',
    commands: [
      { icon: '🛒', label: 'Crear Pedido', cmd: 'vender' },
      { icon: '🔄', label: 'Repetir Pedido', cmd: 'repetir' },
      { icon: '📦', label: 'Ver Pedidos', cmd: 'pedidos' },
      { icon: '✅', label: 'Marcar Entregado', cmd: 'entregar' },
      { icon: '💳', label: 'Cobros Pendientes', cmd: 'cobrar' },
      { icon: '💵', label: 'Marcar Pagado', cmd: 'pagar' },
    ],
  },
  precios: {
    icon: '💰', title: 'PRECIOS',
    desc: 'Lista de precios y cotizaciones',
    commands: [
      { icon: '💰', label: 'Ver Precios', cmd: 'precios' },
      { icon: '📲', label: 'Cotizar WhatsApp', cmd: 'cotizar' },
    ],
  },
  logistica: {
    icon: '🚚', title: 'LOGÍSTICA',
    desc: 'Rutas, inventario y distribución',
    commands: [
      { icon: '📅', label: 'Ruta Semanal', cmd: 'ruta_semanal' },
      { icon: '🗺️', label: 'Prospección Pie', cmd: 'ruta_pie' },
      { icon: '🚚', label: 'Entregas Camión', cmd: 'ruta_camion' },
      { icon: '📦', label: 'Inventario', cmd: 'inventario' },
    ],
  },
  finanzas: {
    icon: '💼', title: 'FINANZAS',
    desc: 'Caja, cartera, márgenes y metas',
    commands: [
      { icon: '💼', label: 'Estado de Caja', cmd: 'caja' },
      { icon: '💳', label: 'Cartera x Cobrar', cmd: 'cuentas_por_cobrar' },
      { icon: '📝', label: 'Registrar Gasto', cmd: 'gasto' },
      { icon: '📈', label: 'Margen Rentabilidad', cmd: 'margen' },
      { icon: '🎯', label: 'Meta Mensual', cmd: 'meta' },
    ],
  },
  documentos: {
    icon: '📄', title: 'DOCUMENTOS',
    desc: 'Remisiones y despachos en PDF',
    commands: [
      { icon: '📄', label: 'Remisión PDF', cmd: 'remision' },
      { icon: '🚛', label: 'Despacho Formal', cmd: 'despacho' },
    ],
  },
  admin: {
    icon: '⚙️', title: 'ADMIN',
    desc: 'Edición, eliminación, catálogo y respaldos',
    commands: [
      { icon: '📦', label: 'Configurar Productos', cmd: 'configurar' },
      { icon: '✏️', label: 'Editar Registro', cmd: 'editar' },
      { icon: '🗑️', label: 'Eliminar Registro', cmd: 'eliminar' },
      { icon: '💾', label: 'Backup', cmd: 'backup' },
    ],
  },
};


// ─── TELEGRAM SDK ───
const tg = window.Telegram && window.Telegram.WebApp;
const IS_TELEGRAM = !!(tg && tg.initData);


// ─── API CLIENT ───
const API = {
  _baseUrl: '',  // Same origin

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (IS_TELEGRAM) {
      h['X-Telegram-Init-Data'] = tg.initData;
    } else {
      // Dev mode: send a test vendor ID
      h['X-Dev-Vendor-Id'] = '12345';
    }
    return h;
  },

  async get(endpoint) {
    try {
      const resp = await fetch(this._baseUrl + endpoint, { headers: this._headers() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error(`API GET ${endpoint}:`, err);
      throw err;
    }
  },

  async post(endpoint, body) {
    try {
      const resp = await fetch(this._baseUrl + endpoint, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error(`API POST ${endpoint}:`, err);
      throw err;
    }
  },
};


// ─── HELPERS ───
function formatCOP(amount) {
  try {
    return '$' + Math.round(amount).toLocaleString('es-CO').replace(/,/g, '.');
  } catch {
    return '$0';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayFormatted() {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function animateCounter(el, target, duration = 800, isCurrency = false) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = Math.round(start + (target - start) * eased);

    el.textContent = isCurrency ? formatCOP(current) : current.toString();

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function typewriter(el, text, speed = 40) {
  el.textContent = '';
  let i = 0;
  function tick() {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;
      setTimeout(tick, speed);
    }
  }
  tick();
}

function spawnConfetti() {
  const container = document.getElementById('confetti');
  container.innerHTML = '';
  const colors = ['#6C3CE1', '#00D4FF', '#FF6B9D', '#00E676', '#FFB74D', '#FFFFFF'];

  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.8 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.width = (5 + Math.random() * 6) + 'px';
    piece.style.height = (5 + Math.random() * 6) + 'px';
    container.appendChild(piece);
  }

  setTimeout(() => { container.innerHTML = ''; }, 4000);
}

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast--${type} show`;
  setTimeout(() => { toast.classList.remove('show'); }, duration);
}

function haptic(type = 'light') {
  if (IS_TELEGRAM && tg.HapticFeedback) {
    if (type === 'light') tg.HapticFeedback.impactOccurred('light');
    else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
    else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
  }
}


// ─── APP STATE ───
const App = {
  vendor: null,
  stats: null,
  currentScreen: 'loading',
  registrationData: {},

  // ─── SCREEN MANAGEMENT ───
  showScreen(screenId) {
    try {
      // Hide all screens
      document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
      });

      // Show target directly (no requestAnimationFrame — causes issues in Telegram WebView)
      const target = document.getElementById('screen-' + screenId);
      if (target) {
        target.classList.add('active');
        this.currentScreen = screenId;
      }

      // Telegram back button
      if (IS_TELEGRAM) {
        try {
          if (['dashboard', 'welcome', 'loading', 'expired'].includes(screenId)) {
            tg.BackButton.hide();
          } else {
            tg.BackButton.show();
          }
        } catch(e) { /* BackButton not available */ }
      }

      haptic('light');
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
  },

  // ─── INIT ───
  async init() {
    // Telegram SDK setup
    if (IS_TELEGRAM) {
      tg.expand();
      tg.ready();

      // Back button handler
      tg.BackButton.onClick(() => {
        if (this.currentScreen === 'module') {
          this.showScreen('dashboard');
        } else if (this.currentScreen === 'account') {
          this.showScreen('dashboard');
        } else if (this.currentScreen === 'register-2') {
          this.showScreen('register-1');
        } else if (this.currentScreen === 'register-1') {
          this.showScreen('welcome');
        } else if (this.currentScreen === 'success') {
          this.showScreen('dashboard');
        }
      });
    }

    // Enter key handlers for forms
    const businessInput = document.getElementById('input-business-name');
    if (businessInput) {
      businessInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.goToRegisterStep2();
      });
    }
    const phoneInput = document.getElementById('input-phone');
    if (phoneInput) {
      phoneInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.submitRegistration();
      });
    }

    // Load vendor data
    try {
      const data = await API.get('/api/vendor');

      if (data.is_new) {
        // New user → show welcome
        this.showScreen('welcome');
        typewriter(
          document.getElementById('typewriter-target'),
          'Tu asistente de ventas inteligente',
          50
        );
        if (data.trial_days) {
          document.getElementById('trial-days-text').textContent =
            `${data.trial_days} días de prueba gratis`;
        }
        if (data.subscription_price) {
          document.getElementById('success-price').textContent =
            formatCOP(data.subscription_price) + '/mes';
          document.getElementById('expired-price').textContent =
            formatCOP(data.subscription_price);
        }
      } else {
        this.vendor = data.vendor;

        // Check if expired
        if (this._isExpired()) {
          this._renderExpired();
          this.showScreen('expired');
        } else {
          // Active/Trial → load dashboard
          await this._loadDashboard();
          this.showScreen('dashboard');
        }
      }
    } catch (err) {
      console.error('Init failed:', err);
      showToast('Error al conectar con el servidor', 'error');
      // Show welcome as fallback
      this.showScreen('welcome');
      typewriter(
        document.getElementById('typewriter-target'),
        'Tu asistente de ventas inteligente',
        50
      );
    }
  },

  // ─── REGISTRATION ───
  goToRegisterStep2() {
    const name = document.getElementById('input-business-name').value.trim();
    const inputGroup = document.getElementById('input-business-name').closest('.input-group');

    if (!name) {
      inputGroup.classList.add('input-group--error');
      haptic('error');
      return;
    }

    inputGroup.classList.remove('input-group--error');
    this.registrationData.business_name = name;
    this.showScreen('register-2');

    // Focus phone input
    setTimeout(() => {
      document.getElementById('input-phone').focus();
    }, 400);
  },

  async submitRegistration() {
    const phone = document.getElementById('input-phone').value.trim();
    const inputGroup = document.getElementById('input-phone').closest('.input-group');

    if (!phone || phone.length < 7) {
      inputGroup.classList.add('input-group--error');
      haptic('error');
      return;
    }

    inputGroup.classList.remove('input-group--error');
    this.registrationData.phone = phone;

    // Show spinner
    document.getElementById('btn-register-text').classList.add('hidden');
    document.getElementById('btn-register-spinner').classList.remove('hidden');
    document.getElementById('btn-register').disabled = true;

    try {
      const result = await API.post('/api/register', this.registrationData);
      this.vendor = result.vendor;

      // Populate success screen
      document.getElementById('success-business').textContent = this.vendor.nombre_negocio || '';
      document.getElementById('success-phone').textContent = this.vendor.telefono_soporte || '';
      document.getElementById('success-trial-end').textContent =
        formatDate(this.vendor.fecha_vencimiento);

      haptic('success');
      spawnConfetti();
      this.showScreen('success');
    } catch (err) {
      haptic('error');
      showToast('Error al crear la cuenta. Intenta de nuevo.', 'error');
    } finally {
      // Reset button
      document.getElementById('btn-register-text').classList.remove('hidden');
      document.getElementById('btn-register-spinner').classList.add('hidden');
      document.getElementById('btn-register').disabled = false;
    }
  },

  // ─── DASHBOARD ───
  async _loadDashboard() {
    try {
      const data = await API.get('/api/dashboard');
      this.vendor = data.vendor;
      this.stats = data.stats;
      this._renderDashboard();
    } catch (err) {
      showToast('Error al cargar el panel', 'error');
    }
  },

  _renderDashboard() {
    const v = this.vendor;
    const s = this.stats;

    // Header
    document.getElementById('dash-business-name').textContent = v.nombre_negocio || 'Mi Negocio';
    document.getElementById('dash-date').textContent = todayFormatted();

    // Badge
    const badge = document.getElementById('dash-badge');
    if (v.estado === 'Activo') {
      badge.textContent = '🟢 Activo';
      badge.className = 'badge badge--active';
    } else if (v.estado === 'Prueba') {
      badge.textContent = '🟡 Prueba';
      badge.className = 'badge badge--trial';
    } else {
      badge.textContent = '🔴 Inactivo';
      badge.className = 'badge badge--expired';
    }

    // KPIs with counter animation
    if (s) {
      animateCounter(document.getElementById('kpi-clients'), s.total_clients || 0);
      animateCounter(document.getElementById('kpi-pending'), s.pending_orders || 0);
      animateCounter(document.getElementById('kpi-unpaid'), s.unpaid || 0);
      animateCounter(document.getElementById('kpi-sales'), s.today_sales || 0, 1000, true);

      document.getElementById('kpi-clients-detail').textContent =
        `${s.active_clients || 0} activos · ${s.prospects || 0} prospectos`;
    }

    // Module grid — use data-attributes + event delegation for Telegram WebView
    const grid = document.getElementById('module-grid');
    grid.innerHTML = '';

    for (const [key, mod] of Object.entries(MODULES)) {
      const card = document.createElement('div');
      card.className = 'module-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-module', key);

      card.innerHTML = `
        <div class="module-card__icon">${mod.icon}</div>
        <span class="module-card__title">${mod.title}</span>
        <span class="module-card__desc">${mod.desc}</span>
      `;
      grid.appendChild(card);
    }

    // Event delegation — single listener on parent handles all module clicks
    grid.onclick = (e) => {
      const card = e.target.closest('[data-module]');
      if (card) {
        e.preventDefault();
        e.stopPropagation();
        const moduleKey = card.getAttribute('data-module');
        this.openModule(moduleKey);
      }
    };

    // Account screen data
    this._renderAccount();
  },

  _renderAccount() {
    const v = this.vendor;
    if (!v) return;

    document.getElementById('acct-business').textContent = v.nombre_negocio || '';
    document.getElementById('acct-phone').textContent = v.telefono_soporte || 'N/A';
    document.getElementById('acct-expiry').textContent = formatDate(v.fecha_vencimiento);
    document.getElementById('acct-id').textContent = v.id || '';
    document.getElementById('acct-products').textContent =
      this.stats ? (this.stats.products_count || 0) : '0';

    // Badge
    const badge = document.getElementById('acct-badge');
    if (v.estado === 'Activo') {
      badge.textContent = '🟢 Activo';
      badge.className = 'badge badge--active';
    } else if (v.estado === 'Prueba') {
      badge.textContent = '🟡 Prueba';
      badge.className = 'badge badge--trial';
    } else {
      badge.textContent = '🔴 Inactivo';
      badge.className = 'badge badge--expired';
    }

    // Subscription bar
    const bar = document.getElementById('acct-sub-bar');
    const subText = document.getElementById('acct-sub-text');
    if (v.fecha_vencimiento) {
      const now = new Date();
      const expiry = new Date(v.fecha_vencimiento + 'T00:00:00');
      const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      const totalDays = 30;
      const pct = Math.min(100, Math.max(0, (daysLeft / totalDays) * 100));

      bar.style.width = pct + '%';
      bar.className = 'subscription-bar__fill ' +
        (pct > 30 ? 'subscription-bar__fill--healthy' : 'subscription-bar__fill--warning');
      subText.textContent = daysLeft > 0
        ? `${daysLeft} días restantes`
        : 'Suscripción vencida';
    }
  },

  // ─── MODULE DETAIL ───
  openModule(key) {
    try {
      const mod = MODULES[key];
      if (!mod) {
        showToast('Módulo no encontrado: ' + key, 'error');
        return;
      }

      haptic('light');

      document.getElementById('mod-title').textContent = `${mod.icon} ${mod.title}`;
      document.getElementById('mod-desc').textContent = mod.desc;

      const list = document.getElementById('action-list');
      list.innerHTML = '';

      mod.commands.forEach(cmd => {
        const item = document.createElement('div');
        item.className = 'action-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('data-cmd', cmd.cmd);

        item.innerHTML = `
          <span class="action-item__icon">${cmd.icon}</span>
          <span class="action-item__label">${cmd.label}</span>
          <span class="action-item__arrow">→</span>
        `;
        list.appendChild(item);
      });

      // Event delegation for action items
      list.onclick = (e) => {
        const item = e.target.closest('[data-cmd]');
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          const cmd = item.getAttribute('data-cmd');
          this.sendCommand(cmd);
        }
      };

      this.showScreen('module');
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
  },

  // ─── SEND COMMAND → Close Mini App & dispatch to bot ───
  sendCommand(cmd) {
    haptic('medium');

    if (IS_TELEGRAM) {
      // Send data back to the bot — this closes the Mini App
      tg.sendData(JSON.stringify({ action: 'command', command: cmd }));
    } else {
      // Dev mode: just show toast
      showToast(`Comando: /${cmd}`, 'info');
    }
  },

  // ─── EXPIRED ───
  _isExpired() {
    if (!this.vendor) return false;
    if (this.vendor.estado === 'Inactivo') return true;
    if (this.vendor.fecha_vencimiento) {
      const exp = new Date(this.vendor.fecha_vencimiento + 'T00:00:00');
      return exp < new Date();
    }
    return false;
  },

  _renderExpired() {
    if (this.vendor && this.vendor.fecha_vencimiento) {
      document.getElementById('expired-date').textContent =
        formatDate(this.vendor.fecha_vencimiento);
    }
  },
};


// ─── BOOT ───
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
