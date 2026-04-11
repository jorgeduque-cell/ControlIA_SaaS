# SISTEMA DE DISEÑO UX/UI ENTERPRISE
## ControlIA Agent Platform - Escalamiento a Latinoamérica

---

## 1. ESTRATEGIA MULTI-CANAL

### 1.1 Mapa de Canales y Perfiles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ECOSISTEMA MULTI-CANAL CONTROLIA                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│   │   WEB APP   │    │  MOBILE APP │    │  WHATSAPP   │    │  TELEGRAM   │ │
│   │  (Primary)  │    │  (iOS/And)  │    │   Business  │    │     Bot     │ │
│   │             │    │             │    │     API     │    │             │ │
│   │ • Dashboard │    │ • Quick     │    │ • Customer  │    │ • Customer  │ │
│   │ • Builder   │    │   actions   │    │   support   │    │   support   │ │
│   │ • Analytics │    │ • Alerts    │    │ • Sales     │    │ • Sales     │ │
│   │ • Admin     │    │ • Approvals │    │ • Notifications│   │ • Notifications│
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│          │                  │                  │                  │        │
│          └──────────────────┴──────────────────┴──────────────────┘        │
│                                    │                                        │
│                         ┌──────────┴──────────┐                            │
│                         │   CONTROLIA CORE    │                            │
│                         │   (Agent Engine)    │                            │
│                         └──────────┬──────────┘                            │
│                                    │                                        │
│          ┌─────────────────────────┼─────────────────────────┐             │
│          │                         │                         │             │
│   ┌──────┴──────┐          ┌──────┴──────┐          ┌──────┴──────┐       │
│   │    SLACK    │          │    TEAMS    │          │    EMAIL    │       │
│   │             │          │             │          │             │       │
│   │ • Internal  │          │ • Internal  │          │ • Reports   │       │
│   │   alerts    │          │   alerts    │          │ • Digests   │       │
│   │ • Commands  │          │ • Commands  │          │ • Alerts    │       │
│   │ • Approvals │          │ • Approvals │          │ • Marketing │       │
│   └─────────────┘          └─────────────┘          └─────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Matriz de Canales por Perfil

| Canal | Admin/IT | Agent Builder | Business User | Analyst | End Customer |
|-------|----------|---------------|---------------|---------|--------------|
| **Web App** | Full Access | Full Access | Full Access | Full Access | Limited* |
| **Mobile App** | Alerts + Approvals | Monitoring | Primary Use | Dashboard | Chat Only |
| **WhatsApp** | Emergency | Testing | Quick Actions | Alerts | Primary Channel |
| **Telegram** | Emergency | Testing | Quick Actions | Alerts | Primary Channel |
| **Slack** | Notifications | Deploy Alerts | Daily Use | Reports | - |
| **Teams** | Notifications | Deploy Alerts | Daily Use | Reports | - |
| **Email** | Reports | Digests | Digests | Reports | Notifications |
| **Voice** | - | - | Hands-free | - | Support Line |

*End Customer solo accede a agentes públicos vía web embed o portal

### 1.3 Priorización de Canales (MVP → Full)

```
FASE 1 (MVP - Meses 1-3):
├── Web Application (Primary)
├── WhatsApp Business API
└── Telegram Bot

FASE 2 (Growth - Meses 4-6):
├── Mobile App (iOS/Android)
├── Email Integration
└── Slack Integration

FASE 3 (Scale - Meses 7-12):
├── Microsoft Teams
├── Voice Interface
└── Embedded Widget
```

---

## 2. PERFILES DE USUARIO (PERSONAS)

### 2.1 Admin/IT - "Carlos, Director de Tecnología"

```
┌─────────────────────────────────────────────────────────────────┐
│  CARLOS MARTÍNEZ - Director de Tecnología                      │
│  Empresa: FinTech Mediana (150 empleados)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎯 OBJETIVOS:                                                   │
│     • Garantizar seguridad y compliance                         │
│     • Controlar costos de infraestructura                       │
│     • Gestionar accesos y permisos                              │
│                                                                  │
│  😤 FRUSTRACIONES:                                               │
│     • Demasiadas herramientas dispersas                         │
│     • Falta de visibilidad de costos                            │
│     • Configuración compleja de SSO                             │
│                                                                  │
│  💼 TAREAS PRINCIPALES:                                          │
│     1. Configurar SSO/SAML                                      │
│     2. Gestionar usuarios y roles                               │
│     3. Monitorear seguridad y logs                              │
│     4. Controlar billing y usage                                │
│     5. Configurar integraciones enterprise                      │
│                                                                  │
│  📱 CANALES PREFERIDOS: Web + Mobile (alerts)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Flujos Prioritarios:**
- Onboarding de empresa
- Configuración SSO
- User management
- Billing y cost control
- Security audit logs

---

### 2.2 Agent Builder - "Ana, AI Product Manager"

```
┌─────────────────────────────────────────────────────────────────┐
│  ANA GARCÍA - AI Product Manager                               │
│  Empresa: E-commerce Grande (500+ empleados)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎯 OBJETIVOS:                                                   │
│     • Crear agentes que resuelvan problemas reales              │
│     • Iterar rápido sin depender de developers                  │
│     • Medir impacto de los agentes                              │
│                                                                  │
│  😤 FRUSTRACIONES:                                               │
│     • Tools limitadas para integraciones                        │
│     • Difícil debuggear fallos                                  │
│     • No hay version control para prompts                       │
│                                                                  │
│  💼 TAREAS PRINCIPALES:                                          │
│     1. Diseñar flujos conversacionales                          │
│     2. Configurar tools e integraciones                         │
│     3. Escribir y testear prompts                               │
│     4. Deploy y monitoreo                                       │
│     5. A/B testing de versiones                                 │
│                                                                  │
│  📱 CANALES PREFERIDOS: Web (Primary) + Mobile (monitoring)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Flujos Prioritarios:**
- Agent builder visual
- Prompt editor
- Tool configuration
- Testing interface
- Version control

---

### 2.3 Business User - "Luis, Ejecutivo de Ventas"

```
┌─────────────────────────────────────────────────────────────────┐
│  LUIS HERNÁNDEZ - Ejecutivo de Ventas Senior                   │
│  Empresa: SaaS B2B (80 empleados)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎯 OBJETIVOS:                                                   │
│     • Cerrar más ventas en menos tiempo                         │
│     • Tener contexto de clientes instantáneamente               │
│     • Automatizar tareas repetitivas                            │
│                                                                  │
│  😤 FRUSTRACIONES:                                               │
│     • Saltar entre CRM, email, WhatsApp                         │
│     • Perder tiempo en data entry                               │
│     • No recordar detalles de cada cliente                      │
│                                                                  │
│  💼 TAREAS PRINCIPALES:                                          │
│     1. Interactuar con agente de ventas                         │
│     2. Revisar resumen de clientes                              │
│     3. Aprobar acciones del agente                              │
│     4. Ver métricas personales                                  │
│     5. Configurar preferencias                                  │
│                                                                  │
│  📱 CANALES PREFERIDOS: WhatsApp + Mobile App                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Flujos Prioritarios:**
- Chat con agentes
- Customer insights
- Approval workflows
- Personal dashboard

---

### 2.4 Analyst - "Mariana, Data Analyst"

```
┌─────────────────────────────────────────────────────────────────┐
│  MARIANA SILVA - Data Analyst                                  │
│  Empresa: Retail Multinacional (2000+ empleados)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎯 OBJETIVOS:                                                   │
│     • Entender performance de agentes                           │
│     • Identificar oportunidades de mejora                       │
│     • Reportar ROI a stakeholders                               │
│                                                                  │
│  😤 FRUSTRACIONES:                                               │
│     • Datos dispersos en múltiples fuentes                      │
│     • Falta de métricas custom                                  │
│     • Reportes manuales que toman horas                         │
│                                                                  │
│  💼 TAREAS PRINCIPALES:                                          │
│     1. Crear dashboards custom                                  │
│     2. Analizar métricas de uso                                 │
│     3. Generar reportes automáticos                             │
│     4. Exportar datos para análisis externo                     │
│     5. Configurar alertas de anomalías                          │
│                                                                  │
│  📱 CANALES PREFERIDOS: Web (Primary) + Email (reports)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Flujos Prioritarios:**
- Analytics dashboard
- Custom reports
- Data export
- Alert configuration

---

### 2.5 End Customer - "Pedro, Cliente Final"

