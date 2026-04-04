/* ==========================================================================
   CONTROLIA SAAS — Mini App Logic v3 (Clean Rebuild)
   Full in-app command execution
   ========================================================================== */

// ─── MODULE DEFINITIONS ───
var MODULES = {
  crm: {
    icon: '👥', title: 'CRM',
    desc: 'Gestión de clientes, notas y seguimiento',
    commands: [
      { icon: '👤', label: 'Nuevo Cliente', cmd: 'nuevo_cliente' },
      { icon: '👥', label: 'Ver Cartera', cmd: 'clientes' },
      { icon: '🔍', label: 'Buscar Cliente', cmd: 'buscar' },
      { icon: '📊', label: 'Pipeline Comercial', cmd: 'seguimiento' },
      { icon: '📝', label: 'Agregar Nota', cmd: 'nota' },
      { icon: '📋', label: 'Ficha de Cliente', cmd: 'ficha' },
      { icon: '📡', label: 'Radar de Clientes', cmd: 'radar' },
      { icon: '📅', label: 'Asignar Día de Visita', cmd: 'asignar_dia' }
    ]
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
      { icon: '🔄', label: 'Repetir Último Pedido', cmd: 'repetir' }
    ]
  },
  documentos: {
    icon: '📄', title: 'DOCUMENTOS',
    desc: 'Remisiones, despachos y cotizaciones',
    commands: [
      { icon: '📄', label: 'Generar Remisión', cmd: 'remision' },
      { icon: '🚛', label: 'Despacho de Mercancía', cmd: 'despacho' },
      { icon: '💰', label: 'Ver Lista de Precios', cmd: 'precios' },
      { icon: '📋', label: 'Cotización', cmd: 'cotizar' }
    ]
  },
  logistica: {
    icon: '🚛', title: 'LOGÍSTICA',
    desc: 'Inventario y rutas de entrega',
    commands: [
      { icon: '📦', label: 'Control de Inventario', cmd: 'inventario' },
      { icon: '🚶', label: 'Ruta a Pie', cmd: 'ruta_pie' },
      { icon: '🚛', label: 'Ruta en Camión', cmd: 'ruta_camion' },
      { icon: '📅', label: 'Ruta Semanal', cmd: 'ruta_semanal' }
    ]
  },
  finanzas: {
    icon: '💼', title: 'FINANZAS',
    desc: 'Caja, cartera, márgenes y metas',
    commands: [
      { icon: '💼', label: 'Estado de Caja', cmd: 'caja' },
      { icon: '💳', label: 'Cartera x Cobrar', cmd: 'cuentas_por_cobrar' },
      { icon: '📝', label: 'Registrar Gasto', cmd: 'gasto' },
      { icon: '📈', label: 'Margen Rentabilidad', cmd: 'margen' },
      { icon: '🎯', label: 'Ver Meta Mensual', cmd: 'meta' },
      { icon: '⚙️', label: 'Configurar Meta', cmd: 'meta_set' }
    ]
  },
  admin: {
    icon: '⚙️', title: 'ADMIN',
    desc: 'Configuración, edición y respaldo',
    commands: [
      { icon: '📦', label: 'Configurar Productos', cmd: 'configurar' },
      { icon: '📦', label: 'Agregar Producto', cmd: 'nuevo_producto' },
      { icon: '✏️', label: 'Editar Registro', cmd: 'editar' },
      { icon: '🗑️', label: 'Eliminar Registro', cmd: 'eliminar' },
      { icon: '💾', label: 'Respaldar Datos', cmd: 'backup' }
    ]
  }
};


// ─── TELEGRAM SDK ───
var tg = window.Telegram && window.Telegram.WebApp;
var IS_TELEGRAM = !!(tg && tg.initData);


// ─── API CLIENT ───
var API = {
  _baseUrl: '',

  _headers: function() {
    var h = { 'Content-Type': 'application/json' };
    if (IS_TELEGRAM) {
      h['X-Telegram-Init-Data'] = tg.initData;
    } else {
      h['X-Dev-Vendor-Id'] = '12345';
    }
    return h;
  },

  get: function(endpoint) {
    return fetch(this._baseUrl + endpoint, { headers: this._headers() })
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      });
  },

  post: function(endpoint, body) {
    return fetch(this._baseUrl + endpoint, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body)
    })
    .then(function(resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    });
  }
};


