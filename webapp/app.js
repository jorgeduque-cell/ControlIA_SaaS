/* ==========================================================================
   CONTROLIA SAAS — Mini App Logic v2
   Full in-app command execution (no chat fallback)
   ========================================================================== */

// ─── MODULE DEFINITIONS ───
const MODULES = {
  crm: {
    icon: '👥', title: 'CRM',
    desc: 'Gestión de clientes, notas y seguimiento',
    commands: [
      { icon: '👤', label: 'Nuevo Cliente', cmd: 'nuevo_cliente' },
      { icon: '👥', label: 'Ver Cartera', cmd: 'clientes' },
      { icon: '🔍', label: 'Buscar', cmd: 'buscar' },
      { icon: '📊', label: 'Pipeline', cmd: 'seguimiento' },
    ],
  },
  ventas: {
    icon: '🛒', title: 'VENTAS',
    desc: 'Pedidos, entregas y cobros',
    commands: [
      { icon: '🛒', label: 'Crear Pedido', cmd: 'vender' },
      { icon: '📦', label: 'Ver Pedidos', cmd: 'pedidos' },
      { icon: '✅', label: 'Marcar Entregado', cmd: 'entregar' },
      { icon: '💳', label: 'Cobros Pendientes', cmd: 'cobrar' },
      { icon: '💵', label: 'Marcar Pagado', cmd: 'pagar' },
    ],
  },
  precios: {
    icon: '💰', title: 'PRECIOS',
    desc: 'Lista de precios y catálogo',
    commands: [
      { icon: '💰', label: 'Ver Precios', cmd: 'precios' },
      { icon: '📦', label: 'Agregar Producto', cmd: 'nuevo_producto' },
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
    ],
  },
  admin: {
    icon: '⚙️', title: 'ADMIN',
    desc: 'Configuración y productos',
    commands: [
      { icon: '📦', label: 'Configurar Productos', cmd: 'configurar' },
    ],
  },
};