```
┌─────────────────────────────────────────────────────────────────┐
│  PEDRO SÁNCHEZ - Cliente Final                                 │
│  Interactúa con: Agente de soporte de empresa X                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🎯 OBJETIVOS:                                                   │
│     • Resolver mi problema rápidamente                          │
│     • No tener que repetir información                          │
│     • Hablar en mi idioma y horario                             │
│                                                                  │
│  😤 FRUSTRACIONES:                                               │
│     • Bots que no entienden                                     │
│     • Esperar horas por respuesta                               │
│     • Tener que instalar apps nuevas                            │
│                                                                  │
│  💼 TAREAS PRINCIPALES:                                          │
│     1. Hacer preguntas de soporte                               │
│     2. Consultar estado de pedidos                              │
│     3. Solicitar información de productos                       │
│     4. Escalar a humano si es necesario                         │
│                                                                  │
│  📱 CANALES PREFERIDOS: WhatsApp > Telegram > Web Chat          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Flujos Prioritarios:**
- Chat interface
- Quick replies
- Human handoff
- Order tracking

---

## 3. ARQUITECTURA DE INFORMACIÓN

### 3.1 Site Map - Web Application

```
controlia.io/
│
├── 🔐 Auth
│   ├── /login
│   ├── /register
│   ├── /forgot-password
│   ├── /reset-password
│   └── /sso/callback
│
├── 🏠 Dashboard (Home)
│   ├── /dashboard
│   │   ├── Overview general
│   │   ├── Quick actions
│   │   ├── Recent activity
│   │   └── Alerts
│   │
├── 🤖 Agents
│   ├── /agents
│   │   ├── Listado de agentes
│   │   ├── Filtros y búsqueda
│   │   └── Status overview
│   │
│   ├── /agents/new
│   │   └── Wizard de creación
│   │
│   ├── /agents/[id]
│   │   ├── Overview
│   │   ├── Conversations
│   │   ├── Analytics
│   │   └── Settings
│   │
│   ├── /agents/[id]/builder
│   │   ├── Visual workflow
│   │   ├── Prompt editor
│   │   ├── Tools config
│   │   ├── Knowledge base
│   │   └── Testing
│   │
│   ├── /agents/[id]/versions
│   │   ├── Version history
│   │   ├── Compare
│   │   └── Rollback
│   │
│   └── /agents/[id]/deploy
│       ├── Channels
│       └── Environment
│
├── 💬 Conversations
│   ├── /conversations
│   │   ├── Todas las conversaciones
│   │   ├── Filtros avanzados
│   │   └── Live monitor
│   │
│   └── /conversations/[id]
│       ├── Thread completo
│       ├── Customer info
│       ├── Actions
│       └── Notes
│
├── 📊 Analytics
│   ├── /analytics
│   │   ├── Executive dashboard
│   │   ├── Agent performance
│   │   ├── Usage metrics
│   │   ├── Cost analysis
│   │   └── Custom reports
│   │
│   └── /analytics/reports
│       ├── Scheduled reports
│       └── Report builder
│
├── 🔧 Tools & Integrations
│   ├── /tools
│   │   ├── Tool library
│   │   ├── Custom tools
│   │   └── API connections
│   │
│   ├── /integrations
│   │   ├── CRM (Salesforce, HubSpot)
│   │   ├── ERP (SAP, Oracle)
│   │   ├── Communication (Slack, Teams)
│   │   ├── Database
│   │   └── Custom webhooks
│   │
│   └── /integrations/marketplace
│       └── Third-party apps
│
├── 👥 Team & Users
│   ├── /team
│   │   ├── Members list
│   │   ├── Roles & permissions
│   │   └── Activity log
│   │
│   ├── /team/invites
│   │   └── Pending invitations
│   │
│   └── /team/groups
│       └── Department groups
│
├── ⚙️ Settings
│   ├── /settings
│   │   ├── General
│   │   ├── Security
│   │   ├── Notifications
│   │   ├── Billing
│   │   └── API keys
│   │
│   ├── /settings/security
│   │   ├── SSO/SAML
│   │   ├── 2FA
│   │   ├── Audit logs
│   │   └── Session management
│   │
│   └── /settings/billing
│       ├── Usage
│       ├── Invoices
│       ├── Payment methods
│       └── Plans
│
└── ❓ Help
    ├── /help
    │   ├── Documentation
    │   ├── Tutorials
    │   ├── API reference
    │   └── Community
    │
    └── /support
        ├── Tickets
        ├── Chat
        └── Status page
```

### 3.2 Information Architecture - Mobile App

```
┌─────────────────────────────────────────────────────────────┐
│                    MOBILE APP STRUCTURE                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    HOME     │  │   AGENTS    │  │   CHAT      │         │
│  │  (Tab 1)    │  │  (Tab 2)    │  │  (Tab 3)    │         │
│  │             │  │             │  │             │         │
│  │ • Overview  │  │ • My agents │  │ • Active    │         │
│  │ • Quick     │  │ • Status    │  │   chats     │         │
│  │   actions   │  │ • Alerts    │  │ • History   │         │
│  │ • Alerts    │  │ • Approvals │  │ • Favorites │         │
│  │ • Recent    │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │  ANALYTICS  │  │   PROFILE   │                           │
│  │  (Tab 4)    │  │  (Tab 5)    │                           │
│  │             │  │             │                           │
│  │ • Dashboard │  │ • Settings  │                           │
│  │ • Reports   │  │ • Account   │                           │
│  │ • Metrics   │  │ • Help      │                           │
│  │ • Trends    │  │ • Logout    │                           │
│  └─────────────┘  └─────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. DESIGN SYSTEM FOUNDATION

### 4.1 Design Tokens

#### Colores - Paleta Principal

```css
/* Brand Colors */
--color-brand-50:  #EEF2FF;
--color-brand-100: #E0E7FF;
--color-brand-200: #C7D2FE;
--color-brand-300: #A5B4FC;
--color-brand-400: #818CF8;
--color-brand-500: #6366F1;  /* Primary */
--color-brand-600: #4F46E5;
--color-brand-700: #4338CA;
--color-brand-800: #3730A3;
--color-brand-900: #312E81;

/* Semantic Colors */
--color-success-50:  #ECFDF5;
--color-success-500: #10B981;
--color-success-600: #059669;
--color-success-700: #047857;

--color-warning-50:  #FFFBEB;
--color-warning-500: #F59E0B;
--color-warning-600: #D97706;
--color-warning-700: #B45309;

--color-error-50:  #FEF2F2;
--color-error-500: #EF4444;
--color-error-600: #DC2626;
--color-error-700: #B91C1C;

--color-info-50:  #EFF6FF;
--color-info-500: #3B82F6;
--color-info-600: #2563EB;
--color-info-700: #1D4ED8;

/* Neutral Colors - Light Mode */
--color-gray-0:   #FFFFFF;
--color-gray-50:  #F9FAFB;
--color-gray-100: #F3F4F6;
--color-gray-200: #E5E7EB;
--color-gray-300: #D1D5DB;
--color-gray-400: #9CA3AF;
--color-gray-500: #6B7280;
--color-gray-600: #4B5563;
--color-gray-700: #374151;
--color-gray-800: #1F2937;
--color-gray-900: #111827;

/* Dark Mode Overrides */
--dark-bg-primary:   #0F172A;
--dark-bg-secondary: #1E293B;
--dark-bg-tertiary:  #334155;
--dark-text-primary: #F8FAFC;
--dark-text-secondary: #94A3B8;
```

#### Tipografía

```css
/* Font Family */
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Font Sizes */
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */
--text-4xl:  2.25rem;   /* 36px */

/* Font Weights */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* Line Heights */
--leading-tight:  1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.625;

/* Letter Spacing */
--tracking-tight:  -0.025em;
--tracking-normal: 0;
--tracking-wide:   0.025em;
```

#### Spacing Scale

```css
--space-0:  0;
--space-1:  0.25rem;   /* 4px */
--space-2:  0.5rem;    /* 8px */
--space-3:  0.75rem;   /* 12px */
--space-4:  1rem;      /* 16px */
--space-5:  1.25rem;   /* 20px */
--space-6:  1.5rem;    /* 24px */
--space-8:  2rem;      /* 32px */
--space-10: 2.5rem;    /* 40px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */
--space-20: 5rem;      /* 80px */
--space-24: 6rem;      /* 96px */
```

#### Border Radius

```css
--radius-none: 0;
--radius-sm:   0.25rem;  /* 4px */
--radius-md:   0.375rem; /* 6px */
--radius-lg:   0.5rem;   /* 8px */
--radius-xl:   0.75rem;  /* 12px */
--radius-2xl:  1rem;     /* 16px */
--radius-full: 9999px;
```

#### Shadows

```css
/* Light Mode */
--shadow-sm:   0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-md:   0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg:   0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-xl:   0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);

/* Dark Mode - Subtler shadows */
--shadow-dark-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.3);
--shadow-dark-md:  0 4px 6px -1px rgba(0, 0, 0, 0.4);
--shadow-dark-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.4);
```

### 4.2 Component Library - Key Components

#### Buttons

```
┌─────────────────────────────────────────────────────────────────┐
│                         BUTTONS                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRIMARY                    SECONDARY                   GHOST   │
│  ┌─────────────────┐       ┌─────────────────┐       ┌────────┐ │
│  │  Crear Agente   │       │  Cancelar       │       │  Editar │ │
│  └─────────────────┘       └─────────────────┘       └────────┘ │
│  bg: brand-600             bg: white                bg: transparent│
│  text: white               border: gray-300         text: gray-700│
│  hover: brand-700          hover: gray-50           hover: gray-100│
│                                                                  │
│  SIZES:                                                          │
│  ┌────┐ ┌────────┐ ┌────────────┐                               │
│  │ SM │ │  BASE  │ │     LG     │                               │
│  └────┘ └────────┘ └────────────┘                               │
│  h: 32px  h: 40px    h: 48px                                    │
│                                                                  │
│  STATES:                                                         │
│  [Normal] → [Hover] → [Active] → [Loading] → [Disabled]         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Cards

```
┌─────────────────────────────────────────────────────────────────┐
│                         CARDS                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  AGENT CARD                                              │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  ┌────┐  Agente de Ventas                    [⋯]        │    │
│  │  [🤖]  ━━━━━━━━━━━━━━━━━━━━━━                           │    │
│  │  └────┘  ● Activo    Último: 2m ago                    │    │
│  │                                                          │    │
│  │  📊 Métricas:                                            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │    │
│  │  │ 1,234    │ │ 98.5%    │ │ $45.2K   │                 │    │
│  │  │ Convers. │ │ Satisf.  │ │ Revenue  │                 │    │
│  │  └──────────┘ └──────────┘ └──────────┘                 │    │
│  │                                                          │    │
│  │  [Ver Detalles]            [Editar] [Desactivar]        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  VARIANTS: Default | Hover | Selected | Disabled                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Form Inputs