// ─── HELPERS ───
function formatCOP(amount) {
  try { return '$' + Math.round(amount).toLocaleString('es-CO').replace(/,/g, '.'); }
  catch(e) { return '$0'; }
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayFormatted() {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function animateCounter(el, target, duration, isCurrency) {
  if (!el) return;
  duration = duration || 800;
  var startTime = performance.now();
  function update(currentTime) {
    var elapsed = currentTime - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(target * eased);
    el.textContent = isCurrency ? formatCOP(current) : current.toString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function typewriter(el, text, speed) {
  if (!el) return;
  el.textContent = '';
  speed = speed || 40;
  var i = 0;
  function tick() {
    if (i < text.length) { el.textContent += text.charAt(i); i++; setTimeout(tick, speed); }
  }
  tick();
}

function spawnConfetti() {
  var container = document.getElementById('confetti');
  if (!container) return;
  container.innerHTML = '';
  var colors = ['#6C3CE1', '#00D4FF', '#FF6B9D', '#00E676', '#FFB74D', '#FFFFFF'];
  for (var i = 0; i < 40; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.8 + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.width = (5 + Math.random() * 6) + 'px';
    piece.style.height = (5 + Math.random() * 6) + 'px';
    container.appendChild(piece);
  }
  setTimeout(function() { container.innerHTML = ''; }, 4000);
}

function showToast(message, type, duration) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast toast--' + (type || 'info') + ' show';
  setTimeout(function() { toast.classList.remove('show'); }, duration || 3000);
}

function haptic(type) {
  try {
    if (IS_TELEGRAM && tg.HapticFeedback) {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else tg.HapticFeedback.impactOccurred(type || 'light');
    }
  } catch(e) {}
}


// ─── NAVIGATION STACK ───
var navStack = [];

function pushNav(screenId) {
  navStack.push(App.currentScreen);
  App.showScreen(screenId);
}

function popNav() {
  var prev = navStack.pop();
  App.showScreen(prev || 'dashboard');
}


// ─── MAIN APP ───
var App = {
  vendor: null,
  stats: null,
  currentScreen: 'loading',
  currentModuleKey: null,
  registrationData: {},

  // ── Screen Management ──
  showScreen: function(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var target = document.getElementById('screen-' + screenId);
    if (target) {
      target.classList.add('active');
      App.currentScreen = screenId;
    }
    if (IS_TELEGRAM) {
      try {
        if (['dashboard', 'welcome', 'loading', 'expired'].indexOf(screenId) >= 0) {
          tg.BackButton.hide();
        } else {
          tg.BackButton.show();
        }
      } catch(e) {}
    }
    haptic('light');
  },

  // ── Boot ──
  init: function() {
    if (IS_TELEGRAM) {
      try {
        tg.expand();
        tg.ready();
        tg.BackButton.onClick(function() { popNav(); });
      } catch(e) { console.warn('TG SDK:', e); }
    }

    // Back buttons for dynamic screens
    var dlBack = document.getElementById('data-list-back');
    var dfBack = document.getElementById('data-form-back');
    var drBack = document.getElementById('data-result-back');
    if (dlBack) dlBack.addEventListener('click', function() { popNav(); });
    if (dfBack) dfBack.addEventListener('click', function() { popNav(); });
    if (drBack) drBack.addEventListener('click', function() { popNav(); });

    // Load vendor data
    API.get('/api/vendor')
      .then(function(data) {
        if (data.is_new) {
          App.showScreen('welcome');
          typewriter(document.getElementById('typewriter-target'), 'Tu asistente de ventas inteligente', 50);
          var trialText = document.getElementById('trial-days-text');
          if (trialText && data.trial_days) trialText.textContent = data.trial_days + ' días de prueba gratis';
          var successPrice = document.getElementById('success-price');
          if (successPrice && data.subscription_price) successPrice.textContent = formatCOP(data.subscription_price) + '/mes';
          var expiredPrice = document.getElementById('expired-price');
          if (expiredPrice && data.subscription_price) expiredPrice.textContent = formatCOP(data.subscription_price);
        } else {
          App.vendor = data.vendor;
          if (App._isExpired()) {
            App._renderExpired();
            App.showScreen('expired');
          } else {
            App._loadDashboard();
          }
        }
      })
      .catch(function(err) {
        console.error('Init failed:', err);
        showToast('Error al conectar con el servidor', 'error');
        App.showScreen('welcome');
        typewriter(document.getElementById('typewriter-target'), 'Tu asistente de ventas inteligente', 50);
      });
  },

  // ── Registration ──
  goToRegisterStep2: function() {
    var input = document.getElementById('input-business-name');
    var name = input ? input.value.trim() : '';
    var group = input ? input.closest('.input-group') : null;
    if (!name) { if (group) group.classList.add('input-group--error'); haptic('error'); return; }
    if (group) group.classList.remove('input-group--error');
    App.registrationData.business_name = name;
    pushNav('register-2');
    setTimeout(function() { var el = document.getElementById('input-phone'); if (el) el.focus(); }, 400);
  },

  submitRegistration: function() {
    var input = document.getElementById('input-phone');
    var phone = input ? input.value.trim() : '';
    var group = input ? input.closest('.input-group') : null;
    if (!phone || phone.length < 7) { if (group) group.classList.add('input-group--error'); haptic('error'); return; }
    if (group) group.classList.remove('input-group--error');
    App.registrationData.phone = phone;

    var btnText = document.getElementById('btn-register-text');
    var spinner = document.getElementById('btn-register-spinner');
    var btn = document.getElementById('btn-register');
    if (btnText) btnText.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (btn) btn.disabled = true;

    API.post('/api/register', App.registrationData)
      .then(function(result) {
        App.vendor = result.vendor;
        var sb = document.getElementById('success-business');
        if (sb) sb.textContent = App.vendor.nombre_negocio || '';
        var sp = document.getElementById('success-phone');
        if (sp) sp.textContent = App.vendor.telefono_soporte || '';
        var ste = document.getElementById('success-trial-end');
        if (ste) ste.textContent = formatDate(App.vendor.fecha_vencimiento);
        haptic('success');
        spawnConfetti();
        App.showScreen('success');
      })
      .catch(function() {
        haptic('error');
        showToast('Error al crear la cuenta. Intenta de nuevo.', 'error');
      })
      .finally(function() {
        if (btnText) btnText.classList.remove('hidden');
        if (spinner) spinner.classList.add('hidden');
        if (btn) btn.disabled = false;
      });
  },

  // ── Dashboard ──
  _loadDashboard: function() {
    API.get('/api/dashboard')
      .then(function(data) {
        App.vendor = data.vendor;
        App.stats = data.stats;
        App._renderDashboard();
        App.showScreen('dashboard');
      })
      .catch(function() {
        showToast('Error al cargar el panel', 'error');
        App.showScreen('dashboard');
      });
  },

  _renderDashboard: function() {
    var v = App.vendor;
    var s = App.stats;
    if (!v) return;

    var bn = document.getElementById('dash-business-name');
    if (bn) bn.textContent = v.nombre_negocio || 'Mi Negocio';
    var dd = document.getElementById('dash-date');
    if (dd) dd.textContent = todayFormatted();

    var badge = document.getElementById('dash-badge');
    if (badge) {
      if (v.estado === 'Activo') { badge.textContent = '🟢 Activo'; badge.className = 'badge badge--active'; }
      else if (v.estado === 'Prueba') { badge.textContent = '🟡 Prueba'; badge.className = 'badge badge--trial'; }
      else { badge.textContent = '🔴 Inactivo'; badge.className = 'badge badge--expired'; }
    }

    if (s) {
      animateCounter(document.getElementById('kpi-clients'), s.total_clients || 0);
      animateCounter(document.getElementById('kpi-pending'), s.pending_orders || 0);
      animateCounter(document.getElementById('kpi-unpaid'), s.unpaid || 0);
      animateCounter(document.getElementById('kpi-sales'), s.today_sales || 0, 1000, true);
      var detail = document.getElementById('kpi-clients-detail');
      if (detail) detail.textContent = (s.active_clients || 0) + ' activos · ' + (s.prospects || 0) + ' prospectos';
    }

    // Module grid
    var grid = document.getElementById('module-grid');
    if (!grid) return;
    grid.innerHTML = '';

    Object.keys(MODULES).forEach(function(key) {
      var mod = MODULES[key];
      var card = document.createElement('div');
      card.className = 'module-card';
      card.setAttribute('onclick', 'App.openModule("' + key + '")');
      card.innerHTML = '<div class="module-card__icon" style="pointer-events:none">' + mod.icon + '</div>' +
        '<span class="module-card__title" style="pointer-events:none">' + mod.title + '</span>' +
        '<span class="module-card__desc" style="pointer-events:none">' + mod.desc + '</span>';
      grid.appendChild(card);
    });

    App._renderAccount();
  },

  _renderAccount: function() {
    var v = App.vendor;
    if (!v) return;
    var el;
    el = document.getElementById('acct-business'); if (el) el.textContent = v.nombre_negocio || '';
    el = document.getElementById('acct-phone'); if (el) el.textContent = v.telefono_soporte || 'N/A';
    el = document.getElementById('acct-expiry'); if (el) el.textContent = formatDate(v.fecha_vencimiento);
    el = document.getElementById('acct-id'); if (el) el.textContent = v.id || '';
    el = document.getElementById('acct-products'); if (el) el.textContent = App.stats ? (App.stats.products_count || 0) : '0';

    var badge = document.getElementById('acct-badge');
    if (badge) {
      if (v.estado === 'Activo') { badge.textContent = '🟢 Activo'; badge.className = 'badge badge--active'; }
      else if (v.estado === 'Prueba') { badge.textContent = '🟡 Prueba'; badge.className = 'badge badge--trial'; }
      else { badge.textContent = '🔴 Inactivo'; badge.className = 'badge badge--expired'; }
    }

    var bar = document.getElementById('acct-sub-bar');
    var subText = document.getElementById('acct-sub-text');
    if (v.fecha_vencimiento && bar && subText) {
      var now = new Date();
      var expiry = new Date(v.fecha_vencimiento + 'T00:00:00');
      var daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
      var pct = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
      bar.style.width = pct + '%';
      bar.className = 'subscription-bar__fill ' + (pct > 30 ? 'subscription-bar__fill--healthy' : 'subscription-bar__fill--warning');
      subText.textContent = daysLeft > 0 ? daysLeft + ' días restantes' : 'Suscripción vencida';
    }
  },

  // ── Module Detail ──
  openModule: function(key) {
    var mod = MODULES[key];
    if (!mod) return;
    App.currentModuleKey = key;
    haptic('light');

    var modTitle = document.getElementById('mod-title');
    var modDesc = document.getElementById('mod-desc');
    if (modTitle) modTitle.textContent = mod.icon + ' ' + mod.title;
    if (modDesc) modDesc.textContent = mod.desc;

    var list = document.getElementById('action-list');
    if (!list) return;
    list.innerHTML = '';

    mod.commands.forEach(function(cmd) {
      var item = document.createElement('div');
      item.className = 'action-item';
      item.setAttribute('onclick', 'App.executeCommand("' + cmd.cmd + '")');
      item.innerHTML = '<span class="action-item__icon" style="pointer-events:none">' + cmd.icon + '</span>' +
        '<span class="action-item__label" style="pointer-events:none">' + cmd.label + '</span>' +
        '<span class="action-item__arrow" style="pointer-events:none">→</span>';
      list.appendChild(item);
    });

    pushNav('module');
  },

  // ── Execute Command ──
  executeCommand: function(cmd) {
    haptic('medium');
    var handler = CMD_HANDLERS[cmd];
    if (handler) {
      handler();
    } else {
      showToast('Función "' + cmd + '" próximamente', 'info');
    }
  },

  // ── Generic List Screen ──
  showList: function(config) {
    var titleEl = document.getElementById('data-list-title');
    var subtitleEl = document.getElementById('data-list-subtitle');
    var itemsContainer = document.getElementById('data-list-items');
    var emptyContainer = document.getElementById('data-list-empty');
    var searchWrap = document.getElementById('data-list-search-wrap');
    var searchInput = document.getElementById('data-list-search');
    var addBtnEl = document.getElementById('data-list-add-btn');

    if (titleEl) titleEl.textContent = config.title || 'Lista';
    if (subtitleEl) subtitleEl.textContent = config.subtitle || '';
    if (itemsContainer) itemsContainer.innerHTML = '';
    if (emptyContainer) emptyContainer.classList.add('hidden');

    var emptyIcon = document.getElementById('data-list-empty-icon');
    var emptyText = document.getElementById('data-list-empty-text');
    if (emptyIcon) emptyIcon.textContent = config.emptyIcon || '📭';
    if (emptyText) emptyText.textContent = config.emptyText || 'No hay datos';

    // Search
    if (config.searchable && searchWrap && searchInput) {
      searchWrap.classList.remove('hidden');
      searchInput.value = '';
      var searchTimeout;
      searchInput.oninput = function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          var q = searchInput.value.trim();
          if (q.length < 2) { if (!config.startWithSearch) loadItems(); return; }
          API.post(config.searchEndpoint, { query: q })
            .then(function(data) { renderItems(data.items || []); })
            .catch(function() { showToast('Error en búsqueda', 'error'); });
        }, 400);
      };
    } else if (searchWrap) {
      searchWrap.classList.add('hidden');
    }

    // Add button
    if (config.addBtn && addBtnEl) {
      addBtnEl.classList.remove('hidden');
      addBtnEl.textContent = config.addBtn.label;
      addBtnEl.onclick = function() { App.executeCommand(config.addBtn.cmd); };
    } else if (addBtnEl) {
      addBtnEl.classList.add('hidden');
    }

    function renderItems(items) {
      if (!itemsContainer) return;
      itemsContainer.innerHTML = '';
      if (!items || items.length === 0) {
        itemsContainer.classList.add('hidden');
        if (emptyContainer) emptyContainer.classList.remove('hidden');
        return;
      }
      itemsContainer.classList.remove('hidden');
      if (emptyContainer) emptyContainer.classList.add('hidden');

      items.forEach(function(rawItem, idx) {
        var display = config.renderItem(rawItem);
        var row = document.createElement('div');
        row.className = 'action-item';
        row.style.cssText = 'cursor:pointer;touch-action:manipulation;';
        row.innerHTML = '<span class="action-item__icon">' + display.icon + '</span>' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="action-item__label">' + display.title + '</div>' +
            '<div style="font-size:0.75rem;color:var(--c-text-muted);margin-top:2px;">' + (display.subtitle || '') + '</div>' +
          '</div>' +
          (display.detail ? '<span style="font-weight:600;color:var(--c-accent);white-space:nowrap;">' + display.detail + '</span>' : '');

        if (config.onItemClick) {
          row.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            config.onItemClick(rawItem);
          });
        }

        itemsContainer.appendChild(row);
      });
    }

    function loadItems() {
      if (!itemsContainer) return;
      itemsContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--c-text-muted);">Cargando...</div>';
      var key = config.itemsKey || 'items';
      API.get(config.apiEndpoint)
        .then(function(data) { renderItems(data[key] || []); })
        .catch(function() {
          showToast('Error al cargar datos', 'error');
          if (itemsContainer) itemsContainer.innerHTML = '';
          if (emptyContainer) emptyContainer.classList.remove('hidden');
        });
    }

    pushNav('data-list');

    if (!config.startWithSearch) {
      loadItems();
    } else {
      if (emptyContainer) emptyContainer.classList.remove('hidden');
      setTimeout(function() { if (searchInput) searchInput.focus(); }, 400);
    }
  },

  // ── Generic Form Screen ──
  showForm: function(config) {
    var titleEl = document.getElementById('data-form-title');
    var subtitleEl = document.getElementById('data-form-subtitle');
    var submitTextEl = document.getElementById('data-form-submit-text');
    var container = document.getElementById('data-form-fields');
    var submitBtn = document.getElementById('data-form-submit');
    var spinner = document.getElementById('data-form-spinner');

    if (titleEl) titleEl.textContent = config.title || 'Formulario';
    if (subtitleEl) subtitleEl.textContent = config.subtitle || '';
    if (submitTextEl) submitTextEl.textContent = config.submitLabel || 'Guardar';
    if (container) container.innerHTML = '';

    // Build form fields
    var fields = config.fields || [];
    fields.forEach(function(field) {
      var group = document.createElement('div');
      group.className = 'input-group w-full';
      group.style.marginBottom = '12px';

      if (field.type === 'select') {
        var select = document.createElement('select');
        select.id = 'form-field-' + field.key;
        select.style.cssText = 'appearance:auto;background:var(--c-bg-card);color:var(--c-text);border:1px solid var(--c-border);padding:14px 16px;border-radius:12px;width:100%;font-size:0.95rem;';
        var defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = (field.icon || '') + ' ' + field.label;
        select.appendChild(defOpt);
        var opts = field.options || [];
        opts.forEach(function(opt) {
          var o = document.createElement('option');
          if (typeof opt === 'object') { o.value = opt.value; o.textContent = opt.label; }
          else { o.value = opt; o.textContent = opt; }
          select.appendChild(o);
        });
        group.appendChild(select);
      } else {
        var inputType = field.type || 'text';
        var placeholderText = (field.icon || '') + ' ' + field.label;
        group.innerHTML = '<input type="' + inputType + '" id="form-field-' + field.key + '" ' +
          'placeholder="' + placeholderText + '" autocomplete="off" ' +
          (field.required ? 'required' : '') + ' ' +
          (inputType === 'number' ? 'inputmode="numeric" step="any"' : '') +
          ' style="width:100%;padding:14px 16px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:12px;color:var(--c-text);font-size:0.95rem;font-family:inherit;outline:none;">';
      }

      if (container) container.appendChild(group);
    });

    // Submit handler
    if (submitBtn) {
      submitBtn.onclick = function() {
        var formData = {};
        var hasError = false;

        fields.forEach(function(field) {
          var el = document.getElementById('form-field-' + field.key);
          var val = el ? el.value.trim() : '';
          if (field.required && !val) {
            hasError = true;
            if (el) el.style.borderColor = '#FF6B9D';
          } else if (el) {
            el.style.borderColor = '';
          }
          formData[field.key] = field.type === 'number' ? (parseFloat(val) || 0) : val;
        });

        if (hasError) { haptic('error'); showToast('Completa los campos requeridos', 'error'); return; }

        if (config.beforeSubmit) formData = config.beforeSubmit(formData);

        if (submitTextEl) submitTextEl.classList.add('hidden');
        if (spinner) spinner.classList.remove('hidden');
        submitBtn.disabled = true;

        API.post(config.apiEndpoint, formData)
          .then(function() {
            haptic('success');
            showToast(config.successMsg || '✅ Guardado', 'info');
            popNav();
          })
          .catch(function(err) {
            haptic('error');
            showToast('Error al guardar', 'error');
          })
          .finally(function() {
            if (submitTextEl) submitTextEl.classList.remove('hidden');
            if (spinner) spinner.classList.add('hidden');
            submitBtn.disabled = false;
          });
      };
    }

    pushNav('data-form');
    setTimeout(function() {
      if (container) {
        var first = container.querySelector('input[type="text"]');
        if (first) first.focus();
      }
    }, 400);
  },

  // ── Generic Result Screen ──
  showResult: function(config) {
    var titleEl = document.getElementById('data-result-title');
    var content = document.getElementById('data-result-content');

    if (titleEl) titleEl.textContent = config.title || 'Resultado';
    if (content) content.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-text-muted);">Cargando...</div>';

    pushNav('data-result');

    API.get(config.apiEndpoint)
      .then(function(data) {
        if (content) content.innerHTML = config.render(data);
      })
      .catch(function() {
        if (content) content.innerHTML = '<div style="text-align:center;padding:32px;"><div style="font-size:2rem;margin-bottom:12px;">❌</div><p style="color:var(--c-text-muted);">Error al cargar datos</p></div>';
      });
  },

  // ── Legacy sendCommand → executeCommand ──
  sendCommand: function(cmd) { App.executeCommand(cmd); },

  // ── Expired ──
  _isExpired: function() {
    if (!App.vendor) return false;
    if (App.vendor.estado === 'Inactivo') return true;
    if (App.vendor.fecha_vencimiento) {
      var exp = new Date(App.vendor.fecha_vencimiento + 'T00:00:00');
      return exp < new Date();
    }
    return false;
  },

  _renderExpired: function() {
    if (App.vendor && App.vendor.fecha_vencimiento) {
      var el = document.getElementById('expired-date');
      if (el) el.textContent = formatDate(App.vendor.fecha_vencimiento);
    }
  }
};