// ─── COMMAND REGISTRY: maps cmd → handler ───
const CMD_HANDLERS = {
  // CRM
  nuevo_cliente: () => App.showForm({
    title: '👤 Nuevo Cliente',
    subtitle: 'Registra un nuevo cliente o prospecto',
    fields: [
      { key: 'nombre', label: 'Nombre completo', type: 'text', required: true, icon: '👤' },
      { key: 'telefono', label: 'Teléfono / WhatsApp', type: 'tel', icon: '📱' },
      { key: 'direccion', label: 'Dirección', type: 'text', icon: '📍' },
      { key: 'tipo_cliente', label: 'Tipo', type: 'select', options: ['Cliente', 'Prospecto'], icon: '🏷️' },
    ],
    submitLabel: 'Registrar Cliente',
    apiEndpoint: '/api/clients',
    apiMethod: 'POST',
    successMsg: '✅ Cliente registrado exitosamente',
    returnTo: 'module',
  }),

  clientes: () => App.showList({
    title: '👥 Tu Cartera',
    subtitle: 'Todos tus clientes y prospectos',
    apiEndpoint: '/api/clients',
    emptyIcon: '👥',
    emptyText: 'Aún no tienes clientes. ¡Registra el primero!',
    searchable: true,
    searchEndpoint: '/api/clients/search',
    addBtn: { label: '+ Nuevo Cliente', cmd: 'nuevo_cliente' },
    renderItem: (item) => ({
      icon: item.tipo_cliente === 'Prospecto' ? '🔵' : '🟢',
      title: item.nombre,
      subtitle: `${item.tipo_cliente || 'Cliente'} · ${item.telefono || 'Sin teléfono'}`,
      detail: item.direccion || '',
    }),
  }),

  buscar: () => App.showList({
    title: '🔍 Buscar Clientes',
    subtitle: 'Escribe el nombre o teléfono',
    apiEndpoint: '/api/clients',
    emptyIcon: '🔍',
    emptyText: 'Busca clientes por nombre o teléfono',
    searchable: true,
    searchEndpoint: '/api/clients/search',
    startWithSearch: true,
    renderItem: (item) => ({
      icon: '👤',
      title: item.nombre,
      subtitle: `${item.tipo_cliente || 'Cliente'} · ${item.telefono || ''}`,
    }),
  }),

  seguimiento: () => App.showResult({
    title: '📊 Pipeline Comercial',
    apiEndpoint: '/api/pipeline',
    render: (data) => {
      const items = [
        { icon: '👥', label: 'Total clientes', value: data.total_clients || 0 },
        { icon: '🟢', label: 'Activos', value: data.active || 0 },
        { icon: '🔵', label: 'Prospectos', value: data.prospects || 0 },
        { icon: '📦', label: 'Pedidos pendientes', value: data.pending_orders || 0 },
        { icon: '💰', label: 'Ventas del mes', value: formatCOP(data.month_sales || 0) },
      ];
      return items.map(i => `
        <div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">
          <span>${i.icon} ${i.label}</span>
          <span style="font-weight:700;color:var(--c-accent);">${i.value}</span>
        </div>
      `).join('');
    },
  }),

  // VENTAS
  vender: async () => {
    // Load clients and products first
    try {
      const [clientsData, productsData] = await Promise.all([
        API.get('/api/clients'),
        API.get('/api/products'),
      ]);
      const clients = clientsData.items || [];
      const products = productsData.products || [];

      if (clients.length === 0) {
        showToast('Primero registra un cliente', 'error');
        CMD_HANDLERS.nuevo_cliente();
        return;
      }
      if (products.length === 0) {
        showToast('Primero agrega productos', 'error');
        CMD_HANDLERS.nuevo_producto();
        return;
      }

      App.showForm({
        title: '🛒 Crear Pedido',
        subtitle: 'Registrar una venta',
        fields: [
          { key: 'cliente_id', label: 'Cliente', type: 'select', options: clients.map(c => ({ value: c.id, label: c.nombre })), required: true, icon: '👤' },
          { key: 'producto', label: 'Producto', type: 'select', options: products.map(p => ({ value: p.nombre, label: `${p.nombre} — ${formatCOP(p.precio_venta)}` })), required: true, icon: '📦' },
          { key: 'cantidad', label: 'Cantidad', type: 'number', required: true, icon: '🔢' },
          { key: 'precio_venta', label: 'Precio de venta', type: 'number', icon: '💰' },
        ],
        submitLabel: 'Crear Pedido',
        apiEndpoint: '/api/orders',
        apiMethod: 'POST',
        beforeSubmit: (data) => {
          // Auto-fill precio from product if not set
          if (!data.precio_venta) {
            const prod = products.find(p => p.nombre === data.producto);
            if (prod) {
              data.precio_venta = prod.precio_venta;
              data.precio_compra = prod.precio_compra;
            }
          }
          data.cantidad = parseInt(data.cantidad) || 1;
          data.precio_venta = parseFloat(data.precio_venta) || 0;
          return data;
        },
        successMsg: '✅ Pedido creado exitosamente',
        returnTo: 'module',
      });
    } catch (err) {
      showToast('Error al cargar datos', 'error');
    }
  },

  pedidos: () => App.showList({
    title: '📦 Pedidos',
    subtitle: 'Todos los pedidos registrados',
    apiEndpoint: '/api/orders',
    emptyIcon: '📦',
    emptyText: 'No hay pedidos registrados',
    addBtn: { label: '+ Nuevo Pedido', cmd: 'vender' },
    renderItem: (item) => ({
      icon: item.estado === 'Pagado' ? '✅' : item.estado === 'Entregado' ? '📦' : '🕐',
      title: `${item.producto} × ${item.cantidad}`,
      subtitle: `${item.cliente_nombre || 'Cliente'} · ${item.estado}`,
      detail: formatCOP(item.precio_venta * item.cantidad),
      data: item,
    }),
  }),

  entregar: () => App.showList({
    title: '✅ Marcar Entregado',
    subtitle: 'Selecciona el pedido entregado',
    apiEndpoint: '/api/orders?status=Pendiente',
    emptyIcon: '✅',
    emptyText: 'No hay pedidos pendientes de entrega',
    renderItem: (item) => ({
      icon: '📦',
      title: `${item.producto} × ${item.cantidad}`,
      subtitle: `${item.cliente_nombre || 'Cliente'}`,
      detail: formatCOP(item.precio_venta * item.cantidad),
      data: item,
    }),
    onItemClick: async (item) => {
      if (confirm(`¿Marcar como entregado?\n${item.producto} × ${item.cantidad}`)) {
        try {
          await API.post('/api/orders/deliver', { order_id: item.id });
          showToast('✅ Pedido marcado como entregado', 'info');
          CMD_HANDLERS.entregar(); // Refresh
        } catch (e) {
          showToast('Error al actualizar', 'error');
        }
      }
    },
  }),

  cobrar: () => App.showList({
    title: '💳 Cobros Pendientes',
    subtitle: 'Pedidos sin pagar',
    apiEndpoint: '/api/orders/unpaid',
    emptyIcon: '💳',
    emptyText: '¡Excelente! No tienes cobros pendientes',
    renderItem: (item) => ({
      icon: '💵',
      title: `${item.producto} × ${item.cantidad}`,
      subtitle: `${item.cliente_nombre || 'Cliente'} · ${item.estado}`,
      detail: formatCOP(item.precio_venta * item.cantidad),
      data: item,
    }),
  }),

  pagar: () => App.showList({
    title: '💵 Marcar Pagado',
    subtitle: 'Selecciona el pedido pagado',
    apiEndpoint: '/api/orders/unpaid',
    emptyIcon: '💵',
    emptyText: 'No hay pedidos pendientes de pago',
    renderItem: (item) => ({
      icon: '💰',
      title: `${item.producto} × ${item.cantidad}`,
      subtitle: `${item.cliente_nombre || 'Cliente'}`,
      detail: formatCOP(item.precio_venta * item.cantidad),
      data: item,
    }),
    onItemClick: async (item) => {
      if (confirm(`¿Marcar como pagado?\n${item.producto} — ${formatCOP(item.precio_venta * item.cantidad)}`)) {
        try {
          await API.post('/api/orders/pay', { order_id: item.id });
          showToast('✅ Pago registrado', 'info');
          CMD_HANDLERS.pagar(); // Refresh
        } catch (e) {
          showToast('Error al actualizar', 'error');
        }
      }
    },
  }),

  // PRECIOS
  precios: () => App.showList({
    title: '💰 Lista de Precios',
    subtitle: 'Tu catálogo de productos',
    apiEndpoint: '/api/products',
    itemsKey: 'products',
    emptyIcon: '💰',
    emptyText: 'No tienes productos. ¡Agrega el primero!',
    addBtn: { label: '+ Nuevo Producto', cmd: 'nuevo_producto' },
    renderItem: (item) => ({
      icon: '📦',
      title: item.nombre,
      subtitle: `Compra: ${formatCOP(item.precio_compra)} · Stock: ${item.stock || 0}`,
      detail: formatCOP(item.precio_venta),
    }),
  }),

  nuevo_producto: () => App.showForm({
    title: '📦 Nuevo Producto',
    subtitle: 'Agrega un producto a tu catálogo',
    fields: [
      { key: 'name', label: 'Nombre del producto', type: 'text', required: true, icon: '📦' },
      { key: 'buy_price', label: 'Precio de compra', type: 'number', icon: '💵' },
      { key: 'sell_price', label: 'Precio de venta', type: 'number', icon: '💰' },
      { key: 'stock', label: 'Stock inicial', type: 'number', icon: '📊' },
    ],
    submitLabel: 'Guardar Producto',
    apiEndpoint: '/api/products',
    apiMethod: 'POST',
    successMsg: '✅ Producto agregado',
    returnTo: 'module',
  }),

  configurar: () => CMD_HANDLERS.precios(),

  // FINANZAS
  caja: () => App.showResult({
    title: '💼 Estado de Caja',
    apiEndpoint: '/api/finance/summary',
    render: (data) => {
      const rows = [
        { icon: '💰', label: 'Total ventas', value: formatCOP(data.total_sales || 0), color: '#00E676' },
        { icon: '💵', label: 'Cobrado', value: formatCOP(data.total_collected || 0), color: '#00D4FF' },
        { icon: '📝', label: 'Gastos', value: formatCOP(data.total_expenses || 0), color: '#FF6B9D' },
        { icon: '💼', label: 'Utilidad neta', value: formatCOP((data.total_collected || 0) - (data.total_expenses || 0)), color: '#FFB74D' },
        { icon: '💳', label: 'Por cobrar', value: formatCOP(data.total_receivable || 0), color: '#BB86FC' },
      ];
      return rows.map(r => `
        <div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">
          <span>${r.icon} ${r.label}</span>
          <span style="font-weight:700;color:${r.color};">${r.value}</span>
        </div>
      `).join('');
    },
  }),

  cuentas_por_cobrar: () => App.showList({
    title: '💳 Cartera por Cobrar',
    subtitle: 'Clientes con saldo pendiente',
    apiEndpoint: '/api/finance/receivables',
    emptyIcon: '💳',
    emptyText: '¡Sin cuentas por cobrar!',
    renderItem: (item) => ({
      icon: '👤',
      title: item.cliente_nombre || 'Cliente',
      subtitle: `${item.pedidos_pendientes || 0} pedidos sin pagar`,
      detail: formatCOP(item.total_pendiente || 0),
    }),
  }),

  gasto: () => App.showForm({
    title: '📝 Registrar Gasto',
    subtitle: 'Anota un gasto del negocio',
    fields: [
      { key: 'concepto', label: 'Concepto / Descripción', type: 'text', required: true, icon: '📝' },
      { key: 'monto', label: 'Monto ($)', type: 'number', required: true, icon: '💰' },
    ],
    submitLabel: 'Registrar Gasto',
    apiEndpoint: '/api/expenses',
    apiMethod: 'POST',
    successMsg: '✅ Gasto registrado',
    returnTo: 'module',
  }),

  margen: () => App.showList({
    title: '📈 Margen de Rentabilidad',
    subtitle: 'Análisis por producto',
    apiEndpoint: '/api/finance/margin',
    emptyIcon: '📈',
    emptyText: 'Sin datos de margen. Registra ventas primero.',
    renderItem: (item) => {
      const margin = item.precio_venta && item.precio_compra
        ? Math.round(((item.precio_venta - item.precio_compra) / item.precio_venta) * 100) 
        : 0;
      return {
        icon: margin > 30 ? '🟢' : margin > 15 ? '🟡' : '🔴',
        title: item.producto || item.nombre,
        subtitle: `Compra: ${formatCOP(item.precio_compra)} → Venta: ${formatCOP(item.precio_venta)}`,
        detail: `${margin}%`,
      };
    },
  }),
};


