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
      { icon: '🔄', label: 'Repetir Último Pedido', cmd: 'repetir' },
      { icon: '📲', label: 'Cobrar por WhatsApp', cmd: 'cobrar_whatsapp' }
    ]
  },
  documentos: {
    icon: '📄', title: 'DOCUMENTOS',
    desc: 'Remisiones, despachos y cotizaciones',
    commands: [
      { icon: '📄', label: 'Generar Remisión', cmd: 'remision' },
      { icon: '🚛', label: 'Despacho de Mercancía', cmd: 'despacho' },
      { icon: '💰', label: 'Ver Lista de Precios', cmd: 'precios' },
      { icon: '📋', label: 'Cotización PDF', cmd: 'cotizar' },
      { icon: '📲', label: 'Cotizar por WhatsApp', cmd: 'cotizar_whatsapp' }
    ]
  },
  logistica: {
    icon: '🚛', title: 'LOGÍSTICA',
    desc: 'Inventario y rutas de entrega',
    commands: [
      { icon: '📦', label: 'Control de Inventario', cmd: 'inventario' },
      { icon: '🚶', label: 'Ruta a Pie', cmd: 'ruta_pie' },
      { icon: '🚛', label: 'Ruta en Camión', cmd: 'ruta_camion' },
      { icon: '📅', label: 'Ruta Semanal', cmd: 'ruta_semanal' },
      { icon: '📋', label: 'Ruta desde Excel', cmd: 'ruta_excel' },
      { icon: '📥', label: 'Importar Clientes (Excel)', cmd: 'importar_clientes' }
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
        if (!resp.ok) {
          return resp.json().catch(function() { return {}; }).then(function(errData) {
            if (errData.expired) {
              App._renderExpired();
              App.showScreen('expired');
            }
            throw new Error(errData.message || 'HTTP ' + resp.status);
          });
        }
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
      if (!resp.ok) {
        return resp.json().catch(function() { return {}; }).then(function(errData) {
          if (errData.expired) {
            App._renderExpired();
            App.showScreen('expired');
          }
          throw new Error(errData.message || 'HTTP ' + resp.status);
        });
      }
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

  handleOnboardingLogo: function(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (file.size > 200 * 1024) { showToast('Logo máximo 200KB', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      App.registrationData.logo_base64 = e.target.result;
      var preview = document.getElementById('onboarding-logo-preview');
      if (preview) preview.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;">';
      showToast('✅ Logo cargado', 'success');
    };
    reader.readAsDataURL(file);
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
        // Upload logo if provided during onboarding
        if (App.registrationData.logo_base64) {
          API.post('/api/vendor/logo', { logo_base64: App.registrationData.logo_base64 }).catch(function() {});
        }
        haptic('success');
        spawnConfetti();
        App.showScreen('success');
      })
      .catch(function(err) {
        haptic('error');
        console.error('Registration error:', err);
        showToast('Error al crear la cuenta: ' + (err.message || 'Intenta de nuevo.'), 'error');
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

    // Logo preview
    var logoPreview = document.getElementById('logo-preview');
    if (logoPreview) {
      if (v.logo_base64) {
        logoPreview.innerHTML = '<img src="' + v.logo_base64 + '" style="max-width:120px;max-height:120px;border-radius:12px;border:2px solid var(--c-border);">';
      } else {
        logoPreview.innerHTML = '<div style="font-size:0.85rem;color:var(--c-text-muted);padding:16px;">Sin logo</div>';
      }
    }

    // Logo upload handler
    var logoInput = document.getElementById('logo-file-input');
    if (logoInput && !logoInput._bound) {
      logoInput._bound = true;
      logoInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (file.size > 200 * 1024) {
          showToast('Imagen demasiado grande (máx 200KB)', 'error');
          return;
        }
        var reader = new FileReader();
        reader.onload = function(ev) {
          var base64 = ev.target.result;
          // Preview immediately
          if (logoPreview) {
            logoPreview.innerHTML = '<img src="' + base64 + '" style="max-width:120px;max-height:120px;border-radius:12px;border:2px solid var(--c-accent);">';
          }
          // Upload
          API.post('/api/vendor/logo', { logo_base64: base64 })
            .then(function() {
              showToast('✅ Logo actualizado', 'info');
              App.vendor.logo_base64 = base64;
            })
            .catch(function() {
              showToast('Error al subir logo', 'error');
            });
        };
        reader.readAsDataURL(file);
      });
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
        if (field.defaultValue !== undefined) select.value = field.defaultValue;
        group.appendChild(select);
      } else if (field.type === 'textarea') {
        var ta = document.createElement('textarea');
        ta.id = 'form-field-' + field.key;
        ta.placeholder = (field.icon || '') + ' ' + field.label;
        ta.rows = 3;
        ta.style.cssText = 'width:100%;padding:14px 16px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:12px;color:var(--c-text);font-size:0.95rem;font-family:inherit;outline:none;resize:vertical;';
        if (field.defaultValue) ta.value = field.defaultValue;
        group.appendChild(ta);
      } else {
        var inputType = field.type || 'text';
        var placeholderText = (field.icon || '') + ' ' + field.label;
        var defVal = (field.defaultValue !== undefined && field.defaultValue !== null) ? field.defaultValue : '';
        group.innerHTML = '<input type="' + inputType + '" id="form-field-' + field.key + '" ' +
          'placeholder="' + placeholderText + '" autocomplete="off" ' +
          'value="' + defVal + '" ' +
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


// ─── ROUTE PROSPECT WIZARD ───
// 4-step in-app flow: GPS → Type → Exclusions → Radius → Results

var RW_TYPES = [
  { key: 'tienda',     emoji: '🏪', label: 'Tiendas / Minimercados' },
  { key: 'restaurante', emoji: '🍽️', label: 'Restaurantes' },
  { key: 'farmacia',   emoji: '🏥', label: 'Farmacias / Droguerías' },
  { key: 'panaderia',  emoji: '🥖', label: 'Panaderías' },
  { key: 'ferreteria', emoji: '🔧', label: 'Ferreterías' },
  { key: 'empresa',    emoji: '🏢', label: 'Empresas / Oficinas' }
];

var RW_RADII = [
  { value: 500,  label: '500m — Zona inmediata' },
  { value: 1000, label: '1 km — Ideal a pie' },
  { value: 2000, label: '2 km — Área amplia' },
  { value: 3000, label: '3 km — Máximo alcance' }
];

function _rwRender(title, html) {
  var t = document.getElementById('data-result-title');
  var c = document.getElementById('data-result-content');
  if (t) t.textContent = title;
  if (c) c.innerHTML = html;
}

// Step 1: Get GPS Location
App._rwStep1 = function() {
  var html =
    '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
      '<h4 style="font-weight:700;margin-bottom:12px;">📍 ¿Desde dónde sales?</h4>' +
      '<button class="btn btn--primary w-full" onclick="App._rwGPS()" id="rw-gps-btn" style="margin-bottom:16px;">' +
        '<span id="rw-gps-text">📡 Usar mi ubicación actual</span>' +
        '<div id="rw-gps-spinner" class="btn__spinner hidden"></div>' +
      '</button>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
        '<div style="flex:1;height:1px;background:var(--c-border);"></div>' +
        '<span style="color:var(--c-text-muted);font-size:0.8rem;">o escribe una dirección</span>' +
        '<div style="flex:1;height:1px;background:var(--c-border);"></div>' +
      '</div>' +
      '<input type="text" id="rw-address" placeholder="Ej: Calle 80 con Carrera 30, Bogotá" ' +
        'style="width:100%;padding:12px 14px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;color:var(--c-text);font-size:0.9rem;outline:none;box-sizing:border-box;margin-bottom:10px;">' +
      '<button class="btn btn--secondary w-full" onclick="App._rwGeocode()" id="rw-geo-btn">' +
        '<span id="rw-geo-text">🔍 Buscar dirección</span>' +
        '<div id="rw-geo-spinner" class="btn__spinner hidden"></div>' +
      '</button>' +
    '</div>';

  _rwRender('📍 Punto de Inicio', html);
  pushNav('data-result');

  // Enter key on address input
  setTimeout(function() {
    var inp = document.getElementById('rw-address');
    if (inp) inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); App._rwGeocode(); }
    });
  }, 100);
};