```
┌─────────────────────────────────────────────────────────────────┐
│                      FORM INPUTS                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TEXT INPUT                                                      │
│  ┌─────────────────────────────────────────┐                     │
│  │ Nombre del Agente *                     │                     │
│  │ ┌─────────────────────────────────────┐ │                     │
│  │ │ Agente de Ventas Colombia          │ │                     │
│  │ └─────────────────────────────────────┘ │                     │
│  │ ✓ Válido                                │                     │
│  └─────────────────────────────────────────┘                     │
│                                                                  │
│  SELECT/DROPDOWN                                                 │
│  ┌─────────────────────────────────────────┐                     │
│  │ Modelo de IA                            │                     │
│  │ ┌─────────────────────────────────────┐ │                     │
│  │ │ GPT-4 Turbo                    [▼] │ │                     │
│  │ └─────────────────────────────────────┘ │                     │
│  └─────────────────────────────────────────┘                     │
│                                                                  │
│  TOGGLE/SWITCH                                                   │
│  ┌─────────────────────────────────────────┐                     │
│  │ Modo Debug                              │                     │
│  │     ┌──────┐                            │                     │
│  │     │  ●   │  ON                        │                     │
│  │     └──────┘                            │                     │
│  └─────────────────────────────────────────┘                     │
│                                                                  │
│  STATES: Default | Focus | Error | Disabled | Loading            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Data Table

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA TABLE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [🔍 Buscar...]    [Filtros ▼]    [Exportar ▼]  [+ Nuevo]│    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ □ │ Agente      │ Status │ Convers. │ Satisf. │ Actions │    │
│  │───┼─────────────┼────────┼──────────┼─────────┼─────────│    │
│  │ □ │ Ventas CO   │   🟢   │   1,234  │  98.5%  │ [⋯]     │    │
│  │ □ │ Soporte MX  │   🟢   │   5,678  │  96.2%  │ [⋯]     │    │
│  │ □ │ Marketing   │   🟡   │     432  │  94.1%  │ [⋯]     │    │
│  │ □ │ Onboarding  │   🔴   │      89  │  91.0%  │ [⋯]     │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ Mostrando 1-4 de 12    [<] 1 2 3 ... 12 [>]            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  FEATURES: Sort | Filter | Search | Pagination | Bulk actions   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Status Badges

```
┌─────────────────────────────────────────────────────────────────┐
│                       STATUS BADGES                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AGENT STATUS:                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  🟢 Act │ │  🟡 Paus│ │  🔴 Off │ │  🔵 Dep │ │  ⚪ Draf│   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                  │
│  PRIORITY:                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                            │
│  │  🔴 Alt │ │  🟡 Med │ │  🟢 Baja│                            │
│  └─────────┘ └─────────┘ └─────────┘                            │
│                                                                  │
│  PAYMENT:                                                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │  🟢 Pag │ │  🟡 Pen │ │  🔴 Ven │ │  🔵 Ref │               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Dark Mode Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│                     DARK MODE THEME                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  🌙 MODO OSCURO                                          │    │
│  │  bg: #0F172A                                            │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                          │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  CARD                                           │    │    │
│  │  │  bg: #1E293B                                    │    │    │
│  │  │  border: #334155                                │    │    │
│  │  │                                                 │    │    │
│  │  │  Título                    [Button: brand-500] │    │    │
│  │  │  text: #F8FAFC              bg: #6366F1        │    │    │
│  │  │                                                 │    │    │
│  │  │  Descripción                                    │    │    │
│  │  │  text: #94A3B8                                  │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  │  INPUT:                                                  │    │
│  │  ┌─────────────────────────────────────────┐             │    │
│  │  │ bg: #0F172A  border: #334155            │             │    │
│  │  │ text: #F8FAFC  placeholder: #64748B     │             │    │
│  │  └─────────────────────────────────────────┘             │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  CONTRAST RATIOS (WCAG AA):                                      │
│  • Primary text: 7:1 ✓                                          │
│  • Secondary text: 4.5:1 ✓                                      │
│  • Interactive elements: 3:1 ✓                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Responsive Breakpoints

```css
/* Mobile First Approach */
--breakpoint-sm: 640px;   /* Large phones */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Small laptops */
--breakpoint-xl: 1280px;  /* Desktops */
--breakpoint-2xl: 1536px; /* Large screens */

/* Container Max Widths */
--container-sm: 640px;
--container-md: 768px;
--container-lg: 1024px;
--container-xl: 1280px;
```

---

## 5. WIREFRAMES - PANTALLAS CLAVE