// ─── TELEGRAM SDK ───
const tg = window.Telegram && window.Telegram.WebApp;
const IS_TELEGRAM = !!(tg && tg.initData);


// ─── API CLIENT ───
const API = {
  _baseUrl: '',

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (IS_TELEGRAM) {
      h['X-Telegram-Init-Data'] = tg.initData;
    } else {
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
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * eased);
    el.textContent = isCurrency ? formatCOP(current) : current.toString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function typewriter(el, text, speed = 40) {
  el.textContent = '';
  let i = 0;
  function tick() {
    if (i < text.length) { el.textContent += text.charAt(i); i++; setTimeout(tick, speed); }
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
  try {
    if (IS_TELEGRAM && tg.HapticFeedback) {
      if (type === 'light') tg.HapticFeedback.impactOccurred('light');
      else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    }
  } catch(e) {}
}


// ─── NAVIGATION STACK ───
const navStack = [];

function pushNav(screenId) {
  navStack.push(App.currentScreen);
  App.showScreen(screenId);
}

function popNav() {
  const prev = navStack.pop();
  if (prev) {
    App.showScreen(prev);
  } else {
    App.showScreen('dashboard');
  }
}


// ─── APP STATE ───
const App = {
  vendor: null,
  stats: null,
  currentScreen: 'loading',
  currentModuleKey: null,
  registrationData: {},

  // ─── SCREEN MANAGEMENT ───
  showScreen(screenId) {
    try {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const target = document.getElementById('screen-' + screenId);
      if (target) {
        target.classList.add('active');
        this.currentScreen = screenId;
      }
      if (IS_TELEGRAM) {
        try {
          if (['dashboard', 'welcome', 'loading', 'expired'].includes(screenId)) {
            tg.BackButton.hide();
          } else {
            tg.BackButton.show();
          }
        } catch(e) {}
      }
      haptic('light');
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
  },

  // ─── INIT ───
  async init() {
    if (IS_TELEGRAM) {
      tg.expand();
      tg.ready();
      tg.BackButton.onClick(() => popNav());
    }

    // Form enter key handlers
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

    // Back button handlers for dynamic screens
    document.getElementById('data-list-back').onclick = () => popNav();
    document.getElementById('data-form-back').onclick = () => popNav();
    document.getElementById('data-result-back').onclick = () => popNav();

    // Load vendor data
    try {
      const data = await API.get('/api/vendor');
      if (data.is_new) {
        this.showScreen('welcome');
        typewriter(document.getElementById('typewriter-target'), 'Tu asistente de ventas inteligente', 50);
        if (data.trial_days) {
          document.getElementById('trial-days-text').textContent = `${data.trial_days} días de prueba gratis`;
        }
        if (data.subscription_price) {
          document.getElementById('success-price').textContent = formatCOP(data.subscription_price) + '/mes';
          document.getElementById('expired-price').textContent = formatCOP(data.subscription_price);
        }
      } else {
        this.vendor = data.vendor;
        if (this._isExpired()) {
          this._renderExpired();
          this.showScreen('expired');
        } else {
          await this._loadDashboard();
          this.showScreen('dashboard');
        }
      }
    } catch (err) {
      console.error('Init failed:', err);
      showToast('Error al conectar con el servidor', 'error');
      this.showScreen('welcome');
      typewriter(document.getElementById('typewriter-target'), 'Tu asistente de ventas inteligente', 50);
    }
  },

  // ─── REGISTRATION ───
  goToRegisterStep2() {
    const name = document.getElementById('input-business-name').value.trim();
    const inputGroup = document.getElementById('input-business-name').closest('.input-group');
    if (!name) { inputGroup.classList.add('input-group--error'); haptic('error'); return; }
    inputGroup.classList.remove('input-group--error');
    this.registrationData.business_name = name;
    pushNav('register-2');
    setTimeout(() => document.getElementById('input-phone').focus(), 400);
  },

  async submitRegistration() {
    const phone = document.getElementById('input-phone').value.trim();
    const inputGroup = document.getElementById('input-phone').closest('.input-group');
    if (!phone || phone.length < 7) { inputGroup.classList.add('input-group--error'); haptic('error'); return; }
    inputGroup.classList.remove('input-group--error');
    this.registrationData.phone = phone;

    document.getElementById('btn-register-text').classList.add('hidden');
    document.getElementById('btn-register-spinner').classList.remove('hidden');
    document.getElementById('btn-register').disabled = true;

    try {
      const result = await API.post('/api/register', this.registrationData);
      this.vendor = result.vendor;
      document.getElementById('success-business').textContent = this.vendor.nombre_negocio || '';
      document.getElementById('success-phone').textContent = this.vendor.telefono_soporte || '';
      document.getElementById('success-trial-end').textContent = formatDate(this.vendor.fecha_vencimiento);
      haptic('success');
      spawnConfetti();
      this.showScreen('success');
    } catch (err) {
      haptic('error');
      showToast('Error al crear la cuenta. Intenta de nuevo.', 'error');
    } finally {
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

    document.getElementById('dash-business-name').textContent = v.nombre_negocio || 'Mi Negocio';
    document.getElementById('dash-date').textContent = todayFormatted();

    const badge = document.getElementById('dash-badge');
    if (v.estado === 'Activo') { badge.textContent = '🟢 Activo'; badge.className = 'badge badge--active'; }
    else if (v.estado === 'Prueba') { badge.textContent = '🟡 Prueba'; badge.className = 'badge badge--trial'; }
    else { badge.textContent = '🔴 Inactivo'; badge.className = 'badge badge--expired'; }

    if (s) {
      animateCounter(document.getElementById('kpi-clients'), s.total_clients || 0);
      animateCounter(document.getElementById('kpi-pending'), s.pending_orders || 0);
      animateCounter(document.getElementById('kpi-unpaid'), s.unpaid || 0);
      animateCounter(document.getElementById('kpi-sales'), s.today_sales || 0, 1000, true);
      document.getElementById('kpi-clients-detail').textContent =
        `${s.active_clients || 0} activos · ${s.prospects || 0} prospectos`;
    }

    // Module grid
    const grid = document.getElementById('module-grid');
    grid.innerHTML = '';
    for (const [key, mod] of Object.entries(MODULES)) {
      const card = document.createElement('div');
      card.className = 'module-card';
      card.setAttribute('data-module', key);
      card.innerHTML = `
        <div class="module-card__icon">${mod.icon}</div>
        <span class="module-card__title">${mod.title}</span>
        <span class="module-card__desc">${mod.desc}</span>
      `;
      grid.appendChild(card);
    }

    grid.onclick = (e) => {
      const card = e.target.closest('[data-module]');
      if (card) {
        e.preventDefault();
        const moduleKey = card.getAttribute('data-module');
        this.openModule(moduleKey);
      }
    };

    this._renderAccount();
  },

  _renderAccount() {
    const v = this.vendor;
    if (!v) return;
    document.getElementById('acct-business').textContent = v.nombre_negocio || '';
    document.getElementById('acct-phone').textContent = v.telefono_soporte || 'N/A';
    document.getElementById('acct-expiry').textContent = formatDate(v.fecha_vencimiento);
    document.getElementById('acct-id').textContent = v.id || '';
    document.getElementById('acct-products').textContent = this.stats ? (this.stats.products_count || 0) : '0';

    const badge = document.getElementById('acct-badge');
    if (v.estado === 'Activo') { badge.textContent = '🟢 Activo'; badge.className = 'badge badge--active'; }
    else if (v.estado === 'Prueba') { badge.textContent = '🟡 Prueba'; badge.className = 'badge badge--trial'; }
    else { badge.textContent = '🔴 Inactivo'; badge.className = 'badge badge--expired'; }

    const bar = document.getElementById('acct-sub-bar');
    const subText = document.getElementById('acct-sub-text');
    if (v.fecha_vencimiento) {
      const now = new Date();
      const expiry = new Date(v.fecha_vencimiento + 'T00:00:00');
      const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      const pct = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
      bar.style.width = pct + '%';
      bar.className = 'subscription-bar__fill ' +
        (pct > 30 ? 'subscription-bar__fill--healthy' : 'subscription-bar__fill--warning');
      subText.textContent = daysLeft > 0 ? `${daysLeft} días restantes` : 'Suscripción vencida';
    }
  },

  // ─── MODULE DETAIL ───
  openModule(key) {
    try {
      const mod = MODULES[key];
      if (!mod) return;
      this.currentModuleKey = key;
      haptic('light');

      document.getElementById('mod-title').textContent = `${mod.icon} ${mod.title}`;
      document.getElementById('mod-desc').textContent = mod.desc;

      const list = document.getElementById('action-list');
      list.innerHTML = '';

      const self = this;
      mod.commands.forEach(cmd => {
        const item = document.createElement('div');
        item.className = 'action-item';
        item.style.cssText = 'cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(108,60,225,0.2);user-select:none;-webkit-user-select:none;';

        item.innerHTML = `
          <span class="action-item__icon">${cmd.icon}</span>
          <span class="action-item__label">${cmd.label}</span>
          <span class="action-item__arrow">→</span>
        `;

        // Direct click listener per item (more reliable in Telegram WebView)
        item.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          self.executeCommand(cmd.cmd);
        });

        list.appendChild(item);
      });

      pushNav('module');
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
  },

  // ─── EXECUTE COMMAND (in-app, no chat fallback) ───
  executeCommand(cmd) {
    haptic('medium');
    const handler = CMD_HANDLERS[cmd];
    if (handler) {
      handler();
    } else {
      showToast(`Función "${cmd}" próximamente disponible`, 'info');
    }
  },

  // ─── GENERIC LIST SCREEN ───
  async showList(config) {
    const {
      title, subtitle, apiEndpoint, emptyIcon, emptyText,
      searchable, searchEndpoint, addBtn, renderItem,
      onItemClick, startWithSearch, itemsKey,
    } = config;

    document.getElementById('data-list-title').textContent = title;
    document.getElementById('data-list-subtitle').textContent = subtitle || '';
    document.getElementById('data-list-empty-icon').textContent = emptyIcon || '📭';
    document.getElementById('data-list-empty-text').textContent = emptyText || 'No hay datos';

    const itemsContainer = document.getElementById('data-list-items');
    const emptyContainer = document.getElementById('data-list-empty');
    const searchWrap = document.getElementById('data-list-search-wrap');
    const searchInput = document.getElementById('data-list-search');
    const addBtnEl = document.getElementById('data-list-add-btn');

    itemsContainer.innerHTML = '';
    emptyContainer.classList.add('hidden');

    // Search
    if (searchable) {
      searchWrap.classList.remove('hidden');
      searchInput.value = '';
      let searchTimeout;
      searchInput.oninput = () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
          const q = searchInput.value.trim();
          if (q.length < 2) {
            if (!startWithSearch) loadItems();
            return;
          }
          try {
            const data = await API.post(searchEndpoint, { query: q });
            renderItems(data.items || []);
          } catch (e) {
            showToast('Error en búsqueda', 'error');
          }
        }, 400);
      };
    } else {
      searchWrap.classList.add('hidden');
    }

    // Add button
    if (addBtn) {
      addBtnEl.classList.remove('hidden');
      addBtnEl.textContent = addBtn.label;
      addBtnEl.onclick = () => this.executeCommand(addBtn.cmd);
    } else {
      addBtnEl.classList.add('hidden');
    }

    // Render function
    const renderItems = (items) => {
      itemsContainer.innerHTML = '';
      if (!items || items.length === 0) {
        itemsContainer.classList.add('hidden');
        emptyContainer.classList.remove('hidden');
        return;
      }
      itemsContainer.classList.remove('hidden');
      emptyContainer.classList.add('hidden');

      items.forEach((rawItem, idx) => {
        const display = renderItem(rawItem);
        const row = document.createElement('div');
        row.className = 'action-item';
        row.setAttribute('data-idx', idx);
        row.innerHTML = `
          <span class="action-item__icon">${display.icon}</span>
          <div style="flex:1;min-width:0;">
            <div class="action-item__label">${display.title}</div>
            <div style="font-size:0.75rem;color:var(--c-text-muted);margin-top:2px;">${display.subtitle || ''}</div>
          </div>
          ${display.detail ? `<span style="font-weight:600;color:var(--c-accent);white-space:nowrap;">${display.detail}</span>` : ''}
        `;
        itemsContainer.appendChild(row);
      });

      // Click handling
      if (onItemClick) {
        itemsContainer.onclick = (e) => {
          const row = e.target.closest('[data-idx]');
          if (row) {
            const idx = parseInt(row.getAttribute('data-idx'));
            onItemClick(items[idx]);
          }
        };
      }
    };

    // Initial load
    const loadItems = async () => {
      try {
        itemsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--c-text-muted);">Cargando...</div>';
        const data = await API.get(apiEndpoint);
        const key = itemsKey || 'items';
        renderItems(data[key] || []);
      } catch (err) {
        showToast('Error al cargar datos', 'error');
        itemsContainer.innerHTML = '';
        emptyContainer.classList.remove('hidden');
      }
    };

    pushNav('data-list');

    if (!startWithSearch) {
      await loadItems();
    } else {
      emptyContainer.classList.remove('hidden');
      setTimeout(() => searchInput.focus(), 400);
    }
  },

  // ─── GENERIC FORM SCREEN ───
  showForm(config) {
    const {
      title, subtitle, fields, submitLabel, apiEndpoint,
      apiMethod, successMsg, returnTo, beforeSubmit,
    } = config;

    document.getElementById('data-form-title').textContent = title;
    document.getElementById('data-form-subtitle').textContent = subtitle || '';
    document.getElementById('data-form-submit-text').textContent = submitLabel || 'Guardar';

    const container = document.getElementById('data-form-fields');
    container.innerHTML = '';

    // Build form fields
    fields.forEach(field => {
      const group = document.createElement('div');
      group.className = 'input-group w-full';

      if (field.type === 'select') {
        const select = document.createElement('select');
        select.className = 'input-group__input';
        select.id = `form-field-${field.key}`;
        select.style.cssText = 'appearance:auto;background:var(--c-bg-card);color:var(--c-text);border:1px solid var(--c-border);padding:14px 16px;border-radius:12px;width:100%;font-size:0.95rem;';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = `${field.icon || ''} ${field.label}`;
        select.appendChild(defaultOpt);

        const options = field.options || [];
        options.forEach(opt => {
          const o = document.createElement('option');
          if (typeof opt === 'object') {
            o.value = opt.value;
            o.textContent = opt.label;
          } else {
            o.value = opt;
            o.textContent = opt;
          }
          select.appendChild(o);
        });

        group.appendChild(select);
      } else {
        group.innerHTML = `
          <input type="${field.type || 'text'}" id="form-field-${field.key}" class="input-group__input" 
                 placeholder=" " autocomplete="off" ${field.required ? 'required' : ''}
                 ${field.type === 'number' ? 'inputmode="numeric" step="any"' : ''}>
          <label class="input-group__label" for="form-field-${field.key}">${field.icon || ''} ${field.label}</label>
        `;
      }

      container.appendChild(group);
    });

    // Submit handler
    const submitBtn = document.getElementById('data-form-submit');
    const submitText = document.getElementById('data-form-submit-text');
    const spinner = document.getElementById('data-form-spinner');

    submitBtn.onclick = async () => {
      // Collect form data
      let formData = {};
      let hasError = false;

      fields.forEach(field => {
        const el = document.getElementById(`form-field-${field.key}`);
        const val = el ? el.value.trim() : '';
        if (field.required && !val) {
          hasError = true;
          if (el) el.style.borderColor = '#FF6B9D';
        } else if (el) {
          el.style.borderColor = '';
        }
        formData[field.key] = field.type === 'number' ? parseFloat(val) || 0 : val;
      });

      if (hasError) {
        haptic('error');
        showToast('Completa los campos requeridos', 'error');
        return;
      }

      // Transform data if needed
      if (beforeSubmit) {
        formData = beforeSubmit(formData);
      }

      // Submit
      submitText.classList.add('hidden');
      spinner.classList.remove('hidden');
      submitBtn.disabled = true;

      try {
        await API.post(apiEndpoint, formData);
        haptic('success');
        showToast(successMsg || '✅ Guardado exitosamente', 'info');
        popNav();
      } catch (err) {
        haptic('error');
        showToast('Error al guardar: ' + (err.message || 'intenta de nuevo'), 'error');
      } finally {
        submitText.classList.remove('hidden');
        spinner.classList.add('hidden');
        submitBtn.disabled = false;
      }
    };

    pushNav('data-form');
    // Focus first text input
    setTimeout(() => {
      const first = container.querySelector('input[type="text"]');
      if (first) first.focus();
    }, 400);
  },

  // ─── GENERIC RESULT SCREEN ───
  async showResult(config) {
    const { title, apiEndpoint, render } = config;

    document.getElementById('data-result-title').textContent = title;
    const content = document.getElementById('data-result-content');
    content.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-text-muted);">Cargando...</div>';

    pushNav('data-result');

    try {
      const data = await API.get(apiEndpoint);
      content.innerHTML = render(data);
    } catch (err) {
      content.innerHTML = `
        <div style="text-align:center;padding:32px;">
          <div style="font-size:2rem;margin-bottom:12px;">❌</div>
          <p style="color:var(--c-text-muted);">Error al cargar datos</p>
        </div>
      `;
    }
  },

  // ─── SEND COMMAND (legacy fallback — unused now) ───
  sendCommand(cmd) {
    this.executeCommand(cmd);
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
      document.getElementById('expired-date').textContent = formatDate(this.vendor.fecha_vencimiento);
    }
  },
};


// ─── BOOT ───
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