// GPS auto-detect
App._rwGPS = function() {
  var btn = document.getElementById('rw-gps-btn');
  var text = document.getElementById('rw-gps-text');
  var spin = document.getElementById('rw-gps-spinner');
  if (btn) btn.disabled = true;
  if (text) text.classList.add('hidden');
  if (spin) spin.classList.remove('hidden');

  if (!navigator.geolocation) {
    showToast('Tu dispositivo no soporta GPS', 'error');
    if (btn) btn.disabled = false;
    if (text) text.classList.remove('hidden');
    if (spin) spin.classList.add('hidden');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      App._rw.lat = pos.coords.latitude;
      App._rw.lng = pos.coords.longitude;
      App._rw.originLabel = 'GPS: ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
      haptic('success');
      App._rwStep2();
    },
    function() {
      showToast('No se pudo obtener tu ubicación. Verifica permisos de GPS.', 'error');
      haptic('error');
      if (btn) btn.disabled = false;
      if (text) text.classList.remove('hidden');
      if (spin) spin.classList.add('hidden');
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
};

// Geocode typed address
App._rwGeocode = function() {
  var inp = document.getElementById('rw-address');
  var addr = inp ? inp.value.trim() : '';
  if (!addr) { showToast('Escribe una dirección', 'error'); return; }

  var btn = document.getElementById('rw-geo-btn');
  var text = document.getElementById('rw-geo-text');
  var spin = document.getElementById('rw-geo-spinner');
  if (btn) btn.disabled = true;
  if (text) text.classList.add('hidden');
  if (spin) spin.classList.remove('hidden');

  API.post('/api/geocode', { address: addr })
    .then(function(data) {
      if (!data.found) {
        showToast('No se encontró esa dirección. Intenta ser más específico.', 'error');
        haptic('error');
        if (btn) btn.disabled = false;
        if (text) text.classList.remove('hidden');
        if (spin) spin.classList.add('hidden');
        return;
      }
      App._rw.lat = data.lat;
      App._rw.lng = data.lng;
      App._rw.originLabel = addr;
      haptic('success');
      App._rwStep2();
    })
    .catch(function(err) {
      showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
      if (btn) btn.disabled = false;
      if (text) text.classList.remove('hidden');
      if (spin) spin.classList.add('hidden');
    });
};

// Step 2: Business Type Selection
App._rwStep2 = function() {
  var html =
    '<div class="glass-card" style="padding:16px;margin-bottom:12px;">' +
      '<p style="font-weight:600;font-size:0.85rem;">📍 Punto de inicio</p>' +
      '<p style="color:var(--c-text-muted);font-size:0.8rem;">' + (App._rw.originLabel || (App._rw.lat.toFixed(4) + ', ' + App._rw.lng.toFixed(4))) + '</p>' +
    '</div>' +
    '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
      '<h4 style="font-weight:700;margin-bottom:12px;">🎯 ¿Qué tipo de negocio buscas?</h4>' +
      '<p style="color:var(--c-text-muted);font-size:0.8rem;margin-bottom:12px;">Selecciona uno o varios, o escribe tu propio tipo.</p>';

  RW_TYPES.forEach(function(t) {
    var checked = App._rw.types.indexOf(t.key) >= 0;
    html +=
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;background:var(--c-bg-input);border:1px solid ' + (checked ? 'var(--c-accent)' : 'var(--c-border)') + ';border-radius:10px;cursor:pointer;transition:border 0.2s;" ' +
        'onclick="var cb=this.querySelector(\'input\');cb.checked=!cb.checked;this.style.borderColor=cb.checked?\'var(--c-accent)\':\'var(--c-border)\';">' +
        '<input type="checkbox" value="' + t.key + '" class="rw-type-cb" ' + (checked ? 'checked' : '') + ' style="accent-color:var(--c-accent);width:18px;height:18px;pointer-events:none;">' +
        '<span style="font-size:1.2rem;">' + t.emoji + '</span>' +
        '<span style="flex:1;font-size:0.9rem;">' + t.label + '</span>' +
      '</label>';
  });

  html +=
      '<div style="margin-top:12px;">' +
        '<p style="font-size:0.8rem;color:var(--c-text-muted);margin-bottom:6px;">O escribe tu propio tipo:</p>' +
        '<input type="text" id="rw-custom-type" placeholder="Ej: distribuidora, papelería, licorería..." ' +
          'value="' + (App._rw.customType || '') + '" ' +
          'style="width:100%;padding:12px 14px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;color:var(--c-text);font-size:0.9rem;outline:none;box-sizing:border-box;">' +
      '</div>' +
    '</div>' +
    '<button class="btn btn--primary w-full" onclick="App._rwStep2Next()">Siguiente →</button>';

  _rwRender('🎯 Tipo de Negocio', html);
};

App._rwStep2Next = function() {
  var checks = document.querySelectorAll('.rw-type-cb:checked');
  App._rw.types = [];
  checks.forEach(function(cb) { App._rw.types.push(cb.value); });
  var custom = document.getElementById('rw-custom-type');
  App._rw.customType = custom ? custom.value.trim() : '';
  if (App._rw.types.length === 0 && !App._rw.customType) {
    showToast('Selecciona al menos un tipo o escribe uno', 'error');
    haptic('error');
    return;
  }
  haptic('light');
  App._rwStep3();
};

// Step 3: Exclusion Filter
App._rwStep3 = function() {
  var html =
    '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
      '<h4 style="font-weight:700;margin-bottom:8px;">🚫 Exclusiones (opcional)</h4>' +
      '<p style="color:var(--c-text-muted);font-size:0.8rem;margin-bottom:12px;">' +
        'Agrega nombres de negocios que quieras <b>excluir</b> de los resultados. ' +
        'Por ejemplo: cadenas grandes o marcas que no te interesan.' +
      '</p>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
        '<input type="text" id="rw-excl-input" placeholder="Ej: McDonald\'s, KFC, Oxxo..." ' +
          'style="flex:1;padding:12px 14px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;color:var(--c-text);font-size:0.9rem;outline:none;">' +
        '<button class="btn btn--accent" style="padding:10px 16px;white-space:nowrap;" onclick="App._rwAddExcl()">+ Agregar</button>' +
      '</div>' +
      '<div id="rw-excl-chips" style="display:flex;flex-wrap:wrap;gap:6px;"></div>' +
    '</div>' +
    '<button class="btn btn--primary w-full" onclick="App._rwStep4()">Siguiente →</button>' +
    '<button class="btn btn--ghost w-full" style="margin-top:6px;" onclick="App._rw.exclusions=[];App._rwStep4()">Omitir</button>';

  _rwRender('🚫 Exclusiones', html);
  App._rwRenderChips();

  setTimeout(function() {
    var inp = document.getElementById('rw-excl-input');
    if (inp) inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); App._rwAddExcl(); }
    });
  }, 100);
};

App._rwAddExcl = function() {
  var inp = document.getElementById('rw-excl-input');
  var val = inp ? inp.value.trim() : '';
  if (!val) return;
  val.split(',').forEach(function(v) {
    v = v.trim();
    if (v && App._rw.exclusions.indexOf(v) === -1) App._rw.exclusions.push(v);
  });
  if (inp) inp.value = '';
  App._rwRenderChips();
  haptic('light');
};

App._rwRemoveExcl = function(idx) {
  App._rw.exclusions.splice(idx, 1);
  App._rwRenderChips();
};

App._rwRenderChips = function() {
  var c = document.getElementById('rw-excl-chips');
  if (!c) return;
  c.innerHTML = '';
  App._rw.exclusions.forEach(function(excl, idx) {
    c.innerHTML +=
      '<span style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:rgba(255,107,157,0.15);border:1px solid rgba(255,107,157,0.3);border-radius:20px;font-size:0.8rem;color:#FF6B9D;">' +
        '🚫 ' + excl +
        '<span onclick="App._rwRemoveExcl(' + idx + ')" style="cursor:pointer;margin-left:4px;font-weight:700;">✕</span>' +
      '</span>';
  });
};