### 5.1 Dashboard Principal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOGO    Dashboard  Agents  Analytics  Tools  Team    [🔍] [🛎️] [👤] [⚙️]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Buenos días, Ana 👋                    [+ Crear Agente] [📊 Ver más]│   │
│  │  Tienes 3 agentes activos y 12 conversaciones hoy                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │ 1,234      │ │ 98.5%      │ │ $45.2K     │ │ 2m 34s     │               │
│  │ Convers.   │ │ Satisf.    │ │ Revenue    │ │ Avg Resp   │               │
│  │ ↑ 12%      │ │ ↑ 2.3%     │ │ ↑ 8.5%     │ │ ↓ 15s      │               │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  AGENTES ACTIVOS            │  │  ACTIVIDAD RECIENTE                 │  │
│  │                             │  │                                     │  │
│  │  ┌────┐ Ventas CO    🟢 ●   │  │  🟢 Ventas CO respondió a Juan P.   │  │
│  │  [🤖]  234 convers. hoy    │  │     hace 2 minutos                  │  │
│  │        [Ver] [Editar]      │  │                                     │  │
│  │  ─────────────────────────  │  │  🟡 Soporte MX escaló caso #1234    │  │
│  │  ┌────┐ Soporte MX   🟢 ●   │  │     hace 5 minutos                  │  │
│  │  [🤖]  567 convers. hoy    │  │                                     │  │
│  │        [Ver] [Editar]      │  │  🔴 Onboarding falló 3 veces        │  │
│  │  ─────────────────────────  │  │     hace 12 minutos                 │  │
│  │  ┌────┐ Marketing    🟡 ●   │  │                                     │  │
│  │  [🤖]  89 convers. hoy     │  │  [Ver todo]                         │  │
│  │        [Ver] [Editar]      │  │                                     │  │
│  │                             │  └─────────────────────────────────────┘  │
│  │  [Ver todos los agentes]   │                                           │
│  └─────────────────────────────┘                                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  RENDIMIENTO POR CANAL                                              │   │
│  │                                                                     │   │
│  │  WhatsApp  ████████████████████████████████████████  65% (8,012)   │   │
│  │  Telegram  ████████████████████████                  25% (3,081)   │   │
│  │  Web Chat  ██████████                                10% (1,232)   │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Agent Builder - Visual Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOGO    Dashboard  Agents  Analytics  Tools  Team    [🔍] [🛎️] [👤] [⚙️]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ← Volver a Agentes                                                         │
│  Agente de Ventas Colombia                              [Guardar] [Deploy]  │
│  Última edición: hace 5 minutos                                             │
│                                                                             │
│  ┌────┬─────┬────────┬─────────┬──────────┬─────────┬───────────────────┐  │
│  │Builder│Prompt│ Tools │Knowledge│ Testing │Versions│ Settings          │  │
│  └────┴─────┴────────┴─────────┴──────────┴─────────┴───────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         VISUAL WORKFLOW BUILDER                        │ │
│  │                                                                        │ │
│  │   ┌──────────┐                                                        │ │
│  │   │  START   │  ← Usuario inicia conversación                         │ │
│  │   │   🟢     │                                                        │ │
│  │   └────┬─────┘                                                        │ │
│  │        │                                                              │ │
│  │        ▼                                                              │ │
│  │   ┌──────────┐     ┌──────────┐                                       │ │
│  │   │ GREETING │────→│ IDENTIFY │  ← Detectar intención                 │ │
│  │   │   👋     │     │   🎯     │                                       │ │
│  │   └──────────┘     └────┬─────┘                                       │ │
│  │                         │                                             │ │
│  │           ┌─────────────┼─────────────┐                               │ │
│  │           │             │             │                               │ │
│  │           ▼             ▼             ▼                               │ │
│  │      ┌────────┐   ┌────────┐   ┌────────┐                            │ │
│  │      │CONSULTA│   │ COMPRA │   │ QUEJA  │                            │ │
│  │      │   ❓   │   │   🛒   │   │   😤   │                            │ │
│  │      └────┬───┘   └───┬────┘   └───┬────┘                            │ │
│  │           │           │            │                                  │ │
│  │           ▼           ▼            ▼                                  │ │
│  │      ┌────────┐   ┌────────┐   ┌────────┐                            │ │
│  │      │ANSWER  │   │PROCESS │   │ESCALATE│                            │ │
│  │      │  💬    │   │  💳    │   │  👤    │                            │ │
│  │      └────────┘   └────────┘   └────────┘                            │ │
│  │                                                                        │ │
│  │  [+ Añadir nodo]  [🔄 Auto-layout]  [🔍 Zoom]  [💾 Export]            │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ SIDEBAR: NODE PALETTE                                                  │ │
│  │ ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │ │ 🔍 Search nodes...                                              │   │ │
│  │ ├─────────────────────────────────────────────────────────────────┤   │ │
│  │ │ TRIGGERS                    [▼]                                 │   │ │
│  │ │   • New Message           • Scheduled                           │   │ │
│  │ │   • Webhook               • API Call                            │   │ │
│  │ ├─────────────────────────────────────────────────────────────────┤   │ │
│  │ │ ACTIONS                     [▼]                                 │   │ │
│  │ │   • Send Message          • Ask Question                        │   │ │
│  │ │   • Set Variable          • HTTP Request                        │   │ │
│  │ │   • Transfer to Human     • Send Email                          │   │ │
│  │ ├─────────────────────────────────────────────────────────────────┤   │ │
│  │ │ AI & LOGIC                  [▼]                                 │   │ │
│  │ │   • AI Response           • Condition                           │   │ │
│  │ │   • Classify Intent       • Loop                                │   │ │
│  │ └─────────────────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Prompt Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOGO    Dashboard  Agents  Analytics  Tools  Team    [🔍] [🛎️] [👤] [⚙️]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ← Volver a Builder                                                         │
│  Prompt Editor                                          [Guardar] [Test]    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  CONFIGURACIÓN DEL MODELO                                              │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │ │
│  │  │ Modelo:          │  │ Temperature:     │  │ Max Tokens:      │    │ │
│  │  │ [GPT-4 Turbo ▼]  │  │ [0.7        ]    │  │ [2000       ]    │    │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  SYSTEM PROMPT                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Eres un asistente de ventas experto para una empresa de         │  │ │
│  │  │ tecnología en Colombia. Tu objetivo es ayudar a los clientes    │  │ │
│  │  │ a encontrar la solución perfecta para sus necesidades.          │  │ │
│  │  │                                                                   │  │ │
│  │  │ REGLAS:                                                           │  │ │
│  │  │ 1. Siempre saluda cordialmente y pregunta el nombre             │  │ │
│  │  │ 2. Identifica la necesidad antes de recomendar productos        │  │ │
│  │  │ 3. Si el cliente quiere comprar, guíalo por el proceso          │  │ │
│  │  │ 4. Si hay una queja, escala inmediatamente a un humano          │  │ │
│  │  │ 5. Nunca inventes información sobre productos                   │  │ │
│  │  │                                                                   │  │ │
│  │  │ TONO: Profesional pero cercano, usa emojis ocasionalmente       │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │  [Variables ▼] [Templates ▼] [Insert Tool ▼]                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  FEW-SHOT EXAMPLES                                                     │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ USER: Hola, quiero información sobre sus productos              │  │ │
│  │  │ ASSISTANT: ¡Hola! 👋 Bienvenido. Mi nombre es Asistente Virtual │  │ │
│  │  │ y estoy aquí para ayudarte. Para darte la mejor recomendación,  │  │ │
│  │  │ ¿podrías contarme un poco sobre tu negocio y qué tipo de        │  │ │
│  │  │ solución estás buscando?                                        │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │  [+ Añadir ejemplo]                                                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TESTING PANEL                              [▶ Run Test]              │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ 🧪 Input de prueba:                                             │  │ │
│  │  │ "Hola, estoy buscando un CRM para mi empresa de 10 personas"   │  │ │
│  │  │                                                                 │  │ │
│  │  │ 🤖 Respuesta generada:                                          │  │ │
│  │  │ "¡Hola! 👋 Qué gusto saludarte. Entiendo que buscas un CRM      │  │ │
│  │  │ para tu equipo de 10 personas. Para ayudarte mejor, ¿me podrías │  │ │
│  │  │ contar qué características son más importantes para ustedes?    │  │ │
│  │  │ Por ejemplo: gestión de contactos, automatización de ventas,    │  │ │
│  │  │ reportes, etc."                                                 │  │ │
│  │  │                                                                 │  │ │
│  │  │ ✅ Test passed - 1.2s - 145 tokens                              │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Analytics Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOGO    Dashboard  Agents  Analytics  Tools  Team    [🔍] [🛎️] [👤] [⚙️]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Analytics                                              [Export] [Schedule] │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │ │
│  │  │ Últimos 7 días│  │ Agente: Todos │  │ Canal: Todos │  │ [Aplicar]│ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  KPI CARDS                                                             │ │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │ │
│  │  │ 12,345     │ │ 98.2%      │ │ $127.5K    │ │ $2.45      │          │ │
│  │  │ Total Conv │ │ CSAT Score │ │ Revenue    │ │ Cost/Conv  │          │ │
│  │  │ ↑ 23%      │ │ ↑ 1.2%     │ │ ↑ 15%      │ │ ↓ 8%       │          │ │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────┐  ┌─────────────────────────────┐  │
│  │  CONVERSACIONES POR DÍA              │  │  DISTRIBUCIÓN POR CANAL     │  │
│  │                                      │  │                             │  │
│  │  1400 │         ╱╲                   │  │      ┌─────────┐            │  │
│  │  1200 │    ╱╲  ╱  ╲  ╱╲             │  │      │  WHATS  │ 65%        │  │
│  │  1000 │   ╱  ╲╱    ╲╱  ╲            │  │      │  █████  │            │  │
│  │   800 │  ╱                    ╱╲    │  │      ├─────────┤            │  │
│  │   600 │ ╱                    ╱  ╲   │  │      │  TELE   │ 25%        │  │
│  │   400 │╱                    ╱    ╲  │  │      │  ██     │            │  │
│  │   200 │                            ╲│  │      ├─────────┤            │  │
│  │     0 └─────────────────────────────│  │      │  WEB    │ 10%        │  │
│  │       L M M J V S D L M M J V       │  │      │  █      │            │  │
│  │                                      │  │      └─────────┘            │  │
│  └─────────────────────────────────────┘  └─────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  PERFORMANCE POR AGENTE                                                │ │
│  │  ┌─────────────┬──────────┬──────────┬──────────┬──────────┬─────────┐ │ │
│  │  │ Agente      │ Convers. │ Avg Time │ CSAT     │ Revenue  │ Status  │ │ │
│  │  ├─────────────┼──────────┼──────────┼──────────┼──────────┼─────────┤ │ │
│  │  │ Ventas CO   │ 5,234    │ 2m 15s   │ 98.5%    │ $67.2K   │ 🟢      │ │ │
│  │  │ Soporte MX  │ 4,123    │ 3m 45s   │ 96.2%    │ $12.1K   │ 🟢      │ │ │
│  │  │ Marketing   │ 2,089    │ 1m 30s   │ 94.1%    │ $45.3K   │ 🟡      │ │ │
│  │  │ Onboarding  │ 899      │ 5m 20s   │ 91.0%    │ $2.9K    │ 🔴      │ │ │
│  │  └─────────────┴──────────┴──────────┴──────────┴──────────┴─────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  COST ANALYSIS                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Costo Total: $3,245.67                    Token Usage: 2.1M      │  │ │
│  │  │                                                                   │  │ │
│  │  │ Input Tokens:  ████████████████████████  1.4M  ($1,456.00)      │  │ │
│  │  │ Output Tokens: ██████████████            0.7M  ($1,789.67)      │  │ │
│  │  │                                                                   │  │ │
│  │  │ Modelo breakdown: GPT-4: 60% | GPT-3.5: 35% | Claude: 5%        │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 User Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOGO    Dashboard  Agents  Analytics  Tools  Team    [🔍] [🛎️] [👤] [⚙️]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Team Management                                        [+ Invitar usuario] │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  [🔍 Buscar usuarios...]    [Rol: Todos ▼]    [Estado: Todos ▼]      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  ┌──────────┬────────────────┬──────────────┬──────────┬───────────┐  │ │
│  │  │ Usuario  │ Email          │ Rol          │ Estado   │ Acciones  │  │ │
│  │  ├──────────┼────────────────┼──────────────┼──────────┼───────────┤  │ │
│  │  │ [👤]     │ carlos@empresa │ Admin        │ 🟢 Activo│ [✏️] [🗑️] │  │ │
│  │  │ Carlos M.│ .com           │              │          │           │  │ │
│  │  ├──────────┼────────────────┼──────────────┼──────────┼───────────┤  │ │
│  │  │ [👤]     │ ana@empresa.com│ Agent Builder│ 🟢 Activo│ [✏️] [🗑️] │  │ │
│  │  │ Ana G.   │                │              │          │           │  │ │
│  │  ├──────────┼────────────────┼──────────────┼──────────┼───────────┤  │ │
│  │  │ [👤]     │ luis@empresa.co│ Business User│ 🟡 Inact.│ [✏️] [🗑️] │  │ │
│  │  │ Luis H.  │ m              │              │ 7 días   │           │  │ │
│  │  ├──────────┼────────────────┼──────────────┼──────────┼───────────┤  │ │
│  │  │ [👤]     │ mariana@empres │ Analyst      │ 🟢 Activo│ [✏️] [🗑️] │  │ │
│  │  │ Mariana S│ a.com          │              │          │           │  │ │
│  │  ├──────────┼────────────────┼──────────────┼──────────┼───────────┤  │ │
│  │  │ [👤]     │ pedro@empresa. │ Business User│ 🔴 Pend. │ [📧] [❌] │  │ │
│  │  │ (Pend.)  │ com            │              │ Invitac. │           │  │ │
│  │  └──────────┴────────────────┴──────────────┴──────────┴───────────┘  │ │
│  │                                                                        │ │
│  │  Mostrando 1-5 de 12 usuarios        [<] 1 2 3 [>]                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  ROLES Y PERMISOS                                                      │ │
│  │  ┌───────────────┬─────────────┬─────────────────────────────────────┐ │ │
│  │  │ Rol           │ Usuarios    │ Permisos principales                │ │ │
│  │  ├───────────────┼─────────────┼─────────────────────────────────────┤ │ │
│  │  │ Admin         │ 2           │ Full access, Billing, Security      │ │ │
│  │  │ Agent Builder │ 3           │ Create agents, Tools, Testing       │ │ │
│  │  │ Business User │ 15          │ Use agents, View own data           │ │ │
│  │  │ Analyst       │ 2           │ View all analytics, Reports         │ │ │
│  │  └───────────────┴─────────────┴─────────────────────────────────────┘ │ │
│  │  [+ Crear rol personalizado]                                           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.6 Mobile App - Home Screen