// ─── COMMAND HANDLERS ───
var CMD_HANDLERS = {
  nuevo_cliente: function() {
    App.showForm({
      title: '👤 Nuevo Cliente',
      subtitle: 'Registra un nuevo cliente o prospecto',
      fields: [
        { key: 'nombre', label: 'Nombre completo', type: 'text', required: true, icon: '👤' },
        { key: 'telefono', label: 'Teléfono / WhatsApp', type: 'tel', icon: '📱' },
        { key: 'direccion', label: 'Dirección', type: 'text', icon: '📍' },
        { key: 'tipo_cliente', label: 'Tipo', type: 'select', options: ['Cliente', 'Prospecto'], icon: '🏷️' }
      ],
      submitLabel: 'Registrar Cliente',
      apiEndpoint: '/api/clients',
      successMsg: '✅ Cliente registrado exitosamente'
    });
  },

  clientes: function() {
    App.showList({
      title: '👥 Tu Cartera',
      subtitle: 'Todos tus clientes y prospectos',
      apiEndpoint: '/api/clients',
      emptyIcon: '👥',
      emptyText: 'Aún no tienes clientes. ¡Registra el primero!',
      searchable: true,
      searchEndpoint: '/api/clients/search',
      addBtn: { label: '+ Nuevo Cliente', cmd: 'nuevo_cliente' },
      renderItem: function(item) {
        return {
          icon: item.tipo_cliente === 'Prospecto' ? '🔵' : '🟢',
          title: item.nombre,
          subtitle: (item.tipo_cliente || 'Cliente') + ' · ' + (item.telefono || 'Sin teléfono'),
          detail: item.direccion || ''
        };
      }
    });
  },

  buscar: function() {
    App.showList({
      title: '🔍 Buscar Clientes',
      subtitle: 'Escribe el nombre o teléfono',
      apiEndpoint: '/api/clients',
      emptyIcon: '🔍',
      emptyText: 'Busca clientes por nombre o teléfono',
      searchable: true,
      searchEndpoint: '/api/clients/search',
      startWithSearch: true,
      renderItem: function(item) {
        return { icon: '👤', title: item.nombre, subtitle: (item.tipo_cliente || 'Cliente') + ' · ' + (item.telefono || '') };
      }
    });
  },

  seguimiento: function() {
    App.showResult({
      title: '📊 Pipeline Comercial',
      apiEndpoint: '/api/pipeline',
      render: function(data) {
        var rows = [
          { icon: '👥', label: 'Total clientes', value: data.total_clients || 0 },
          { icon: '🟢', label: 'Activos', value: data.active || 0 },
          { icon: '🔵', label: 'Prospectos', value: data.prospects || 0 },
          { icon: '📦', label: 'Pedidos pendientes', value: data.pending_orders || 0 },
          { icon: '💰', label: 'Ventas del mes', value: formatCOP(data.month_sales || 0) }
        ];
        return rows.map(function(r) {
          return '<div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">' +
            '<span>' + r.icon + ' ' + r.label + '</span>' +
            '<span style="font-weight:700;color:var(--c-accent);">' + r.value + '</span></div>';
        }).join('');
      }
    });
  },

  vender: function() {
    Promise.all([API.get('/api/clients'), API.get('/api/products')])
      .then(function(results) {
        var clients = results[0].items || [];
        var products = results[1].products || [];
        if (clients.length === 0) { showToast('Primero registra un cliente', 'error'); CMD_HANDLERS.nuevo_cliente(); return; }
        if (products.length === 0) { showToast('Primero agrega productos', 'error'); CMD_HANDLERS.nuevo_producto(); return; }

        App.showForm({
          title: '🛒 Crear Pedido',
          subtitle: 'Registrar una venta',
          fields: [
            { key: 'cliente_id', label: 'Cliente', type: 'select', options: clients.map(function(c) { return { value: c.id, label: c.nombre }; }), required: true, icon: '👤' },
            { key: 'producto', label: 'Producto', type: 'select', options: products.map(function(p) { return { value: p.nombre, label: p.nombre + ' — ' + formatCOP(p.precio_venta) }; }), required: true, icon: '📦' },
            { key: 'cantidad', label: 'Cantidad', type: 'number', required: true, icon: '🔢' },
            { key: 'precio_venta', label: 'Precio de venta', type: 'number', icon: '💰' }
          ],
          submitLabel: 'Crear Pedido',
          apiEndpoint: '/api/orders',
          beforeSubmit: function(data) {
            if (!data.precio_venta) {
              var prod = products.find(function(p) { return p.nombre === data.producto; });
              if (prod) { data.precio_venta = prod.precio_venta; data.precio_compra = prod.precio_compra; }
            }
            data.cantidad = parseInt(data.cantidad) || 1;
            data.precio_venta = parseFloat(data.precio_venta) || 0;
            return data;
          },
          successMsg: '✅ Pedido creado'
        });
      })
      .catch(function() { showToast('Error al cargar datos', 'error'); });
  },

  pedidos: function() {
    App.showList({
      title: '📦 Pedidos',
      subtitle: 'Todos los pedidos registrados',
      apiEndpoint: '/api/orders',
      emptyIcon: '📦',
      emptyText: 'No hay pedidos registrados',
      addBtn: { label: '+ Nuevo Pedido', cmd: 'vender' },
      renderItem: function(item) {
        return {
          icon: item.estado === 'Pagado' ? '✅' : item.estado === 'Entregado' ? '📦' : '🕐',
          title: item.producto + ' × ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente') + ' · ' + item.estado,
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      }
    });
  },

  entregar: function() {
    App.showList({
      title: '✅ Marcar Entregado',
      subtitle: 'Toca el pedido para marcarlo entregado',
      apiEndpoint: '/api/orders?status=Pendiente',
      emptyIcon: '✅',
      emptyText: 'No hay pedidos pendientes de entrega',
      renderItem: function(item) {
        return {
          icon: '📦',
          title: item.producto + ' × ' + item.cantidad,
          subtitle: item.cliente_nombre || 'Cliente',
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      },
      onItemClick: function(item) {
        if (confirm('¿Marcar como entregado?\n' + item.producto + ' × ' + item.cantidad)) {
          API.post('/api/orders/deliver', { order_id: item.id })
            .then(function() { showToast('✅ Entregado', 'info'); CMD_HANDLERS.entregar(); })
            .catch(function() { showToast('Error', 'error'); });
        }
      }
    });
  },

  cobrar: function() {
    App.showList({
      title: '💳 Cobros Pendientes',
      subtitle: 'Pedidos sin pagar',
      apiEndpoint: '/api/orders/unpaid',
      emptyIcon: '💳',
      emptyText: '¡Excelente! No tienes cobros pendientes',
      renderItem: function(item) {
        return {
          icon: '💵',
          title: item.producto + ' × ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente') + ' · ' + item.estado,
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      }
    });
  },

  pagar: function() {
    App.showList({
      title: '💵 Marcar Pagado',
      subtitle: 'Toca el pedido para marcarlo pagado',
      apiEndpoint: '/api/orders/unpaid',
      emptyIcon: '💵',
      emptyText: 'No hay pedidos pendientes de pago',
      renderItem: function(item) {
        return {
          icon: '💰',
          title: item.producto + ' × ' + item.cantidad,
          subtitle: item.cliente_nombre || 'Cliente',
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      },
      onItemClick: function(item) {
        if (confirm('¿Marcar como pagado?\n' + item.producto + ' — ' + formatCOP(item.precio_venta * item.cantidad))) {
          API.post('/api/orders/pay', { order_id: item.id })
            .then(function() { showToast('✅ Pago registrado', 'info'); CMD_HANDLERS.pagar(); })
            .catch(function() { showToast('Error', 'error'); });
        }
      }
    });
  },

  precios: function() {
    App.showList({
      title: '💰 Lista de Precios',
      subtitle: 'Tu catálogo de productos',
      apiEndpoint: '/api/products',
      itemsKey: 'products',
      emptyIcon: '💰',
      emptyText: 'No tienes productos. ¡Agrega el primero!',
      addBtn: { label: '+ Nuevo Producto', cmd: 'nuevo_producto' },
      renderItem: function(item) {
        return {
          icon: '📦',
          title: item.nombre,
          subtitle: 'Compra: ' + formatCOP(item.precio_compra) + ' · Stock: ' + (item.stock || 0),
          detail: formatCOP(item.precio_venta)
        };
      }
    });
  },

  nuevo_producto: function() {
    App.showForm({
      title: '📦 Nuevo Producto',
      subtitle: 'Agrega un producto a tu catálogo',
      fields: [
        { key: 'name', label: 'Nombre del producto', type: 'text', required: true, icon: '📦' },
        { key: 'buy_price', label: 'Precio de compra', type: 'number', icon: '💵' },
        { key: 'sell_price', label: 'Precio de venta', type: 'number', icon: '💰' },
        { key: 'stock', label: 'Stock inicial', type: 'number', icon: '📊' }
      ],
      submitLabel: 'Guardar Producto',
      apiEndpoint: '/api/products',
      successMsg: '✅ Producto agregado'
    });
  },

  configurar: function() { CMD_HANDLERS.precios(); },

  caja: function() {
    App.showResult({
      title: '💼 Estado de Caja',
      apiEndpoint: '/api/finance/summary',
      render: function(data) {
        var rows = [
          { icon: '💰', label: 'Total ventas', value: formatCOP(data.total_sales || 0), color: '#00E676' },
          { icon: '💵', label: 'Cobrado', value: formatCOP(data.total_collected || 0), color: '#00D4FF' },
          { icon: '📝', label: 'Gastos', value: formatCOP(data.total_expenses || 0), color: '#FF6B9D' },
          { icon: '💼', label: 'Utilidad neta', value: formatCOP((data.total_collected || 0) - (data.total_expenses || 0)), color: '#FFB74D' },
          { icon: '💳', label: 'Por cobrar', value: formatCOP(data.total_receivable || 0), color: '#BB86FC' }
        ];
        return rows.map(function(r) {
          return '<div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">' +
            '<span>' + r.icon + ' ' + r.label + '</span>' +
            '<span style="font-weight:700;color:' + r.color + ';">' + r.value + '</span></div>';
        }).join('');
      }
    });
  },

  cuentas_por_cobrar: function() {
    App.showList({
      title: '💳 Cartera por Cobrar',
      subtitle: 'Clientes con saldo pendiente',
      apiEndpoint: '/api/finance/receivables',
      emptyIcon: '💳',
      emptyText: '¡Sin cuentas por cobrar!',
      renderItem: function(item) {
        return {
          icon: '👤',
          title: item.cliente_nombre || 'Cliente',
          subtitle: (item.pedidos_pendientes || 0) + ' pedidos sin pagar',
          detail: formatCOP(item.total_pendiente || 0)
        };
      }
    });
  },

  gasto: function() {
    App.showForm({
      title: '📝 Registrar Gasto',
      subtitle: 'Anota un gasto del negocio',
      fields: [
        { key: 'concepto', label: 'Concepto / Descripción', type: 'text', required: true, icon: '📝' },
        { key: 'monto', label: 'Monto ($)', type: 'number', required: true, icon: '💰' }
      ],
      submitLabel: 'Registrar Gasto',
      apiEndpoint: '/api/expenses',
      successMsg: '✅ Gasto registrado'
    });
  },

  margen: function() {
    App.showList({
      title: '📈 Margen de Rentabilidad',
      subtitle: 'Análisis por producto',
      apiEndpoint: '/api/finance/margin',
      emptyIcon: '📈',
      emptyText: 'Sin datos de margen. Registra ventas primero.',
      renderItem: function(item) {
        var pv = item.precio_venta || 0;
        var pc = item.precio_compra || 0;
        var margin = pv > 0 ? Math.round(((pv - pc) / pv) * 100) : 0;
        return {
          icon: margin > 30 ? '🟢' : margin > 15 ? '🟡' : '🔴',
          title: item.producto || item.nombre,
          subtitle: 'Compra: ' + formatCOP(pc) + ' → Venta: ' + formatCOP(pv),
          detail: margin + '%'
        };
      }
    });
  },

  // ── CRM Extras ──
  nota: function() {
    API.get('/api/clients').then(function(data) {
      var clients = data.items || [];
      if (clients.length === 0) { showToast('Primero registra un cliente', 'error'); return; }
      App.showForm({
        title: '📝 Agregar Nota',
        subtitle: 'Nota de seguimiento para un cliente',
        fields: [
          { key: 'cliente_id', label: 'Cliente', type: 'select', options: clients.map(function(c) { return { value: c.id, label: c.nombre }; }), required: true, icon: '👤' },
          { key: 'texto', label: 'Nota / Observación', type: 'text', required: true, icon: '📝' }
        ],
        submitLabel: 'Guardar Nota',
        apiEndpoint: '/api/notes',
        successMsg: '✅ Nota guardada'
      });
    }).catch(function() { showToast('Error al cargar clientes', 'error'); });
  },

  ficha: function() {
    App.showList({
      title: '📋 Ficha de Cliente',
      subtitle: 'Selecciona un cliente para ver su ficha',
      apiEndpoint: '/api/clients',
      emptyIcon: '📋',
      emptyText: 'No hay clientes registrados',
      searchable: true,
      searchEndpoint: '/api/clients/search',
      renderItem: function(item) {
        return {
          icon: '👤',
          title: item.nombre,
          subtitle: (item.tipo_cliente || 'Cliente') + ' · ' + (item.telefono || 'Sin teléfono'),
          detail: '→'
        };
      },
      onItemClick: function(item) {
        App.showResult({
          title: '📋 ' + item.nombre,
          apiEndpoint: '/api/clients/' + item.id,
          render: function(data) {
            var c = data.client || data;
            var rows = [
              { icon: '👤', label: 'Nombre', value: c.nombre || 'N/A' },
              { icon: '📱', label: 'Teléfono', value: c.telefono || 'N/A' },
              { icon: '📍', label: 'Dirección', value: c.direccion || 'N/A' },
              { icon: '🏷️', label: 'Tipo', value: c.tipo_cliente || 'Cliente' },
              { icon: '📅', label: 'Día de visita', value: c.dia_visita || 'Sin asignar' },
              { icon: '📦', label: 'Total pedidos', value: (data.orders_count || 0).toString() },
              { icon: '💰', label: 'Total compras', value: formatCOP(data.total_purchases || 0) }
            ];
            return rows.map(function(r) {
              return '<div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">' +
                '<span>' + r.icon + ' ' + r.label + '</span>' +
                '<span style="font-weight:600;color:var(--c-secondary);">' + r.value + '</span></div>';
            }).join('');
          }
        });
      }
    });
  },

  radar: function() {
    if (!navigator.geolocation) {
      showToast('Tu dispositivo no soporta GPS', 'error');
      return;
    }
    showToast('📡 Obteniendo tu ubicación...', 'info');
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        showToast('📍 Ubicación obtenida. Mostrando clientes...', 'info');
        App.showList({
          title: '📡 Radar de Clientes',
          subtitle: 'Clientes cerca de tu ubicación',
          apiEndpoint: '/api/clients',
          emptyIcon: '📡',
          emptyText: 'No hay clientes registrados',
          renderItem: function(item) {
            return {
              icon: '📍',
              title: item.nombre,
              subtitle: item.direccion || 'Sin dirección',
              detail: item.telefono || ''
            };
          },
          onItemClick: function(item) {
            if (item.direccion) {
              window.open('https://www.google.com/maps/search/' + encodeURIComponent(item.direccion), '_blank');
            } else {
              showToast('Este cliente no tiene dirección registrada', 'info');
            }
          }
        });
      },
      function() {
        showToast('No se pudo obtener tu ubicación. Verifica los permisos de GPS.', 'error');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  },

  asignar_dia: function() {
    API.get('/api/clients').then(function(data) {
      var clients = data.items || [];
      if (clients.length === 0) { showToast('Primero registra un cliente', 'error'); return; }
      App.showForm({
        title: '📅 Asignar Día de Visita',
        subtitle: 'Programa el día de visita de un cliente',
        fields: [
          { key: 'cliente_nombre', label: 'Cliente', type: 'select', options: clients.map(function(c) { return { value: c.nombre, label: c.nombre }; }), required: true, icon: '👤' },
          { key: 'dia', label: 'Día', type: 'select', options: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], required: true, icon: '📅' }
        ],
        submitLabel: 'Asignar Día',
        apiEndpoint: '/api/clients/assign-day',
        successMsg: '✅ Día de visita asignado'
      });
    }).catch(function() { showToast('Error al cargar clientes', 'error'); });
  },

  // ── Ventas Extras ──
  repetir: function() {
    API.get('/api/clients').then(function(data) {
      var clients = data.items || [];
      if (clients.length === 0) { showToast('No hay clientes', 'error'); return; }
      App.showList({
        title: '🔄 Repetir Último Pedido',
        subtitle: 'Selecciona el cliente para repetir su pedido',
        apiEndpoint: '/api/clients',
        emptyIcon: '🔄',
        emptyText: 'No hay clientes registrados',
        renderItem: function(item) {
          return { icon: '👤', title: item.nombre, subtitle: item.telefono || '', detail: '→' };
        },
        onItemClick: function(item) {
          API.post('/api/orders/repeat', { cliente_id: item.id })
            .then(function(res) {
              showToast('✅ Pedido repetido: ' + res.producto + ' ×' + res.cantidad, 'info');
              haptic('success');
            })
            .catch(function(err) {
              showToast('No hay pedidos anteriores para este cliente', 'error');
            });
        }
      });
    }).catch(function() { showToast('Error al cargar clientes', 'error'); });
  },

  // ── Documentos ──
  remision: function() {
    App.showList({
      title: '📄 Generar Remisión',
      subtitle: 'Selecciona pedidos para la remisión',
      apiEndpoint: '/api/orders',
      emptyIcon: '📄',
      emptyText: 'No hay pedidos registrados',
      renderItem: function(item) {
        return {
          icon: item.estado === 'Pagado' ? '✅' : '📦',
          title: item.producto + ' × ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente') + ' · ' + item.estado,
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      },
      onItemClick: function(item) {
        var text = '═══ REMISIÓN ═══\n\n' +
          'Cliente: ' + (item.cliente_nombre || 'N/A') + '\n' +
          'Producto: ' + item.producto + '\n' +
          'Cantidad: ' + item.cantidad + '\n' +
          'Precio: ' + formatCOP(item.precio_venta) + '\n' +
          'Total: ' + formatCOP(item.precio_venta * item.cantidad) + '\n' +
          'Estado: ' + item.estado + '\n' +
          'Fecha: ' + new Date().toLocaleDateString('es-CO') + '\n' +
          '═══════════════';
        var blob = new Blob([text], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'remision_' + (item.cliente_nombre || 'pedido').replace(/\s/g, '_') + '.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast('📄 Remisión descargada', 'info');
      }
    });
  },

  despacho: function() {
    App.showList({
      title: '🚛 Despacho de Mercancía',
      subtitle: 'Selecciona pedidos para el despacho',
      apiEndpoint: '/api/orders?status=Pendiente',
      emptyIcon: '🚛',
      emptyText: 'No hay pedidos pendientes de despacho',
      renderItem: function(item) {
        return {
          icon: '📦',
          title: item.producto + ' × ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente') + ' · ' + (item.direccion || ''),
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      },
      onItemClick: function(item) {
        var text = '═══ DESPACHO DE MERCANCÍA ═══\n\n' +
          'Cliente: ' + (item.cliente_nombre || 'N/A') + '\n' +
          'Dirección: ' + (item.direccion || 'N/A') + '\n' +
          'Producto: ' + item.producto + '\n' +
          'Cantidad: ' + item.cantidad + '\n' +
          'Precio: ' + formatCOP(item.precio_venta) + '\n' +
          'Total: ' + formatCOP(item.precio_venta * item.cantidad) + '\n' +
          'Fecha despacho: ' + new Date().toLocaleDateString('es-CO') + '\n' +
          '═══════════════════════';
        var blob = new Blob([text], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'despacho_' + (item.cliente_nombre || 'pedido').replace(/\s/g, '_') + '.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast('🚛 Despacho descargado', 'info');
      }
    });
  },

  cotizar: function() {
    App.showResult({
      title: '📋 Cotización',
      apiEndpoint: '/api/products',
      render: function(data) {
        var products = data.products || [];
        if (products.length === 0) return '<div style="text-align:center;padding:32px;color:var(--c-text-muted);">No hay productos en el catálogo</div>';

        var total = 0;
        var html = '<div style="margin-bottom:16px;font-size:0.85rem;color:var(--c-text-muted);text-align:center;">Fecha: ' + new Date().toLocaleDateString('es-CO') + '</div>';
        products.forEach(function(p) {
          total += (p.precio_venta || 0);
          html += '<div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">' +
            '<div><div style="font-weight:600;">' + p.nombre + '</div>' +
            '<div style="font-size:0.75rem;color:var(--c-text-muted);">Stock: ' + (p.stock || 0) + '</div></div>' +
            '<span style="font-weight:700;color:var(--c-accent);">' + formatCOP(p.precio_venta) + '</span></div>';
        });

        html += '<div style="margin-top:16px;text-align:center;">' +
          '<div onclick="CMD_HANDLERS._downloadCotizacion()" ' +
          'style="display:inline-block;padding:12px 24px;background:var(--c-primary);color:white;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;">⬇️ Descargar Cotización</div></div>';
        return html;
      }
    });
  },

  _downloadCotizacion: function() {
    API.get('/api/products').then(function(data) {
      var products = data.products || [];
      var text = '═══ COTIZACIÓN ═══\n\nFecha: ' + new Date().toLocaleDateString('es-CO') + '\n\n';
      products.forEach(function(p, i) {
        text += (i + 1) + '. ' + p.nombre + ' — ' + formatCOP(p.precio_venta) + '\n';
      });
      text += '\n═══════════════';
      var blob = new Blob([text], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'cotizacion_' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('📋 Cotización descargada', 'info');
    });
  },

  // ── Logística ──
  inventario: function() {
    App.showList({
      title: '📦 Control de Inventario',
      subtitle: 'Stock actual de productos',
      apiEndpoint: '/api/products',
      itemsKey: 'products',
      emptyIcon: '📦',
      emptyText: 'No hay productos registrados',
      addBtn: { label: '+ Nuevo Producto', cmd: 'nuevo_producto' },
      renderItem: function(item) {
        var stock = item.stock || 0;
        return {
          icon: stock > 10 ? '🟢' : stock > 0 ? '🟡' : '🔴',
          title: item.nombre,
          subtitle: 'Costo: ' + formatCOP(item.precio_compra) + ' · Venta: ' + formatCOP(item.precio_venta),
          detail: stock + ' uds'
        };
      }
    });
  },

  ruta_pie: function() {
    if (!navigator.geolocation) { showToast('Tu dispositivo no soporta GPS', 'error'); return; }
    showToast('📍 Obteniendo ubicación...', 'info');
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        API.get('/api/clients').then(function(data) {
          var clients = (data.items || []).filter(function(c) { return c.direccion; });
          if (clients.length === 0) { showToast('No hay clientes con dirección', 'error'); return; }
          var destinations = clients.slice(0, 10).map(function(c) { return encodeURIComponent(c.direccion); }).join('|');
          var url = 'https://www.google.com/maps/dir/' + pos.coords.latitude + ',' + pos.coords.longitude + '/' + clients.slice(0, 10).map(function(c) { return encodeURIComponent(c.direccion); }).join('/') + '/?dirflg=w';
          window.open(url, '_blank');
          showToast('🚶 Ruta a pie abierta en Google Maps', 'info');
        });
      },
      function() { showToast('No se pudo obtener tu ubicación', 'error'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  },

  ruta_camion: function() {
    if (!navigator.geolocation) { showToast('Tu dispositivo no soporta GPS', 'error'); return; }
    showToast('📍 Obteniendo ubicación...', 'info');
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        API.get('/api/clients').then(function(data) {
          var clients = (data.items || []).filter(function(c) { return c.direccion; });
          if (clients.length === 0) { showToast('No hay clientes con dirección', 'error'); return; }
          var url = 'https://www.google.com/maps/dir/' + pos.coords.latitude + ',' + pos.coords.longitude + '/' + clients.slice(0, 10).map(function(c) { return encodeURIComponent(c.direccion); }).join('/');
          window.open(url, '_blank');
          showToast('🚛 Ruta en vehículo abierta en Google Maps', 'info');
        });
      },
      function() { showToast('No se pudo obtener tu ubicación', 'error'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  },

  ruta_semanal: function() {
    App.showList({
      title: '📅 Ruta Semanal',
      subtitle: 'Clientes organizados por día de visita',
      apiEndpoint: '/api/clients',
      emptyIcon: '📅',
      emptyText: 'Asigna días de visita a tus clientes primero',
      renderItem: function(item) {
        return {
          icon: item.dia_visita ? '📅' : '⬜',
          title: item.nombre,
          subtitle: item.dia_visita || 'Sin día asignado',
          detail: item.direccion ? '📍' : ''
        };
      },
      onItemClick: function(item) {
        if (item.direccion) {
          window.open('https://www.google.com/maps/search/' + encodeURIComponent(item.direccion), '_blank');
        } else {
          showToast('Cliente sin dirección registrada', 'info');
        }
      }
    });
  },

  // ── Finanzas Extras ──
  meta: function() {
    App.showResult({
      title: '🎯 Meta Mensual',
      apiEndpoint: '/api/finance/summary',
      render: function(data) {
        var meta = data.meta_mensual || 0;
        var sales = data.total_sales || 0;
        var pct = meta > 0 ? Math.round((sales / meta) * 100) : 0;
        var remaining = Math.max(0, meta - sales);

        return '<div class="glass-card" style="text-align:center;padding:24px;margin-bottom:12px;">' +
          '<div style="font-size:2.5rem;margin-bottom:8px;">🎯</div>' +
          '<div style="font-size:1.3rem;font-weight:700;color:var(--c-accent);margin-bottom:4px;">' + pct + '% cumplido</div>' +
          '<div style="color:var(--c-text-muted);font-size:0.85rem;">Meta: ' + formatCOP(meta) + '</div>' +
          '</div>' +
          '<div class="glass-card" style="display:flex;justify-content:space-between;padding:14px 18px;margin-bottom:8px;">' +
          '<span>💰 Vendido</span><span style="font-weight:700;color:#00E676;">' + formatCOP(sales) + '</span></div>' +
          '<div class="glass-card" style="display:flex;justify-content:space-between;padding:14px 18px;margin-bottom:8px;">' +
          '<span>📊 Faltante</span><span style="font-weight:700;color:#FF6B9D;">' + formatCOP(remaining) + '</span></div>' +
          (meta === 0 ? '<div style="margin-top:12px;text-align:center;color:var(--c-text-muted);font-size:0.8rem;">Configura tu meta con ⚙️ Configurar Meta</div>' : '');
      }
    });
  },

  meta_set: function() {
    App.showForm({
      title: '⚙️ Configurar Meta',
      subtitle: 'Define tu objetivo mensual de ventas',
      fields: [
        { key: 'meta', label: 'Meta mensual ($)', type: 'number', required: true, icon: '🎯' }
      ],
      submitLabel: 'Guardar Meta',
      apiEndpoint: '/api/finance/meta',
      successMsg: '✅ Meta mensual configurada'
    });
  },

  // ── Admin ──
  editar: function() {
    App.showList({
      title: '✏️ Editar Registro',
      subtitle: '¿Qué tipo de registro deseas editar?',
      apiEndpoint: '/api/clients',
      emptyIcon: '✏️',
      emptyText: 'No hay registros para editar',
      renderItem: function(item) {
        return {
          icon: '👤',
          title: item.nombre,
          subtitle: (item.tipo_cliente || 'Cliente') + ' · ' + (item.telefono || ''),
          detail: '✏️'
        };
      },
      onItemClick: function(item) {
        App.showForm({
          title: '✏️ Editar: ' + item.nombre,
          subtitle: 'Modifica los datos del cliente',
          fields: [
            { key: 'nombre', label: 'Nombre', type: 'text', icon: '👤' },
            { key: 'telefono', label: 'Teléfono', type: 'tel', icon: '📱' },
            { key: 'direccion', label: 'Dirección', type: 'text', icon: '📍' },
            { key: 'tipo_cliente', label: 'Tipo', type: 'select', options: ['Cliente', 'Prospecto'], icon: '🏷️' }
          ],
          submitLabel: 'Guardar Cambios',
          apiEndpoint: '/api/clients',
          prefill: item,
          successMsg: '✅ Cliente actualizado'
        });
      }
    });
  },

  eliminar: function() {
    App.showList({
      title: '🗑️ Eliminar Registro',
      subtitle: 'Selecciona el cliente a eliminar',
      apiEndpoint: '/api/clients',
      emptyIcon: '🗑️',
      emptyText: 'No hay registros para eliminar',
      renderItem: function(item) {
        return {
          icon: '⚠️',
          title: item.nombre,
          subtitle: (item.tipo_cliente || 'Cliente') + ' · ' + (item.telefono || ''),
          detail: '🗑️'
        };
      },
      onItemClick: function(item) {
        if (confirm('⚠️ ¿Eliminar permanentemente a ' + item.nombre + '?\n\nEsta acción no se puede deshacer.')) {
          API.post('/api/delete/client', { id: item.id })
            .then(function() {
              showToast('🗑️ Cliente eliminado', 'info');
              haptic('medium');
              CMD_HANDLERS.eliminar();
            })
            .catch(function() { showToast('Error al eliminar', 'error'); });
        }
      }
    });
  },

  backup: function() {
    showToast('💾 Generando respaldo...', 'info');
    API.get('/api/backup').then(function(data) {
      var text = JSON.stringify(data.backup, null, 2);
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'controlia_backup_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('💾 Respaldo descargado exitosamente', 'info');
      haptic('success');
    }).catch(function() { showToast('Error al generar respaldo', 'error'); });
  }
};


// ─── BOOT ───
document.addEventListener('DOMContentLoaded', function() {
  App.init();
});