// Step 4: Radius Selection
App._rwStep4 = function() {
  var typeSummary = '';
  if (App._rw.types.length > 0) {
    typeSummary = App._rw.types.map(function(k) {
      var found = RW_TYPES.find(function(t) { return t.key === k; });
      return found ? found.emoji + ' ' + found.label : k;
    }).join(', ');
  }
  if (App._rw.customType) {
    typeSummary += (typeSummary ? ' + ' : '') + '🔍 "' + App._rw.customType + '"';
  }

  var html =
    '<div class="glass-card" style="padding:16px;margin-bottom:12px;">' +
      '<p style="font-size:0.8rem;color:var(--c-text-muted);"><b>Tipo:</b> ' + typeSummary + '</p>' +
      (App._rw.exclusions.length > 0 ? '<p style="font-size:0.8rem;color:#FF6B9D;margin-top:4px;"><b>Excluir:</b> ' + App._rw.exclusions.join(', ') + '</p>' : '') +
    '</div>' +
    '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
      '<h4 style="font-weight:700;margin-bottom:12px;">📍 Radio de búsqueda</h4>';

  RW_RADII.forEach(function(r, i) {
    html +=
      '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;cursor:pointer;">' +
        '<input type="radio" name="rw-radius" value="' + r.value + '" ' + (i === 1 ? 'checked' : '') + ' style="accent-color:var(--c-accent);width:18px;height:18px;">' +
        '<span style="flex:1;font-size:0.9rem;">' + r.label + '</span>' +
      '</label>';
  });

  html +=
    '</div>' +
    '<button class="btn btn--primary w-full" onclick="App._rwExecute()" id="rw-search-btn">' +
      '<span id="rw-search-text">🔍 Buscar Negocios</span>' +
      '<div id="rw-search-spinner" class="btn__spinner hidden"></div>' +
    '</button>';

  _rwRender('📍 Radio', html);
};

// Execute: Call API
App._rwExecute = function() {
  var radios = document.querySelectorAll('input[name="rw-radius"]');
  var radius = 1000;
  radios.forEach(function(r) { if (r.checked) radius = parseInt(r.value); });

  var btn = document.getElementById('rw-search-btn');
  var btnText = document.getElementById('rw-search-text');
  var spinner = document.getElementById('rw-search-spinner');
  if (btn) btn.disabled = true;
  if (btnText) btnText.classList.add('hidden');
  if (spinner) spinner.classList.remove('hidden');

  API.post('/api/routes/prospect', {
    lat: App._rw.lat,
    lng: App._rw.lng,
    radius: radius,
    business_types: App._rw.types.length > 0 ? App._rw.types : null,
    custom_type: App._rw.customType || null,
    exclusions: App._rw.exclusions
  })
  .then(function(data) {
    haptic('success');
    App._rwResults(data, radius);
  })
  .catch(function(err) {
    haptic('error');
    showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
    if (btn) btn.disabled = false;
    if (btnText) btnText.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
  });
};

// Show Results
App._rwResults = function(data, radius) {
  if (!data.stops || data.stops.length === 0) {
    _rwRender('🗺️ Resultados',
      '<div class="glass-card" style="text-align:center;padding:24px;">' +
        '<div style="font-size:3rem;margin-bottom:12px;">📭</div>' +
        '<h3 style="font-weight:700;margin-bottom:8px;">Sin resultados</h3>' +
        '<p style="color:var(--c-text-muted);font-size:0.85rem;">No se encontraron negocios con esos criterios en ' + radius + 'm.</p>' +
        '<button class="btn btn--primary w-full" style="margin-top:16px;" onclick="App._rwStep4()">← Cambiar radio</button>' +
        '<button class="btn btn--ghost w-full" style="margin-top:6px;" onclick="App._rwStep2()">← Cambiar tipo</button>' +
      '</div>'
    );
    return;
  }

  var html =
    '<div class="glass-card" style="padding:16px;margin-bottom:12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<span style="font-size:1.5rem;font-weight:700;color:var(--c-accent);">' + (data.in_route || data.stops.length) + '</span>' +
          '<span style="color:var(--c-text-muted);font-size:0.85rem;"> negocios en ruta</span>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<span style="font-size:0.85rem;color:var(--c-text-muted);">⏱️ ~' + (data.total_time_min || 0) + ' min</span>' +
        '</div>' +
      '</div>' +
      (data.found > data.stops.length ? '<p style="font-size:0.75rem;color:var(--c-text-muted);margin-top:6px;">' + data.found + ' encontrados en total</p>' : '') +
    '</div>';

  if (data.google_maps_url) {
    html +=
      '<a href="' + data.google_maps_url + '" target="_blank" class="btn btn--accent w-full" ' +
        'style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;text-decoration:none;">' +
        '🗺️ Abrir Ruta en Google Maps' +
      '</a>';
  }

  html += '<div class="glass-card" style="padding:16px;">';
  data.stops.forEach(function(stop, i) {
    var dist = stop.distance_from_origin || 0;
    var distLabel = dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(1) + 'km';
    html +=
      '<div style="display:flex;gap:12px;padding:10px 0;' + (i < data.stops.length - 1 ? 'border-bottom:1px solid var(--c-border);' : '') + '">' +
        '<div style="width:28px;height:28px;border-radius:50%;background:var(--c-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;">' + (i + 1) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:0.9rem;">' + (stop.emoji || '🏪') + ' ' + stop.name + '</div>' +
          (stop.address ? '<div style="font-size:0.75rem;color:var(--c-text-muted);margin-top:2px;">' + stop.address + '</div>' : '') +
          '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">' +
            '<span style="font-size:0.7rem;color:var(--c-accent);">📍 ' + distLabel + '</span>' +
            (stop.phone ? '<span style="font-size:0.7rem;color:var(--c-text-muted);">📱 ' + stop.phone + '</span>' : '') +
            (stop.opening_hours ? '<span style="font-size:0.7rem;color:var(--c-text-muted);">🕐 ' + stop.opening_hours + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  });
  html += '</div>';

  html += '<button class="btn btn--secondary w-full" style="margin-top:12px;" onclick="App._rwStep2()">🔄 Nueva búsqueda</button>';

  _rwRender('🗺️ ' + data.stops.length + ' Negocios Encontrados', html);
};

// ─── ROUTE MODE SELECTOR ───

// Launch prospect wizard
App._rwProspect = function() {
  App._rw = { types: [], exclusions: [], customType: '' };
  App._rwStep1();
};

// Launch "from my clients" flow — Step 1: Starting point
App._rwFromClients = function() {
  App._clientRoute = {};
  var html =
    '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
      '<h4 style="font-weight:700;margin-bottom:12px;">📍 ¿Desde dónde sales hoy?</h4>' +
      '<button class="btn btn--primary w-full" onclick="App._crGPS()" id="cr-gps-btn" style="margin-bottom:16px;">' +
        '<span id="cr-gps-text">📡 Usar mi ubicación actual</span>' +
        '<div id="cr-gps-spinner" class="btn__spinner hidden"></div>' +
      '</button>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
        '<div style="flex:1;height:1px;background:var(--c-border);"></div>' +
        '<span style="color:var(--c-text-muted);font-size:0.8rem;">o escribe una dirección / zona</span>' +
        '<div style="flex:1;height:1px;background:var(--c-border);"></div>' +
      '</div>' +
      '<input type="text" id="cr-address" placeholder="Ej: Zona Norte, Calle 80, Bogotá" ' +
        'style="width:100%;padding:12px 14px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;color:var(--c-text);font-size:0.9rem;outline:none;box-sizing:border-box;margin-bottom:10px;">' +
      '<button class="btn btn--secondary w-full" onclick="App._crGeocode()" id="cr-geo-btn">' +
        '<span id="cr-geo-text">🔍 Buscar</span>' +
        '<div id="cr-geo-spinner" class="btn__spinner hidden"></div>' +
      '</button>' +
    '</div>';

  _rwRender('👥 Ruta con Clientes', html);
  pushNav('data-result');

  setTimeout(function() {
    var inp = document.getElementById('cr-address');
    if (inp) inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); App._crGeocode(); }
    });
  }, 100);
};