```
┌─────────────────────────────┐
│  9:41              🔋 100%  │
├─────────────────────────────┤
│                             │
│  Buenos días,               │
│  Ana 👋                     │
│                             │
│  ┌─────────────────────────┐│
│  │ 3 agentes activos       ││
│  │ 12 conversaciones hoy   ││
│  │                         ││
│  │ [Ver dashboard →]       ││
│  └─────────────────────────┘│
│                             │
│  ACCESOS RÁPIDOS            │
│  ┌────────┐ ┌────────┐      │
│  │  🤖    │ │  💬    │      │
│  │ Agentes│ │  Chat  │      │
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │  📊    │ │  ⚡    │      │
│  │Análisis│ │Acciones│      │
│  └────────┘ └────────┘      │
│                             │
│  TUS AGENTES                │
│  ┌─────────────────────────┐│
│  │ 🤖 Ventas CO      🟢 ●  ││
│  │    234 conversaciones   ││
│  ├─────────────────────────┤│
│  │ 🤖 Soporte MX     🟢 ●  ││
│  │    567 conversaciones   ││
│  ├─────────────────────────┤│
│  │ 🤖 Marketing      🟡 ●  ││
│  │    89 conversaciones    ││
│  └─────────────────────────┘│
│                             │
│  ACTIVIDAD RECIENTE         │
│  ┌─────────────────────────┐│
│  │ 🟢 Ventas CO respondió  ││
│  │    a Juan P. - 2m       ││
│  ├─────────────────────────┤│
│  │ 🟡 Soporte MX escaló    ││
│  │    caso #1234 - 5m      ││
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │  🏠  │  🤖  │  💬  │ 👤  ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

### 5.7 Mobile App - Chat Interface

```
┌─────────────────────────────┐
│  ← Ventas CO           [⋯]  │
├─────────────────────────────┤
│                             │
│  ┌─────────────────────────┐│
│  │ 🤖 Agente activo        ││
│  │ Tiempo respuesta: < 1m  ││
│  └─────────────────────────┘│
│                             │
│         15 de enero         │
│                             │
│  ┌──────────┐               │
│  │Hola! 👋  │               │
│  │¿En qué  │               │
│  │puedo    │               │
│  │ayudarte?│               │
│  └──────────┘               │
│        🤖                   │
│                             │
│               ┌──────────┐  │
│               │Hola,     │  │
│               │quiero    │  │
│               │info sobre│  │
│               │sus       │  │
│               │productos │  │
│               └──────────┘  │
│                      👤     │
│                             │
│  ┌──────────────────────┐   │
│  │¡Claro! 😊 Para      │   │
│  │darte la mejor       │   │
│  │recomendación,       │   │
│  │¿me cuentas un poco  │   │
│  │sobre tu negocio?    │   │
│  └──────────────────────┘   │
│        🤖                   │
│                             │
│  ┌────────┐ ┌────────┐      │
│  │Soy     │ │Tengo   │      │
│  │startup │ │pyme    │      │
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │Empresa │ │Solo    │      │
│  │grande  │ │quiero  │      │
│  │        │ │info    │      │
│  └────────┘ └────────┘      │
│                             │
│  ┌─────────────────────────┐│
│  │ [🎤] Escribe mensaje... ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

---

## 6. FLUJOS DE USUARIO PRINCIPALES

### 6.1 Onboarding de Empresa

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO: ONBOARDING DE EMPRESA                            │
└─────────────────────────────────────────────────────────────────────────────┘

[Página Landing] 
      │
      ▼
[Signup - Email/Password o SSO] 
      │
      ▼
[Verificación Email] ──► (Email no verificado) ──► [Reenviar email]
      │
      ▼
[Welcome Screen] 
      │ "¡Bienvenido a ControlIA! Vamos a configurar tu cuenta"
      ▼
[Company Info Form]
      │ • Nombre empresa
      │ • Industria (dropdown)
      │ • Tamaño empresa
      │ • País/Región
      ▼
[Select Use Case]
      │ ¿Qué quieres lograr con ControlIA?
      │ ○ Automatizar ventas
      │ ○ Mejorar soporte
      │ ○ Generar leads
      │ ○ Onboarding clientes
      │ ○ Otro
      ▼
[Invite Team Members] (opcional)
      │ [Skip] ─────────────────────────┐
      │ [+ Añadir emails]               │
      ▼                                 │
[Connect Channels]                    │
      │ • WhatsApp Business API        │
      │ • Telegram Bot                 │
      │ • Web Chat                     │
      │ [Skip for now]                 │
      ▼                                 │
[Create First Agent - Wizard] ◄───────┘
      │
      ├──► [Template Selection]
      │         │
      │         ├──► Ventas
      │         ├──► Soporte
      │         ├──► Marketing
      │         └──► Desde cero
      │
      ▼
[Customize Agent]
      │ • Nombre del agente
      │ • Personalidad/Tono
      │ • Conocimiento base
      ▼
[Test Agent]
      │ [Probar conversación]
      │
      ├──► [No funciona bien] ──► [Editar] ──► [Test again]
      │
      ▼
[Deploy Agent]
      │
      ├──► WhatsApp
      ├──► Telegram
      ├──► Web
      └──► Todos
      ▼
[Dashboard Principal]
      │ "¡Tu agente está vivo! 🎉"
      │
      ├──► [Ver tutorial]
      ├──► [Invitar más usuarios]
      └──► [Explorar analytics]
      ▼
[Onboarding Complete ✓]

TIEMPO ESTIMADO: 10-15 minutos
CONVERSION TARGET: 70% complete onboarding
```

### 6.2 Creación de Agente

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO: CREACIÓN DE AGENTE                               │
└─────────────────────────────────────────────────────────────────────────────┘

[Dashboard] ──► [+ Crear Agente]
                    │
                    ▼
            ┌───────────────┐
            │  START POINT  │
            └───────┬───────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   [Template]  [Import]    [Blank]
   Gallery     Agent       Canvas
        │         │           │
        └─────────┴───────────┘
                    │
                    ▼
            [Agent Config]
            │
            ├──► Basic Info
            │    • Nombre
            │    • Descripción
            │    • Avatar
            │
            ├──► Personality
            │    • Tono (slider: Formal ↔ Casual)
            │    • Proactividad
            │    • Emoji usage
            │
            ├──► Knowledge Base
            │    • Upload documents
            │    • Connect URLs
            │    • Manual entry
            │
            └──► Tools & Integrations
                 • CRM connection
                 • Calendar
                 • Payment
                 • Custom API
                 ▼
            [Builder Mode Selection]
                 │
        ┌────────┴────────┐
        ▼                 ▼
   [Visual Flow]     [Prompt Only]
   Builder           (Simple)
        │                 │
        │                 ▼
        │            [Prompt Editor]
        │            • System prompt
        │            • Few-shot examples
        │            • Variables
        │
        ▼
   [Visual Workflow]
   • Drag & drop nodes
   • Connect flows
   • Add conditions
   • Configure actions
        │
        ▼
   [Test & Validate]
   │
   ├──► [Run Tests]
   │    • Test cases
   │    • Edge cases
   │    • Load test
   │
   ├──► [Issues Found] ──► [Debug] ──► [Fix] ──┐
   │                                            │
   ▼                                            │
   [All Tests Pass] ◄───────────────────────────┘
        │
        ▼
   [Version Control]
   │ • Save version
   │ • Add changelog
   │ • Tag release
   │
        ▼
   [Deploy]
   │
   ├──► Environment
   │    ○ Development
   │    ○ Staging
   │    ● Production
   │
   ├──► Channels
   │    ☑ WhatsApp
   │    ☑ Telegram
   │    ☐ Web Chat
   │    ☐ Slack
   │
   └──► [Deploy Now]
        ▼
   [Agent Live! 🎉]
   │
   ├──► [View Dashboard]
   ├──► [Monitor Conversations]
   └──► [Share with team]
```

### 6.3 Configuración de Integraciones

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO: CONFIGURACIÓN DE INTEGRACIONES                   │
└─────────────────────────────────────────────────────────────────────────────┘

[Settings] ──► [Integrations]
                  │
                  ▼
         ┌─────────────────┐
         │  INTEGRATION    │
         │   MARKETPLACE   │
         ├─────────────────┤
         │                 │
         │ 🔍 Search...    │
         │                 │
         │ CATEGORIAS:     │
         │ ─────────────── │
         │ 📊 CRM          │
         │ 💰 ERP          │
         │ 💬 Messaging    │
         │ 📅 Calendar     │
         │ 💳 Payments     │
         │ 🗄️ Database     │
         │ 🔧 Custom       │
         │                 │
         └─────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    [CRM]    [Messaging] [Custom]
        │         │         │
        ▼         ▼         ▼
   [Select    [Select    [Webhook
    Provider]  Channel]   Config]
        │         │         │
        ▼         ▼         ▼
   ┌─────────────────────────────────────────────────────────┐
   │  CONFIGURATION FLOW                                      │
   │                                                          │
   │  1. AUTHENTICATION                                       │
   │     ┌─────────────────────────────────────────┐          │
   │     │ • OAuth (recommended)                   │          │
   │     │ • API Key                               │          │
   │     │ • Username/Password                     │          │
   │     │                                         │          │
   │     │ [Connect to Salesforce]                 │          │
   │     │                                         │          │
   │     │ 🔐 Secure connection via OAuth 2.0      │          │
   │     └─────────────────────────────────────────┘          │
   │                          │                               │
   │                          ▼                               │
   │  2. PERMISSIONS & SCOPES                                 │
   │     ┌─────────────────────────────────────────┐          │
   │     │ Select permissions needed:              │          │
   │     │ ☑ Read contacts                         │          │
   │     │ ☑ Create contacts                       │          │
   │     │ ☑ Update contacts                       │          │
   │     │ ☐ Delete contacts                       │          │
   │     │ ☑ Read opportunities                    │          │
   │     │ ☑ Create opportunities                  │          │
   │     └─────────────────────────────────────────┘          │
   │                          │                               │
   │                          ▼                               │
   │  3. MAPPING & CONFIGURATION                              │
   │     ┌─────────────────────────────────────────┐          │
   │     │ Field Mapping:                          │          │
   │     │                                         │          │
   │     │ ControlIA Field → Salesforce Field      │          │
   │     │ ─────────────────────────────────       │          │
   │     │ customer_name → Name                    │          │
   │     │ customer_email → Email                  │          │
   │     │ phone → Phone                           │          │
   │     │ company → Account.Name                  │          │
   │     │                                         │          │
   │     │ [+ Add custom mapping]                  │          │
   │     │                                         │          │
   │     │ Sync Settings:                          │          │
   │     │ ○ Real-time  ● Hourly  ○ Daily          │          │
   │     └─────────────────────────────────────────┘          │
   │                          │                               │
   │                          ▼                               │
   │  4. TEST CONNECTION                                        │
   │     ┌─────────────────────────────────────────┐          │
   │     │ 🧪 Testing connection...                │          │
   │     │                                         │          │
   │     │ ✅ Connection successful!               │          │
   │     │    • 1,234 contacts synced              │          │
   │     │    • Webhook configured                 │          │
   │     │                                         │          │
   │     │ [Test with sample data]                 │          │
   │     └─────────────────────────────────────────┘          │
   │                          │                               │
   │                          ▼                               │
   │  5. ACTIVATE                                             │
   │     ┌─────────────────────────────────────────┐          │
   │     │ [✓ Activate Integration]                │          │
   │     │                                         │          │
   │     │ Integration active on:                  │          │
   │     │ ☑ Ventas CO                             │          │
   │     │ ☑ Soporte MX                            │          │
   │     │ ☐ Marketing                             │          │
   │     └─────────────────────────────────────────┘          │
   │                                                          │
   └─────────────────────────────────────────────────────────┘
```

### 6.4 Monitoring y Debugging

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO: MONITORING Y DEBUGGING                           │
└─────────────────────────────────────────────────────────────────────────────┘

[Agent Dashboard]
        │
        ├──► [Overview] ──► Métricas en tiempo real
        │
        ├──► [Conversations]
        │         │
        │         ▼
        │    ┌─────────────────────────────────────────┐
        │    │ FILTERS:                                │
        │    │ [Status: All ▼] [Channel: All ▼]      │
        │    │ [Date: Today ▼] [Agent: All ▼]        │
        │    │                                         │
        │    │ CONVERSATION LIST:                      │
        │    │ ─────────────────────────────────────   │
        │    │ 🟢 #12345 - Juan P. - Ventas CO - 2m    │
        │    │ 🟡 #12344 - María G. - Soporte MX - 5m  │
        │    │ 🔴 #12343 - Carlos R. - Ventas CO - 1h  │
        │    │    ⚠️ 3 intentos fallidos               │
        │    │                                         │
        │    │ [View] [Join] [Transfer] [Close]        │
        │    └─────────────────────────────────────────┘
        │
        ├──► [Live Monitor]
        │         │
        │         ▼
        │    ┌─────────────────────────────────────────┐
        │    │ REAL-TIME DASHBOARD                     │
        │    │                                         │
        │    │ Active Conversations: 23                │
        │    │ Avg Response Time: 1.2s                 │
        │    │ Queue Length: 3                         │
        │    │                                         │
        │    │ [Auto-refresh: ON] [Sound alerts: ON]   │
        │    │                                         │
        │    │ ALERTS:                                 │
        │    │ ⚠️ Agent "Soporte MX" - High load       │
        │    │ 🔴 2 conversations need attention       │
        │    └─────────────────────────────────────────┘
        │
        └──► [Logs & Debugging]
                  │
                  ▼
             ┌─────────────────────────────────────────┐
             │ DEBUGGING CONSOLE                        │
             │                                          │
             │ ┌─────────────────────────────────────┐ │
             │ │ 🔍 Search logs...                   │ │
             │ │ Level: [All ▼] Agent: [All ▼]       │ │
             │ └─────────────────────────────────────┘ │
             │                                          │
             │ LOG ENTRIES:                             │
             │ ─────────────────────────────────────    │
             │                                          │
             │ [ERROR] 14:32:15 - Ventas CO            │
             │  └─> Failed to call CRM API             │
             │      Status: 500                        │
             │      [View details] [Retry]             │
             │                                          │
             │ [WARN] 14:31:22 - Soporte MX            │
             │  └─> High confidence but no match       │
             │      Intent: "cancelar suscripción"     │
             │      [View conversation]                │
             │                                          │
             │ [INFO] 14:30:45 - Marketing             │
             │  └─> New conversation started           │
             │      User: +57 300 123 4567             │
             │                                          │
             │ [DEBUG] 14:30:44 - Ventas CO            │
             │  └─> Prompt tokens: 1,234               │
             │      Completion tokens: 456             │
             │      Latency: 1.2s                      │
             │                                          │
             │ [Export] [Clear] [Auto-scroll: ON]      │
             │                                          │
             └─────────────────────────────────────────┘
```

---

## 7. CONSIDERACIONES MOBILE Y RESPONSIVE

### 7.1 Mobile-First Approach

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RESPONSIVE BREAKPOINT STRATEGY                          │
└─────────────────────────────────────────────────────────────────────────────┘

BREAKPOINTS:
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  <640px │ 640px+  │ 768px+  │ 1024px+ │ 1280px+ │
│  Mobile │  Large  │ Tablet  │ Laptop  │ Desktop │
│         │  Phone  │         │         │         │
└────┬────┴────┬────┴────┬────┴────┬────┴────┬────┘
     │         │         │         │         │
     ▼         ▼         ▼         ▼         ▼
  ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐
  │ 📱  │   │ 📱  │   │ 📱💻│   │ 💻  │   │ 🖥️  │
  │     │   │     │   │     │   │     │   │     │
  │Stack│   │Stack│   │Split│   │Split│   │Split│
  │Nav  │   │Nav  │   │View │   │View │   │View │
  │     │   │     │   │     │   │     │   │     │
  │Bot- │   │Bot- │   │Side │   │Side │   │Side │
  │tom  │   │tom  │   │Nav  │   │Nav  │   │Nav  │
  │Tab  │   │Tab  │   │     │   │     │   │     │
  │Bar  │   │Bar  │   │     │   │     │   │     │
  └─────┘   └─────┘   └─────┘   └─────┘   └─────┘
```

### 7.2 Mobile Navigation Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MOBILE NAVIGATION PATTERNS                              │
└─────────────────────────────────────────────────────────────────────────────┘

PATTERN 1: BOTTOM TAB BAR (Primary)
┌─────────────────────────────┐
│                             │
│         CONTENT             │
│                             │
│                             │
├─────────────────────────────┤
│  🏠   │  🤖  │  💬  │  📊  │
│ Home  │Agents│ Chat │ More │
└─────────────────────────────┘
Use: Main app navigation, 3-5 primary destinations

PATTERN 2: HAMBURGER MENU (Secondary)
┌─────────────────────────────┐
│ ≡  ControlIA           [🔍] │
├─────────────────────────────┤
│  Dashboard                  │
│  Agents                     │
│  Analytics                  │
│  Tools                      │
│  Team                       │
│  Settings                   │
│  Help                       │
└─────────────────────────────┘
Use: Secondary navigation, settings, less frequent actions

PATTERN 3: FLOATING ACTION BUTTON
┌─────────────────────────────┐
│                             │
│         CONTENT             │
│                             │
│          ┌───┐              │
│          │ + │              │
│          └───┘              │
└─────────────────────────────┘
Use: Primary action (create agent, new conversation)

PATTERN 4: SWIPE GESTURES
┌─────────────────────────────┐
│  ← Swipe to go back         │
│                             │
│  ┌─────────────────────┐    │
│  │                     │    │
│  │      CONTENT        │◄───┼── Swipe between tabs
│  │                     │    │
│  └─────────────────────┘    │
│                             │
│  Pull to refresh ──►  ↓     │
└─────────────────────────────┘
```

### 7.3 Touch Targets and Accessibility

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TOUCH TARGETS & ACCESSIBILITY                           │
└─────────────────────────────────────────────────────────────────────────────┘

MINIMUM TOUCH TARGETS:
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  44px   │  │  44px   │  │  44px   │ │
│  │  × 44px │  │  × 44px │  │  × 44px │ │
│  │  (iOS)  │  │  (iOS)  │  │  (iOS)  │ │
│  └─────────┘  └─────────┘  └─────────┘ │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  48px   │  │  48px   │  │  48px   │ │
│  │  × 48px │  │  × 48px │  │  × 48px │ │
│  │(Android)│  │(Android)│  │(Android)│ │
│  └─────────┘  └─────────┘  └─────────┘ │
│                                         │
│  SPACING: 8px minimum between targets   │
│                                         │
└─────────────────────────────────────────┘