App._crGPS = function() {
  var btn = document.getElementById('cr-gps-btn');
  var text = document.getElementById('cr-gps-text');
  var spin = document.getElementById('cr-gps-spinner');
  if (btn) btn.disabled = true;
  if (text) text.classList.add('hidden');
  if (spin) spin.classList.remove('hidden');

  if (!navigator.geolocation) {
    showToast('Tu dispositivo no soporta GPS', 'error');
    if (btn) btn.disabled = false; if (text) text.classList.remove('hidden'); if (spin) spin.classList.add('hidden');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      App._clientRoute.lat = pos.coords.latitude;
      App._clientRoute.lng = pos.coords.longitude;
      App._clientRoute.label = 'GPS: ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
      haptic('success');
      App._crPickRadius();
    },
    function() {
      showToast('No se pudo obtener ubicación', 'error');
      if (btn) btn.disabled = false; if (text) text.classList.remove('hidden'); if (spin) spin.classList.add('hidden');
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
};

App._crGeocode = function() {
  var inp = document.getElementById('cr-address');
  var addr = inp ? inp.value.trim() : '';
  if (!addr) { showToast('Escribe una dirección o zona', 'error'); return; }

  var btn = document.getElementById('cr-geo-btn');
  var text = document.getElementById('cr-geo-text');
  var spin = document.getElementById('cr-geo-spinner');
  if (btn) btn.disabled = true;
  if (text) text.classList.add('hidden');
  if (spin) spin.classList.remove('hidden');

  API.post('/api/geocode', { address: addr })
    .then(function(data) {
      if (!data.found) {
        showToast('No se encontró. Intenta ser más específico.', 'error');
        if (btn) btn.disabled = false; if (text) text.classList.remove('hidden'); if (spin) spin.classList.add('hidden');
        return;
      }
      App._clientRoute.lat = data.lat;
      App._clientRoute.lng = data.lng;
      App._clientRoute.label = addr;
      haptic('success');
      App._crPickRadius();
    })
    .catch(function() {
      showToast('Error buscando dirección', 'error');
      if (btn) btn.disabled = false; if (text) text.classList.remove('hidden'); if (spin) spin.classList.add('hidden');
    });
};

// Step 2: Pick radius
App._crPickRadius = function() {
  var html =
    '<div class="glass-card" style="padding:12px;margin-bottom:10px;">' +
      '<p style="font-weight:600;font-size:0.85rem;">📍 Salida: <span style="color:var(--c-accent);">' + App._clientRoute.label + '</span></p>' +
    '</div>' +
    '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
      '<h4 style="font-weight:700;margin-bottom:12px;">📏 ¿Qué tan lejos quieres cubrir?</h4>' +
      '<p style="font-size:0.8rem;color:var(--c-text-muted);margin-bottom:14px;">El sistema buscará automáticamente todos tus clientes dentro de este radio y armará la ruta óptima.</p>' +
      '<button class="btn btn--secondary w-full" style="margin-bottom:8px;" onclick="App._crAutoRoute(2)">🚶 2 km — Caminando</button>' +
      '<button class="btn btn--secondary w-full" style="margin-bottom:8px;" onclick="App._crAutoRoute(5)">🚶 5 km — Caminata larga</button>' +
      '<button class="btn btn--secondary w-full" style="margin-bottom:8px;" onclick="App._crAutoRoute(10)">🚗 10 km — Vehículo</button>' +
      '<button class="btn btn--secondary w-full" style="margin-bottom:8px;" onclick="App._crAutoRoute(20)">🚗 20 km — Zona amplia</button>' +
      '<button class="btn btn--secondary w-full" onclick="App._crAutoRoute(50)">🌆 Toda la ciudad</button>' +
    '</div>';

  _rwRender('👥 Radio de Búsqueda', html);
};

// Step 3: Auto-build route — backend filters by proximity
App._crAutoRoute = function(radiusKm) {
  _rwRender('🗺️ Generando Ruta...',
    '<div class="glass-card" style="text-align:center;padding:24px;">' +
      '<div class="btn__spinner" style="border-color:rgba(108,60,225,0.3);border-top-color:#6C3CE1;margin:0 auto 16px;"></div>' +
      '<h3 style="font-weight:700;margin-bottom:8px;">Buscando clientes cercanos...</h3>' +
      '<p style="color:var(--c-text-muted);font-size:0.8rem;">Geocodificando direcciones y optimizando ruta.<br>Esto puede tardar unos segundos.</p>' +
    '</div>'
  );

  API.post('/api/routes/clients', {
    origin_lat: App._clientRoute.lat,
    origin_lng: App._clientRoute.lng,
    radius_km: radiusKm,
    profile: radiusKm <= 5 ? 'foot-walking' : 'driving-car',
  })
    .then(function(data) {
      haptic('success');
      var html = '';

      if (data.errors && data.errors.length > 0) {
        html +=
          '<div class="glass-card" style="padding:14px;margin-bottom:12px;border:1px solid rgba(255,107,157,0.3);">' +
            '<p style="font-size:0.8rem;color:#FF6B9D;font-weight:600;margin-bottom:4px;">⚠️ ' + data.errors.length + ' clientes sin ubicar:</p>' +
            '<p style="font-size:0.75rem;color:var(--c-text-muted);margin:0;">' + data.errors.join('<br>') + '</p>' +
          '</div>';
      }

      if (data.stops && data.stops.length > 0) {
        html +=
          '<div class="glass-card" style="padding:16px;margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<span style="font-size:1.5rem;font-weight:700;color:var(--c-accent);">' + data.stops.length + '</span>' +
                '<span style="color:var(--c-text-muted);font-size:0.85rem;"> clientes en ruta</span>' +
              '</div>' +
              '<div><span style="font-size:0.85rem;color:var(--c-text-muted);">⏱️ ~' + (data.total_time_min || 0) + ' min</span></div>' +
            '</div>' +
          '</div>';

        if (data.google_maps_url) {
          html +=
            '<a href="' + data.google_maps_url + '" target="_blank" class="btn btn--accent w-full" ' +
              'style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;text-decoration:none;">' +
              '🗺️ Abrir Ruta en Google Maps' +
            '</a>';
        }

        html += '<div class="glass-card" style="padding:16px;">';
        data.stops.forEach(function(stop, i) {
          html +=
            '<div style="display:flex;gap:12px;padding:10px 0;' + (i < data.stops.length - 1 ? 'border-bottom:1px solid var(--c-border);' : '') + '">' +
              '<div style="width:28px;height:28px;border-radius:50%;background:var(--c-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;">' + (i + 1) + '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:600;font-size:0.9rem;">👤 ' + stop.name + '</div>' +
                (stop.address ? '<div style="font-size:0.75rem;color:var(--c-text-muted);margin-top:2px;">' + stop.address + '</div>' : '') +
                (stop.phone ? '<div style="font-size:0.7rem;color:var(--c-text-secondary);margin-top:1px;">📞 ' + stop.phone + '</div>' : '') +
              '</div>' +
            '</div>';
        });
        html += '</div>';

        html += '<button class="btn btn--secondary w-full" style="margin-top:12px;" onclick="App._rwFromClients()">🔄 Armar otra ruta</button>';
      } else {
        html +=
          '<div class="glass-card" style="text-align:center;padding:24px;">' +
            '<div style="font-size:3rem;margin-bottom:12px;">📭</div>' +
            '<p style="color:var(--c-text-muted);margin-bottom:12px;">No se encontraron clientes en un radio de ' + radiusKm + ' km.</p>' +
            '<button class="btn btn--secondary w-full" onclick="App._crPickRadius()">📏 Cambiar radio</button>' +
          '</div>';
      }

      _rwRender('🗺️ Ruta Optimizada', html);
    })
    .catch(function(err) {
      haptic('error');
      showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
      App._crPickRadius();
    });
};

// ─── EXCEL UPLOAD HANDLERS ───

App._excelRouteUpload = function(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];

  if (!file.name.match(/\.(xlsx?|csv)$/i)) {
    showToast('Solo archivos .xlsx o .csv', 'error');
    return;
  }

  // Show loading state
  _rwRender('📋 Procesando Excel',
    '<div class="glass-card" style="text-align:center;padding:24px;">' +
      '<div class="btn__spinner" style="border-color:rgba(108,60,225,0.3);border-top-color:#6C3CE1;margin:0 auto 16px;"></div>' +
      '<h3 style="font-weight:700;margin-bottom:8px;">Procesando ' + file.name + '...</h3>' +
      '<p style="color:var(--c-text-muted);font-size:0.8rem;">Geocodificando direcciones y optimizando ruta.<br>Esto puede tardar hasta 30 segundos.</p>' +
    '</div>'
  );

  // Get profile
  var profileRadios = document.querySelectorAll('input[name="rw-excel-profile"]');
  var profile = 'driving-car';
  profileRadios.forEach(function(r) { if (r.checked) profile = r.value; });

  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1]; // Remove data:...;base64, prefix
    API.post('/api/routes/excel', { file: base64, profile: profile, filename: file.name })
      .then(function(data) {
        haptic('success');
        // Build results
        var html = '';

        if (data.errors && data.errors.length > 0) {
          html +=
            '<div class="glass-card" style="padding:14px;margin-bottom:12px;border:1px solid rgba(255,107,157,0.3);">' +
              '<p style="font-size:0.8rem;color:#FF6B9D;font-weight:600;margin-bottom:4px;">⚠️ ' + data.errors.length + ' direcciones no encontradas:</p>' +
              '<p style="font-size:0.75rem;color:var(--c-text-muted);margin:0;">' + data.errors.join('<br>') + '</p>' +
            '</div>';
        }

        if (data.stops && data.stops.length > 0) {
          html +=
            '<div class="glass-card" style="padding:16px;margin-bottom:12px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                  '<span style="font-size:1.5rem;font-weight:700;color:var(--c-accent);">' + data.stops.length + '</span>' +
                  '<span style="color:var(--c-text-muted);font-size:0.85rem;"> paradas en ruta</span>' +
                '</div>' +
                '<div><span style="font-size:0.85rem;color:var(--c-text-muted);">⏱️ ~' + (data.total_time_min || 0) + ' min</span></div>' +
              '</div>' +
            '</div>';

          if (data.google_maps_url) {
            html +=
              '<a href="' + data.google_maps_url + '" target="_blank" class="btn btn--accent w-full" ' +
                'style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px;text-decoration:none;">' +
                '🗺️ Abrir Ruta en Google Maps' +
              '</a>';
          }

          html += '<div class="glass-card" style="padding:16px;">';
          data.stops.forEach(function(stop, i) {
            html +=
              '<div style="display:flex;gap:12px;padding:10px 0;' + (i < data.stops.length - 1 ? 'border-bottom:1px solid var(--c-border);' : '') + '">' +
                '<div style="width:28px;height:28px;border-radius:50%;background:var(--c-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;flex-shrink:0;">' + (i + 1) + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="font-weight:600;font-size:0.9rem;">📍 ' + stop.name + '</div>' +
                  (stop.address ? '<div style="font-size:0.75rem;color:var(--c-text-muted);margin-top:2px;">' + stop.address + '</div>' : '') +
                '</div>' +
              '</div>';
          });
          html += '</div>';
        } else {
          html +=
            '<div class="glass-card" style="text-align:center;padding:24px;">' +
              '<div style="font-size:3rem;margin-bottom:12px;">📭</div>' +
              '<p style="color:var(--c-text-muted);">No se pudieron geocodificar las direcciones.</p>' +
            '</div>';
        }

        html += '<button class="btn btn--secondary w-full" style="margin-top:12px;" onclick="CMD_HANDLERS.ruta_excel()">🔄 Subir otro archivo</button>';
        _rwRender('📋 Ruta Optimizada', html);
      })
      .catch(function(err) {
        haptic('error');
        showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
        CMD_HANDLERS.ruta_excel();
      });
  };
  reader.readAsDataURL(file);
};

App._excelClientUpload = function(input) {
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];

  if (!file.name.match(/\.(xlsx?|csv)$/i)) {
    showToast('Solo archivos .xlsx o .csv', 'error');
    return;
  }

  _rwRender('📥 Importando',
    '<div class="glass-card" style="text-align:center;padding:24px;">' +
      '<div class="btn__spinner" style="border-color:rgba(108,60,225,0.3);border-top-color:#6C3CE1;margin:0 auto 16px;"></div>' +
      '<h3 style="font-weight:700;margin-bottom:8px;">Importando ' + file.name + '...</h3>' +
      '<p style="color:var(--c-text-muted);font-size:0.8rem;">Leyendo clientes del archivo Excel.</p>' +
    '</div>'
  );

  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    API.post('/api/clients/import', { file: base64, filename: file.name })
      .then(function(data) {
        haptic('success');
        _rwRender('📥 Importación Completa',
          '<div class="glass-card" style="text-align:center;padding:24px;">' +
            '<div style="font-size:3rem;margin-bottom:12px;">✅</div>' +
            '<h3 style="font-weight:700;margin-bottom:16px;">Importación Exitosa</h3>' +
            (data.columns_detected ? '<p style="font-size:0.75rem;color:var(--c-text-muted);margin-bottom:12px;">Columnas detectadas: ' + data.columns_detected.join(', ') + '</p>' : '') +
            '<div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;">' +
              '<div class="glass-card" style="padding:14px 20px;text-align:center;">' +
                '<div style="font-size:1.5rem;font-weight:700;color:#00E676;">' + data.inserted + '</div>' +
                '<div style="font-size:0.75rem;color:var(--c-text-muted);">Importados</div>' +
              '</div>' +
              (data.skipped > 0 ?
                '<div class="glass-card" style="padding:14px 20px;text-align:center;">' +
                  '<div style="font-size:1.5rem;font-weight:700;color:#FF6B9D;">' + data.skipped + '</div>' +
                  '<div style="font-size:0.75rem;color:var(--c-text-muted);">Omitidos</div>' +
                '</div>' : '') +
            '</div>' +
            '<button class="btn btn--primary w-full" onclick="CMD_HANDLERS.clientes()">👥 Ver Cartera</button>' +
            '<button class="btn btn--ghost w-full" style="margin-top:6px;" onclick="CMD_HANDLERS.importar_clientes()">📥 Importar otro</button>' +
          '</div>'
        );
      })
      .catch(function(err) {
        haptic('error');
        showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
        CMD_HANDLERS.importar_clientes();
      });
  };
  reader.readAsDataURL(file);
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
        { key: 'tipo_negocio', label: 'Categoría', type: 'select', options: ['Distribuidor', 'Consumidor Final', 'Mayorista', 'Minorista', 'Otro'], icon: '🏢' },
        { key: 'tipo_cliente', label: 'Estado', type: 'select', options: ['Cliente', 'Prospecto'], icon: '🏷️' },
        { key: 'nota_inicial', label: 'Nota inicial (opcional)', type: 'textarea', icon: '📝' }
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
          icon: item.estado === 'Prospecto' ? '🔵' : '🟢',
          title: item.nombre,
          subtitle: (item.estado || 'Cliente') + ' · ' + (item.telefono || 'Sin teléfono'),
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
        return { icon: '👤', title: item.nombre, subtitle: (item.estado || 'Cliente') + ' · ' + (item.telefono || '') };
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

        // Build custom multi-product form
        var titleEl = document.getElementById('data-form-title');
        var subtitleEl = document.getElementById('data-form-subtitle');
        var submitTextEl = document.getElementById('data-form-submit-text');
        var container = document.getElementById('data-form-fields');
        var submitBtn = document.getElementById('data-form-submit');
        var spinner = document.getElementById('data-form-spinner');

        if (titleEl) titleEl.textContent = '🛒 Crear Pedido';
        if (subtitleEl) subtitleEl.textContent = 'Agrega uno o más productos';
        if (submitTextEl) submitTextEl.textContent = 'Crear Pedido';
        if (container) container.innerHTML = '';

        var orderItems = [];
        var itemCounter = 0;

        // Client selector
        var clientGroup = document.createElement('div');
        clientGroup.className = 'input-group w-full';
        clientGroup.style.marginBottom = '12px';
        var clientSelect = document.createElement('select');
        clientSelect.id = 'order-client';
        clientSelect.style.cssText = 'appearance:auto;background:var(--c-bg-card);color:var(--c-text);border:1px solid var(--c-border);padding:14px 16px;border-radius:12px;width:100%;font-size:0.95rem;';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = ''; defaultOpt.textContent = '👤 Seleccionar cliente';
        clientSelect.appendChild(defaultOpt);
        clients.forEach(function(c) {
          var o = document.createElement('option');
          o.value = c.id; o.textContent = c.nombre;
          clientSelect.appendChild(o);
        });
        clientGroup.appendChild(clientSelect);
        container.appendChild(clientGroup);

        // Items container
        var itemsDiv = document.createElement('div');
        itemsDiv.id = 'order-items-container';
        container.appendChild(itemsDiv);

        // Total display
        var totalDiv = document.createElement('div');
        totalDiv.id = 'order-total-display';
        totalDiv.style.cssText = 'text-align:center;padding:12px;font-size:1.1rem;font-weight:700;color:var(--c-accent);margin:8px 0;';
        totalDiv.textContent = 'Total: $0';
        container.appendChild(totalDiv);

        // Add item button
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn--ghost w-full';
        addBtn.style.marginBottom = '12px';
        addBtn.textContent = '＋ Agregar producto';
        addBtn.onclick = function() { addItemRow(); };
        container.appendChild(addBtn);

        function updateTotal() {
          var total = 0;
          orderItems.forEach(function(item) {
            var qtyEl = document.getElementById('item-qty-' + item.idx);
            var priceEl = document.getElementById('item-price-' + item.idx);
            if (!qtyEl || !priceEl) return; // row was removed
            var qty = parseInt(qtyEl.value) || 0;
            var price = parseFloat(priceEl.value) || 0;
            total += qty * price;
          });
          totalDiv.textContent = 'Total: ' + formatCOP(total);
        }

        function addItemRow() {
          var idx = itemCounter++;
          var row = document.createElement('div');
          row.className = 'glass-card';
          row.id = 'item-row-' + idx;
          row.style.cssText = 'padding:12px;margin-bottom:10px;position:relative;';

          // Product select
          var prodSelect = '<select id="item-prod-' + idx + '" style="appearance:auto;background:var(--c-bg-input);color:var(--c-text);border:1px solid var(--c-border);padding:10px 12px;border-radius:10px;width:100%;font-size:0.9rem;margin-bottom:8px;">';
          prodSelect += '<option value="">📦 Producto</option>';
          products.forEach(function(p) {
            prodSelect += '<option value="' + p.nombre + '" data-pv="' + p.precio_venta + '" data-pc="' + p.precio_compra + '">' + p.nombre + ' — ' + formatCOP(p.precio_venta) + '</option>';
          });
          prodSelect += '</select>';

          row.innerHTML = prodSelect +
            '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
              '<input type="number" id="item-qty-' + idx + '" placeholder="🔢 Cantidad" value="1" inputmode="numeric" style="flex:1;padding:10px 12px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;color:var(--c-text);font-size:0.9rem;">' +
              '<input type="number" id="item-price-' + idx + '" placeholder="💰 Precio" inputmode="numeric" step="any" style="flex:1;padding:10px 12px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;color:var(--c-text);font-size:0.9rem;">' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--c-text-muted);cursor:pointer;">' +
              '<input type="checkbox" id="item-update-' + idx + '" style="width:16px;height:16px;">' +
              ' Actualizar precio del producto' +
            '</label>' +
            '<button type="button" onclick="document.getElementById(\'item-row-' + idx + '\').remove();var i=window._orderItems.findIndex(function(x){return x.idx===' + idx + '});if(i>-1)window._orderItems.splice(i,1);window._updateOrderTotal();" style="position:absolute;top:8px;right:8px;background:none;border:none;color:#FF6B9D;font-size:1.2rem;cursor:pointer;">✕</button>';

          itemsDiv.appendChild(row);
          orderItems.push({ idx: idx });

          // Auto-fill price when product selected
          var prodEl = document.getElementById('item-prod-' + idx);
          var priceEl = document.getElementById('item-price-' + idx);
          prodEl.onchange = function() {
            var selected = prodEl.options[prodEl.selectedIndex];
            if (selected && selected.dataset.pv) {
              priceEl.value = selected.dataset.pv;
            }
            updateTotal();
          };
          priceEl.oninput = updateTotal;
          document.getElementById('item-qty-' + idx).oninput = updateTotal;
        }

        // Store refs globally for remove button
        window._orderItems = orderItems;
        window._updateOrderTotal = updateTotal;

        // Add first item row
        addItemRow();

        // Submit handler
        if (submitBtn) {
          submitBtn.onclick = function() {
            var clientId = clientSelect.value;
            if (!clientId) { haptic('error'); showToast('Selecciona un cliente', 'error'); return; }

            var items = [];
            var hasError = false;
            orderItems.forEach(function(item) {
              var prodEl = document.getElementById('item-prod-' + item.idx);
              var qtyEl = document.getElementById('item-qty-' + item.idx);
              var priceEl = document.getElementById('item-price-' + item.idx);
              var updateEl = document.getElementById('item-update-' + item.idx);
              if (!prodEl || !qtyEl || !priceEl) return; // row was removed
              var producto = prodEl.value;
              var cantidad = parseInt(qtyEl.value) || 0;
              var precio = parseFloat(priceEl.value) || 0;
              if (!producto || cantidad <= 0 || precio <= 0) { hasError = true; return; }

              // Get precio_compra from product data
              var prod = products.find(function(p) { return p.nombre === producto; });
              items.push({
                producto: producto,
                cantidad: cantidad,
                precio_venta: precio,
                precio_compra: prod ? prod.precio_compra : 0,
                update_price: updateEl ? updateEl.checked : false
              });
            });

            if (hasError || items.length === 0) {
              haptic('error');
              showToast('Completa todos los productos', 'error');
              return;
            }

            if (submitTextEl) submitTextEl.classList.add('hidden');
            if (spinner) spinner.classList.remove('hidden');
            submitBtn.disabled = true;

            API.post('/api/orders', { cliente_id: parseInt(clientId), items: items })
              .then(function(res) {
                haptic('success');
                showToast('✅ Pedido creado (' + items.length + ' productos)', 'info');
                popNav();
              })
              .catch(function() {
                haptic('error');
                showToast('Error al crear pedido', 'error');
              })
              .finally(function() {
                if (submitTextEl) submitTextEl.classList.remove('hidden');
                if (spinner) spinner.classList.add('hidden');
                submitBtn.disabled = false;
              });
          };
        }

        pushNav('data-form');
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
        var isPaid = item.estado_pago === 'Pagado';
        var isDelivered = item.estado === 'Entregado';
        var icon = isPaid ? '✅' : isDelivered ? '📦' : '🕐';
        var statusParts = [item.estado];
        if (isDelivered) statusParts.push(isPaid ? '💚 Pagado' : '🔴 Sin pagar');
        return {
          icon: icon,
          title: item.producto + ' × ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente') + ' · ' + statusParts.join(' · '),
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
      subtitle: 'Toca un producto para editarlo',
      apiEndpoint: '/api/products',
      itemsKey: 'products',
      emptyIcon: '💰',
      emptyText: 'No tienes productos. ¡Agrega el primero!',
      addBtn: { label: '+ Nuevo Producto', cmd: 'nuevo_producto' },
      renderItem: function(item) {
        return {
          icon: '📦',
          title: item.nombre,
          subtitle: 'Compra: ' + formatCOP(item.precio_compra) + ' · Stock: ' + (item.stock_actual || item.stock || 0),
          detail: formatCOP(item.precio_venta) + ' ✏️'
        };
      },
      onItemClick: function(item) {
        CMD_HANDLERS.editar_producto(item);
      }
    });
  },

  editar_producto: function(product) {
    if (!product) { showToast('Selecciona un producto', 'error'); return; }
    App.showForm({
      title: '✏️ Editar Producto',
      subtitle: product.nombre,
      fields: [
        { key: 'nombre', label: 'Nombre del producto', type: 'text', required: true, icon: '📦', defaultValue: product.nombre },
        { key: 'precio_compra', label: 'Precio de compra', type: 'number', icon: '💵', defaultValue: product.precio_compra },
        { key: 'precio_venta', label: 'Precio de venta', type: 'number', icon: '💰', defaultValue: product.precio_venta },
        { key: 'stock_actual', label: 'Stock', type: 'number', icon: '📊', defaultValue: product.stock_actual || product.stock || 0 }
      ],
      submitLabel: 'Guardar Cambios',
      apiEndpoint: '/api/products/update',
      beforeSubmit: function(data) {
        data.id = product.id;
        return data;
      },
      successMsg: '✅ Producto actualizado'
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
          subtitle: (item.estado || 'Cliente') + ' · ' + (item.telefono || 'Sin teléfono'),
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
              { icon: '🏷️', label: 'Estado', value: c.estado || 'Prospecto' },
              { icon: '🏢', label: 'Tipo Negocio', value: c.tipo_negocio || 'Sin definir' },
              { icon: '📅', label: 'Día de visita', value: c.dia_visita || 'Sin asignar' },
              { icon: '📦', label: 'Total pedidos', value: (data.orders_count || 0).toString() },
              { icon: '💰', label: 'Total compras', value: formatCOP(data.total_purchases || 0) }
            ];
            var html = rows.map(function(r) {
              return '<div class="glass-card" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;margin-bottom:8px;">' +
                '<span>' + r.icon + ' ' + r.label + '</span>' +
                '<span style="font-weight:600;color:var(--c-secondary);">' + r.value + '</span></div>';
            }).join('');

            // Show notes section
            var notes = data.notes || [];
            if (notes.length > 0) {
              html += '<div style="margin-top:16px;"><h3 style="color:var(--c-text-secondary);font-size:0.85rem;margin-bottom:8px;">📝 NOTAS RECIENTES</h3>';
              notes.forEach(function(n) {
                html += '<div class="glass-card" style="padding:12px 16px;margin-bottom:6px;">' +
                  '<div style="color:var(--c-text);font-size:0.9rem;">' + (n.texto || '') + '</div>' +
                  '<div style="color:var(--c-text-muted);font-size:0.75rem;margin-top:4px;">' + formatDate(n.fecha) + '</div>' +
                  '</div>';
              });
              html += '</div>';
            }

            return html;
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

  // ── Documentos (PDF via Telegram) ──
  remision: function() {
    App.showList({
      title: '📄 Generar Remision PDF',
      subtitle: 'Selecciona un pedido para generar la remision',
      apiEndpoint: '/api/orders',
      emptyIcon: '📄',
      emptyText: 'No hay pedidos registrados',
      renderItem: function(item) {
        return {
          icon: item.estado === 'Pagado' ? '✅' : '📦',
          title: item.producto + ' x ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente') + ' - ' + item.estado,
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      },
      onItemClick: function(item) {
        showToast('📄 Generando PDF...', 'info');
        API.post('/api/documents/remision', { order_id: item.id })
          .then(function(res) {
            haptic('success');
            showToast('📄 ' + (res.message || 'PDF enviado al chat'), 'info');
            popNav();
          })
          .catch(function() {
            showToast('Error al generar la remision', 'error');
          });
      }
    });
  },

  despacho: function() {
    App.showList({
      title: '🚛 Despacho PDF',
      subtitle: 'Selecciona un pedido para el despacho',
      apiEndpoint: '/api/orders?status=Pendiente',
      emptyIcon: '🚛',
      emptyText: 'No hay pedidos pendientes',
      renderItem: function(item) {
        return {
          icon: '📦',
          title: item.producto + ' x ' + item.cantidad,
          subtitle: (item.cliente_nombre || 'Cliente'),
          detail: formatCOP(item.precio_venta * item.cantidad)
        };
      },
      onItemClick: function(item) {
        showToast('🚛 Generando PDF de despacho...', 'info');
        API.post('/api/documents/despacho', { order_id: item.id })
          .then(function(res) {
            haptic('success');
            showToast('🚛 ' + (res.message || 'PDF enviado al chat'), 'info');
            popNav();
          })
          .catch(function() {
            showToast('Error al generar el despacho', 'error');
          });
      }
    });
  },

  cotizar: function() {
    showToast('📋 Generando cotizacion PDF...', 'info');
    API.post('/api/documents/cotizacion', {})
      .then(function(res) {
        haptic('success');
        showToast('📋 ' + (res.message || 'PDF enviado al chat'), 'info');
      })
      .catch(function() {
        showToast('Error al generar la cotizacion', 'error');
      });
  },

  cotizar_whatsapp: function() {
    App.showList({
      title: '📲 Cotizar por WhatsApp',
      subtitle: 'Selecciona un cliente para enviarle los precios',
      apiEndpoint: '/api/clients',
      emptyIcon: '👥',
      emptyText: 'No hay clientes registrados',
      renderItem: function(item) {
        return {
          icon: item.telefono ? '📱' : '👤',
          title: item.nombre,
          subtitle: item.telefono || 'Sin teléfono',
          detail: item.tipo_negocio || ''
        };
      },
      onItemClick: function(item) {
        if (!item.telefono) {
          showToast('Este cliente no tiene teléfono registrado', 'error');
          haptic('error');
          return;
        }
        showToast('📲 Preparando cotización...', 'info');
        API.get('/api/whatsapp/cotizacion/' + item.id)
          .then(function(res) {
            if (res.url) {
              haptic('success');
              showToast('Abriendo WhatsApp con ' + res.products_count + ' productos...', 'info');
              window.open(res.url, '_blank');
            }
          })
          .catch(function(err) {
            showToast(err.message || 'Error al generar cotización', 'error');
          });
      }
    });
  },

  cobrar_whatsapp: function() {
    App.showList({
      title: '📲 Cobrar por WhatsApp',
      subtitle: 'Selecciona un cliente para enviarle el recordatorio',
      apiEndpoint: '/api/clients',
      emptyIcon: '💳',
      emptyText: 'No hay clientes registrados',
      renderItem: function(item) {
        return {
          icon: item.telefono ? '📱' : '👤',
          title: item.nombre,
          subtitle: item.telefono || 'Sin teléfono',
          detail: item.tipo_negocio || ''
        };
      },
      onItemClick: function(item) {
        if (!item.telefono) {
          showToast('Este cliente no tiene teléfono registrado', 'error');
          haptic('error');
          return;
        }
        showToast('💳 Preparando cobro...', 'info');
        API.get('/api/whatsapp/cobro/' + item.id)
          .then(function(res) {
            if (res.url) {
              haptic('success');
              showToast('Abriendo WhatsApp - Deuda: ' + formatCOP(res.total_debt), 'info');
              window.open(res.url, '_blank');
            }
          })
          .catch(function(err) {
            showToast(err.message || 'El cliente no tiene deudas pendientes', 'error');
          });
      }
    });
  },

  _showDocument: function(title, text) {
    var titleEl = document.getElementById('data-result-title');
    var content = document.getElementById('data-result-content');
    if (titleEl) titleEl.textContent = title;

    if (content) {
      content.innerHTML =
        '<div id="doc-text" style="background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:12px;padding:16px;margin-bottom:16px;white-space:pre-wrap;font-family:monospace;font-size:0.85rem;line-height:1.6;color:var(--c-text);max-height:55vh;overflow-y:auto;">' +
        text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</div>' +
        '<div onclick="CMD_HANDLERS._copyDocument()" style="text-align:center;padding:14px;background:var(--c-primary);color:white;border-radius:12px;cursor:pointer;font-weight:600;touch-action:manipulation;user-select:none;">📋 Copiar al Portapapeles</div>';
    }
    pushNav('data-result');
  },

  _copyDocument: function() {
    var el = document.getElementById('doc-text');
    if (!el) return;
    var text = el.textContent || el.innerText;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('📋 Copiado! Pegalo en WhatsApp, Email u otra app', 'info');
        haptic('success');
      }).catch(function() {
        CMD_HANDLERS._fallbackCopy(text);
      });
    } else {
      CMD_HANDLERS._fallbackCopy(text);
    }
  },

  _fallbackCopy: function(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('📋 Copiado! Pegalo donde necesites', 'info');
      haptic('success');
    } catch (e) {
      showToast('Selecciona el texto manualmente para copiar', 'error');
    }
    document.body.removeChild(ta);
  },


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
          subtitle: 'Costo: ' + formatCOP(item.precio_compra) + ' | Venta: ' + formatCOP(item.precio_venta),
          detail: stock + ' uds'
        };
      }
    });
  },

  ruta_pie: function() {
    _rwRender('🚶 Ruta a Pie',
      '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
        '<h4 style="font-weight:700;margin-bottom:16px;text-align:center;">¿Cómo quieres armar tu ruta?</h4>' +

        '<button class="btn btn--primary w-full" style="margin-bottom:10px;" onclick="App._rwFromClients()">' +
          '👥 Con mis clientes registrados' +
        '</button>' +
        '<p style="font-size:0.75rem;color:var(--c-text-muted);margin:0 0 16px 0;text-align:center;">Selecciona clientes de tu cartera para generar ruta optimizada</p>' +

        '<button class="btn btn--secondary w-full" style="margin-bottom:10px;" onclick="App._rwProspect()">' +
          '🔍 Prospectar negocios nuevos' +
        '</button>' +
        '<p style="font-size:0.75rem;color:var(--c-text-muted);margin:0;text-align:center;">Busca negocios cercanos a una ubicación y genera ruta</p>' +
      '</div>'
    );
    pushNav('data-result');
  },

  ruta_camion: function() {
    var titleEl = document.getElementById('data-result-title');
    var content = document.getElementById('data-result-content');
    if (titleEl) titleEl.textContent = '🚚 Ruta de Entregas';
    if (content) {
      content.innerHTML =
        '<div class="glass-card" style="text-align:center;padding:24px;margin-bottom:16px;">' +
          '<div style="font-size:3rem;margin-bottom:12px;">🚚</div>' +
          '<h3 style="font-weight:700;margin-bottom:8px;">Ruta de Entregas</h3>' +
          '<p style="color:var(--c-text-muted);font-size:0.85rem;margin-bottom:16px;">' +
            'Calcula el orden óptimo para entregar todos tus pedidos pendientes en vehículo.' +
          '</p>' +
          '<p style="color:var(--c-accent);font-weight:600;font-size:0.95rem;">Escribe <code>/ruta_camion</code> en el chat del bot</p>' +
        '</div>';
    }
    pushNav('data-result');
  },

  ruta_semanal: function() {
    var titleEl = document.getElementById('data-result-title');
    var content = document.getElementById('data-result-content');
    if (titleEl) titleEl.textContent = '📅 Ruta Semanal';
    if (content) {
      content.innerHTML =
        '<div class="glass-card" style="text-align:center;padding:24px;margin-bottom:16px;">' +
          '<div style="font-size:3rem;margin-bottom:12px;">📅</div>' +
          '<h3 style="font-weight:700;margin-bottom:8px;">Ruta Semanal</h3>' +
          '<p style="color:var(--c-text-muted);font-size:0.85rem;margin-bottom:16px;">' +
            'Genera la ruta peatonal optimizada para visitar tus clientes según el día asignado.' +
          '</p>' +
          '<p style="color:var(--c-accent);font-weight:600;font-size:0.95rem;">Escribe <code>/ruta_semanal</code> en el chat del bot</p>' +
        '</div>';
    }
    pushNav('data-result');
  },

  ruta_excel: function() {
    _rwRender('📋 Ruta desde Excel',
      '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
        '<div style="text-align:center;margin-bottom:16px;">' +
          '<div style="font-size:3rem;margin-bottom:8px;">📋</div>' +
          '<h3 style="font-weight:700;margin-bottom:6px;">Optimizar Ruta desde Excel</h3>' +
          '<p style="color:var(--c-text-muted);font-size:0.8rem;">Sube un archivo Excel (.xlsx) o CSV con las direcciones de tus clientes y generaremos la ruta más eficiente.</p>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px;margin-bottom:16px;background:var(--c-bg-input);border:1px dashed var(--c-border);">' +
          '<p style="font-size:0.8rem;color:var(--c-text-muted);margin-bottom:8px;"><b>📌 Formato requerido:</b></p>' +
          '<p style="font-size:0.8rem;color:var(--c-text-secondary);line-height:1.6;margin:0;">' +
            'El Excel debe tener al menos una columna llamada:<br>' +
            '• <b>Dirección</b> (o Address, Domicilio, Ubicación)<br>' +
            '• Opcional: <b>Nombre</b> (o Cliente, Negocio)' +
          '</p>' +
        '</div>' +
        '<label style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px dashed var(--c-accent);border-radius:12px;cursor:pointer;transition:opacity 0.2s;" id="rw-excel-drop">' +
          '<span style="font-size:1.5rem;">📁</span>' +
          '<span style="font-size:0.85rem;color:var(--c-accent);font-weight:600;">Toca para seleccionar archivo</span>' +
          '<span style="font-size:0.75rem;color:var(--c-text-muted);">.xlsx o .csv</span>' +
          '<input type="file" accept=".xlsx,.xls,.csv" id="rw-excel-file" style="display:none;" onchange="App._excelRouteUpload(this)">' +
        '</label>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;cursor:pointer;">' +
            '<input type="radio" name="rw-excel-profile" value="driving-car" checked style="accent-color:var(--c-accent);">' +
            '<span style="font-size:0.85rem;">🚛 Vehículo</span>' +
          '</label>' +
          '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--c-bg-input);border:1px solid var(--c-border);border-radius:10px;cursor:pointer;">' +
            '<input type="radio" name="rw-excel-profile" value="foot-walking" style="accent-color:var(--c-accent);">' +
            '<span style="font-size:0.85rem;">🚶 A pie</span>' +
          '</label>' +
        '</div>' +
      '</div>'
    );
    pushNav('data-result');
  },

  importar_clientes: function() {
    _rwRender('📥 Importar Clientes',
      '<div class="glass-card" style="padding:20px;margin-bottom:12px;">' +
        '<div style="text-align:center;margin-bottom:16px;">' +
          '<div style="font-size:3rem;margin-bottom:8px;">📥</div>' +
          '<h3 style="font-weight:700;margin-bottom:6px;">Importar Clientes</h3>' +
          '<p style="color:var(--c-text-muted);font-size:0.8rem;">Carga tu base de clientes desde un archivo Excel o CSV. El sistema detectará las columnas automáticamente.</p>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px;margin-bottom:16px;background:var(--c-bg-input);border:1px dashed var(--c-border);">' +
          '<p style="font-size:0.8rem;color:var(--c-text-muted);margin-bottom:8px;"><b>📌 Columnas soportadas:</b></p>' +
          '<p style="font-size:0.8rem;color:var(--c-text-secondary);line-height:1.6;margin:0;">' +
            '• <b>Nombre</b> (obligatorio) — Cliente, Negocio<br>' +
            '• <b>Teléfono</b> — Celular, WhatsApp, Móvil<br>' +
            '• <b>Dirección</b> — Domicilio, Ubicación<br>' +
            '• <b>Zona</b> — Sector, Barrio, Localidad<br>' +
            '• <b>Tipo</b> — Categoría, Giro<br>' +
            '• <b>Día</b> — Día de visita' +
          '</p>' +
        '</div>' +
        '<label style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px dashed var(--c-accent);border-radius:12px;cursor:pointer;transition:opacity 0.2s;">' +
          '<span style="font-size:1.5rem;">📁</span>' +
          '<span style="font-size:0.85rem;color:var(--c-accent);font-weight:600;">Toca para seleccionar archivo</span>' +
          '<span style="font-size:0.75rem;color:var(--c-text-muted);">.xlsx o .csv</span>' +
          '<input type="file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="App._excelClientUpload(this)">' +
        '</label>' +
      '</div>'
    );
    pushNav('data-result');
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
          '<span>Vendido</span><span style="font-weight:700;color:#00E676;">' + formatCOP(sales) + '</span></div>' +
          '<div class="glass-card" style="display:flex;justify-content:space-between;padding:14px 18px;margin-bottom:8px;">' +
          '<span>Faltante</span><span style="font-weight:700;color:#FF6B9D;">' + formatCOP(remaining) + '</span></div>' +
          (meta === 0 ? '<div style="margin-top:12px;text-align:center;color:var(--c-text-muted);font-size:0.8rem;">Configura tu meta con Configurar Meta</div>' : '');
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
      successMsg: 'Meta mensual configurada'
    });
  },

  // ── Admin ──
  editar: function() {
    App.showList({
      title: '✏️ Editar Registro',
      subtitle: 'Selecciona el cliente a editar',
      apiEndpoint: '/api/clients',
      emptyIcon: '✏️',
      emptyText: 'No hay registros para editar',
      renderItem: function(item) {
        return {
          icon: '👤',
          title: item.nombre,
          subtitle: (item.tipo_cliente || 'Cliente') + ' | ' + (item.telefono || ''),
          detail: '✏️'
        };
      },
      onItemClick: function(item) {
        App.showForm({
          title: '✏️ Editar: ' + item.nombre,
          subtitle: 'Modifica los datos del cliente',
          fields: [
            { key: 'nombre', label: 'Nombre', type: 'text', icon: '👤' },
            { key: 'telefono', label: 'Telefono', type: 'tel', icon: '📱' },
            { key: 'direccion', label: 'Direccion', type: 'text', icon: '📍' },
            { key: 'tipo_cliente', label: 'Tipo', type: 'select', options: ['Cliente', 'Prospecto'], icon: '🏷️' }
          ],
          submitLabel: 'Guardar Cambios',
          apiEndpoint: '/api/clients',
          prefill: item,
          successMsg: 'Cliente actualizado'
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
          subtitle: (item.tipo_cliente || 'Cliente') + ' | ' + (item.telefono || ''),
          detail: '🗑️'
        };
      },
      onItemClick: function(item) {
        if (confirm('Eliminar permanentemente a ' + item.nombre + '? Esta accion no se puede deshacer.')) {
          API.post('/api/delete/client', { id: item.id })
            .then(function() {
              showToast('Cliente eliminado', 'info');
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
    API.post('/api/documents/backup', {})
      .then(function(res) {
        haptic('success');
        showToast('💾 ' + (res.message || 'Respaldo enviado al chat'), 'info');
      })
      .catch(function() { showToast('Error al generar respaldo', 'error'); });
  }
};


// ─── BOOT ───
document.addEventListener('DOMContentLoaded', function() {
  App.init();
});