ACCESSIBILITY REQUIREMENTS (WCAG 2.1 AA):
┌─────────────────────────────────────────┐
│                                         │
│ TEXT SIZE:                              │
│ • Minimum: 16px (1rem)                  │
│ • Recommended: 16-18px for body         │
│                                         │
│ CONTRAST RATIOS:                        │
│ • Normal text: 4.5:1 minimum            │
│ • Large text: 3:1 minimum               │
│ • UI components: 3:1 minimum            │
│                                         │
│ SCREEN READER SUPPORT:                  │
│ • All images have alt text              │
│ • Form labels associated with inputs    │
│ • ARIA labels for interactive elements  │
│ • Focus indicators visible              │
│ • Skip navigation links                 │
│                                         │
│ REDUCED MOTION:                         │
│ • Respect prefers-reduced-motion        │
│ • Disable auto-playing animations       │
│                                         │
└─────────────────────────────────────────┘
```

### 7.4 PWA vs Native App Decision Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PWA VS NATIVE APP DECISION                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    PWA                         NATIVE APP
              ┌───────────────┐              ┌───────────────┐
              │               │              │               │
  Development │ ✅ Faster     │              │ ❌ Slower     │
              │ ✅ Single     │              │ ❌ Separate   │
              │    codebase   │              │    iOS/Android│
              │               │              │               │
  Distribution│ ✅ No store   │              │ ❌ App store  │
              │    approval   │              │    approval   │
              │ ✅ Direct URL │              │ ❌ Download   │
              │               │              │               │
  Performance │ ⚠️ Good       │              │ ✅ Best       │
              │ ⚠️ Limited    │              │ ✅ Full       │
              │    background │              │    background │
              │               │              │               │
  Features    │ ⚠️ Limited    │              │ ✅ Full       │
              │    hardware   │              │    hardware   │
              │    access     │              │    access     │
              │               │              │               │
  Push Notif. │ ✅ Supported  │              │ ✅ Supported  │
              │ ⚠️ iOS limited│              │ ✅ Full       │
              │               │              │               │
  Offline     │ ✅ Service    │              │ ✅ Full       │
              │    workers    │              │    offline    │
              │               │              │               │
  Biometric   │ ⚠️ Limited    │              │ ✅ Full       │
              │               │              │               │
              └───────────────┘              └───────────────┘

RECOMMENDATION FOR CONTROLIA:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  PHASE 1 (MVP): PWA                                                     │
│  • Faster time-to-market                                                │
│  • Single codebase (React/Vue)                                          │
│  • Core features: chat, notifications, dashboard                        │
│  • Target: 80% of use cases                                             │
│                                                                         │
│  PHASE 2 (Scale): Native Apps                                           │
│  • When user base justifies investment                                  │
│  • Advanced features: voice, deep integrations                          │
│  • Better performance for power users                                   │
│  • Enhanced security for enterprise                                     │
│                                                                         │
│  HYBRID APPROACH:                                                       │
│  • Core app: PWA for all users                                          │
│  • Power users: Native apps (optional)                                  │
│  • End customers: PWA or messaging apps (WhatsApp/Telegram)             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. PATRONES DE INTERACCIÓN CON AGENTES

### 8.1 Chat Interface Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHAT INTERFACE PATTERNS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

PATTERN 1: STANDARD CHAT
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────┐                          │
│  │ 👋 Hola! │  ← Agent message         │
│  └──────────┘                          │
│       🤖                                │
│                                         │
│            ┌──────────────┐            │
│            │ Necesito ayuda│  ← User   │
│            └──────────────┘            │
│                 👤                      │
│                                         │
│  ┌──────────────────────────┐          │
│  │ Claro, ¿con qué puedo   │          │
│  │ ayudarte hoy?           │          │
│  └──────────────────────────┘          │
│       🤖                                │
│                                         │
└─────────────────────────────────────────┘

PATTERN 2: QUICK REPLIES
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────────────────────┐          │
│  │ ¿Qué tipo de producto   │          │
│  │ te interesa?            │          │
│  └──────────────────────────┘          │
│       🤖                                │
│                                         │
│  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │Software│ │Servicio│ │Consulta│      │
│  └────────┘ └────────┘ └────────┘      │
│  ← Quick reply buttons                  │
│                                         │
└─────────────────────────────────────────┘

PATTERN 3: RICH CARDS
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────────────────────┐          │
│  │ Aquí tienes opciones:   │          │
│  └──────────────────────────┘          │
│       🤖                                │
│                                         │
│  ┌────────────────────────┐            │
│  │ [📷] Plan Básico      │            │
│  │ $29/mes               │            │
│  │ • 1,000 mensajes      │            │
│  │ • 1 agente            │            │
│  │ [Seleccionar]         │            │
│  └────────────────────────┘            │
│                                         │
│  ┌────────────────────────┐            │
│  │ [📷] Plan Pro         │            │
│  │ $99/mes               │            │
│  │ • 10,000 mensajes     │            │
│  │ • 5 agentes           │            │
│  │ [Seleccionar]         │            │
│  └────────────────────────┘            │
│                                         │
└─────────────────────────────────────────┘

PATTERN 4: CAROUSEL
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────────────────────┐          │
│  │ Productos recomendados: │          │
│  └──────────────────────────┘          │
│       🤖                                │
│                                         │
│  ┌────────────┐ ┌────────────┐          │
│  │ [📷]       │ │ [📷]       │          │
│  │ Producto 1 │ │ Producto 2 │          │
│  │ $99        │ │ $149       │          │
│  │ [Ver más]  │ │ [Ver más]  │          │
│  └────────────┘ └────────────┘          │
│       [←]  ● ○ ○  [→]                   │
│                                         │
└─────────────────────────────────────────┘

PATTERN 5: TYPING INDICATOR
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────┐                          │
│  │ ● ● ●   │  ← Agent typing           │
│  └──────────┘                          │
│       🤖                                │
│                                         │
└─────────────────────────────────────────┘

PATTERN 6: HUMAN HANDOFF
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────────────────────┐          │
│  │ Voy a transferirte con  │          │
│  │ un agente humano...     │          │
│  └──────────────────────────┘          │
│       🤖                                │
│                                         │
│  ┌──────────────────────────┐          │
│  │ ⏳ Esperando agente...  │          │
│  │ Posición: 2 en fila     │          │
│  │ Tiempo estimado: 3 min  │          │
│  └──────────────────────────┘          │
│                                         │
│  ┌──────────────────────────┐          │
│  │ 👤 María se ha unido    │          │
│  │ ¡Hola! Soy María...     │          │
│  └──────────────────────────┘          │
│       👩                                │
│                                         │
└─────────────────────────────────────────┘
```

### 8.2 Voice Interface (Optional)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VOICE INTERFACE PATTERNS                                │
└─────────────────────────────────────────────────────────────────────────────┘

ACTIVE LISTENING:
┌─────────────────────────────┐
│                             │
│         ┌─────────┐         │
│        /           \        │
│       │   ◉   ◉   │        │
│       │      ◡      │        │
│        \  ═══════  /        │
│         └─────────┘         │
│                             │
│      "Escuchando..."        │
│                             │
│    [████████░░░░░░░░]       │
│       (voice wave)          │
│                             │
│    [Cancelar]               │
│                             │
└─────────────────────────────┘

PROCESSING:
┌─────────────────────────────┐
│                             │
│         ┌─────────┐         │
│        /  ◠  ◠  \        │
│       │  ( ◠‿◠ )  │        │
│       │    ◡      │        │
│        \  ═══════  /        │
│         └─────────┘         │
│                             │
│      "Procesando..."        │
│                             │
│    ◐ (spinner)              │
│                             │
└─────────────────────────────┘

RESPONDING:
┌─────────────────────────────┐
│                             │
│         ┌─────────┐         │
│        /  ◠  ◠  \        │
│       │  ( ◠‿◠ )  │        │
│       │    ◡      │        │
│        \  ═══════  /        │
│         └─────────┘         │
│                             │
│   "Entendido. He encontrado │
│    3 opciones para ti..."   │
│                             │
│    [████████████░░░]        │
│     (TTS progress)          │
│                             │
└─────────────────────────────┘
```

### 8.3 Proactive Notifications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROACTIVE NOTIFICATION PATTERNS                         │
└─────────────────────────────────────────────────────────────────────────────┘

IN-APP NOTIFICATION:
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ 🔔 Recordatorio                  │   │
│  │                                  │   │
│  │ Tienes una reunión con Juan P.  │   │
│  │ en 15 minutos                    │   │
│  │                                  │   │
│  │ [Ver detalles]    [Descartar]   │   │
│  └──────────────────────────────────┘   │
│                                         │
│         [Existing content]              │
│                                         │
└─────────────────────────────────────────┘

PUSH NOTIFICATION (Mobile):
┌─────────────────────────────┐
│  🔵 ControlIA               │
│  ─────────────────────────  │
│  Agente de Ventas           │
│                             │
│  Nuevo lead calificado:     │
│  Empresa ABC - $50K pot.    │
│                             │
│  [Ver ahora] [Más tarde]    │
└─────────────────────────────┘

WHATSAPP NOTIFICATION:
┌─────────────────────────────┐
│  🤖 ControlIA Agent         │
│  ─────────────────────────  │
│  *Alerta de Ventas*         │
│                             │
│  Se ha generado un nuevo    │
│  lead calificado:           │
│                             │
│  • Empresa: ABC Tech        │
│  • Interés: Plan Enterprise │
│  • Potencial: $50,000       │
│  • Score: 85/100            │
│                             │
│  ¿Deseas contactarlos       │
│  ahora?                     │
│                             │
│  [Sí, contactar] [Más info] │
└─────────────────────────────┘

EMAIL DIGEST:
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  CONTROLIA                       │   │
│  │  Resumen Diario - 15 Ene 2024   │   │
│  │                                  │   │
│  │  HOLA ANA,                       │   │
│  │                                  │   │
│  │  Aquí está el resumen de tus    │   │
│  │  agentes hoy:                   │   │
│  │                                  │   │
│  │  📊 MÉTRICAS                    │   │
│  │  ─────────────────────────────  │   │
│  │  Conversaciones: 1,234 (↑12%)   │   │
│  │  Satisfacción: 98.5% (↑2.3%)    │   │
│  │  Leads generados: 45 (↑8%)      │   │
│  │                                  │   │
│  │  🚨 ALERTAS                     │   │
│  │  ─────────────────────────────  │   │
│  │  • 2 conversaciones necesitan   │   │
│  │    atención                     │   │
│  │  • Agente "Soporte MX":         │   │
│  │    tiempo de respuesta alto     │   │
│  │                                  │   │
│  │  [Ver Dashboard Completo]       │   │
│  │                                  │   │
│  └──────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 9. INTERNACIONALIZACIÓN (I18N)

### 9.1 Supported Languages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SOPORTE DE IDIOMAS                                      │
└─────────────────────────────────────────────────────────────────────────────┘

FASE 1 (Lanzamiento):
┌─────────────┬─────────────┬─────────────────────────────────────────────────┐
│ Idioma      │ Código      │ Mercados principales                            │
├─────────────┼─────────────┼─────────────────────────────────────────────────┤
│ Español     │ es          │ Colombia, México, Argentina, Chile, España      │
│             │ es-CO       │ Colombia (variante local)                       │
│             │ es-MX       │ México (variante local)                         │
├─────────────┼─────────────┼─────────────────────────────────────────────────┤
│ Portugués   │ pt          │ Brasil, Portugal                                │
│             │ pt-BR       │ Brasil (variante local)                         │
├─────────────┼─────────────┼─────────────────────────────────────────────────┤
│ Inglés      │ en          │ USA, internacional                              │
│             │ en-US       │ Estados Unidos                                  │
└─────────────┴─────────────┴─────────────────────────────────────────────────┘

FASE 2 (Expansión):
┌─────────────┬─────────────┬─────────────────────────────────────────────────┐
│ Idioma      │ Código      │ Mercados principales                            │
├─────────────┼─────────────┼─────────────────────────────────────────────────┤
│ Francés     │ fr          │ Canadá, Francia, África                         │
│ Alemán      │ de          │ Alemania, Austria, Suiza                        │
│ Italiano    │ it          │ Italia                                          │
└─────────────┴─────────────┴─────────────────────────────────────────────────┘

IMPLEMENTATION:
┌─────────────────────────────────────────┐
│                                         │
│  ESTRUCTURA DE ARCHIVOS:                │
│  /locales                               │
│    ├── /en                              │
│    │   ├── common.json                   │
│    │   ├── dashboard.json                │
│    │   ├── agent.json                    │
│    │   └── ...                           │
│    ├── /es                              │
│    │   ├── common.json                   │
│    │   └── ...                           │
│    ├── /es-CO                           │
│    │   └── common.json (overrides)       │
│    ├── /pt                              │
│    │   └── ...                           │
│    └── /pt-BR                           │
│        └── ...                          │
│                                         │
│  DETECCIÓN DE IDIOMA:                   │
│  1. URL parameter (?lang=es)            │
│  2. User preference (stored)            │
│  3. Browser language                    │
│  4. Default (es)                        │
│                                         │
│  FORMATOS:                              │
│  • Dates: DD/MM/YYYY (es, pt)           │
│           MM/DD/YYYY (en-US)            │
│  • Numbers: 1.234,56 (es, pt)           │
│             1,234.56 (en)               │
│  • Currency: $ 1.234,56 COP (es-CO)     │
│              R$ 1.234,56 (pt-BR)        │
│              $1,234.56 USD (en-US)      │
│                                         │
└─────────────────────────────────────────┘
```

### 9.2 RTL Considerations (Future)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONSIDERACIONES RTL (FUTURO)                            │
└─────────────────────────────────────────────────────────────────────────────┘

Para expansión a mercados árabes:

┌─────────────────────────────────────────┐
│                                         │
│  RTL LAYOUT:                            │
│                                         │
│  NORMAL (LTR):        RTL:              │
│  ┌─────────┐          ┌─────────┐       │
│  │ A → B → C│          │ C ← B ← A│       │
│  └─────────┘          └─────────┘       │
│                                         │
│  NAVIGATION:                            │
│  LTR: [Logo] [Nav] [User]               │
│  RTL: [User] [Nav] [Logo]               │
│                                         │
│  FORMS:                                 │
│  LTR: Label: [Input]                    │
│  RTL: [Input] :Label                    │
│                                         │
│  ICONS:                                 │
│  • Keep some icons LTR (e.g., arrows)   │
│  • Flip others (e.g., back arrow)       │
│                                         │
│  CSS SUPPORT:                           │
│  • Use logical properties:              │
│    - margin-inline-start (not margin-left)│
│    - padding-inline-end (not padding-right)│
│  • Or use CSS transforms for RTL        │
│                                         │
└─────────────────────────────────────────┘
```

---

## 10. SUMMARY Y PRÓXIMOS PASOS

### 10.1 Key Design Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRINCIPIOS DE DISEÑO CONTROLIA                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. SIMPLICIDAD SOBRE COMPLEJIDAD
   • Interfaces limpias y sin distracciones
   • Acciones principales visibles, secundarias ocultas
   • No sobrecargar al usuario con opciones

2. CONSISTENCIA MULTI-CANAL
   • Misma experiencia en web, mobile, WhatsApp, Telegram
   • Mismos patrones de interacción
   • Sincronización de estado entre canales

3. EFICIENCIA PARA USUARIOS EMPRESARIALES
   • Atajos de teclado
   • Acciones en bulk
   • Templates y reutilización
   • Automatización de tareas repetitivas

4. TRANSPARENCIA Y CONFIANZA
   • El usuario siempre sabe qué está haciendo el agente
   • Fácil acceso a logs y debugging
   • Control total sobre configuraciones

5. ESCALABILIDAD
   • Diseño que funciona para 1 o 1000 agentes
   • Performance consistente
   • Fácil onboarding de nuevos usuarios
```

### 10.2 Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROADMAP DE IMPLEMENTACIÓN UX/UI                         │
└─────────────────────────────────────────────────────────────────────────────┘

FASE 1: FOUNDATION (Mes 1-2)
├── Design System v1.0
│   ├── Tokens (colores, tipografía, spacing)
│   ├── Component library básico
│   └── Dark mode
│
├── Web Application - Core
│   ├── Auth (login, signup, SSO)
│   ├── Dashboard básico
│   ├── Agent list y detail
│   └── User profile
│
└── Mobile PWA - Core
    ├── Home screen
    ├── Agent list
    └── Chat interface

FASE 2: BUILDER (Mes 2-3)
├── Agent Builder v1
│   ├── Prompt editor
│   ├── Basic testing
│   └── Simple deploy
│
├── Integrations v1
│   ├── WhatsApp Business API
│   ├── Telegram Bot
│   └── Web chat widget
│
└── Analytics v1
    ├── Basic metrics
    └── Usage dashboard

FASE 3: ENTERPRISE (Mes 3-4)
├── Team Management
│   ├── User roles
│   ├── Permissions
│   └── Invitations
│
├── Advanced Analytics
│   ├── Custom reports
│   ├── Cost tracking
│   └── Export
│
├── Visual Workflow Builder
│   └── Node-based editor
│
└── Mobile App v1.0
    ├── Full feature parity
    └── Push notifications

FASE 4: SCALE (Mes 4-6)
├── Additional Channels
│   ├── Slack
│   ├── Microsoft Teams
│   └── Email
│
├── Advanced Features
│   ├── Version control
│   ├── A/B testing
│   └── Advanced debugging
│
└── Internationalization
    ├── Full i18n support
    └── es, pt, en complete
```

---

## ANEXOS

### A. Icon Library

```
NAVIGATION:
- Dashboard: 📊 / layout-dashboard
- Agents: 🤖 / bot
- Analytics: 📈 / bar-chart-3
- Tools: 🔧 / wrench
- Team: 👥 / users
- Settings: ⚙️ / settings
- Help: ❓ / help-circle

ACTIONS:
- Create: ➕ / plus
- Edit: ✏️ / pencil
- Delete: 🗑️ / trash-2
- Save: 💾 / save
- Cancel: ✕ / x
- Search: 🔍 / search
- Filter: 🔽 / filter
- Export: 📤 / download
- Import: 📥 / upload

STATUS:
- Active: 🟢 / check-circle
- Inactive: ⚪ / circle
- Warning: 🟡 / alert-triangle
- Error: 🔴 / x-circle
- Pending: ⏳ / clock
- Processing: 🔄 / refresh-cw
```

### B. Animation Guidelines

```
DURATIONS:
- Micro (hover, focus): 150ms
- Small (buttons, toggles): 200ms
- Medium (modals, drawers): 300ms
- Large (page transitions): 400ms

EASINGS:
- Standard: cubic-bezier(0.4, 0, 0.2, 1)
- Decelerate: cubic-bezier(0, 0, 0.2, 1)
- Accelerate: cubic-bezier(0.4, 0, 1, 1)
- Bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55)

PATTERNS:
- Fade in: opacity 0 → 1
- Slide up: translateY(10px) → translateY(0)
- Scale: scale(0.95) → scale(1)
- Skeleton loading: shimmer animation
```

---

*Documento creado para ControlIA Agent Platform*
*Versión 1.0 - Enero 2024*
