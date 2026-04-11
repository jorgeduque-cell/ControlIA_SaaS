# 🤖 TELEGRAM + VOLTAGENT - Guía Completa
## Evolucionando ControlIA a Agentes Empresariales con Telegram Bot API

---

## 💡 ¿POR QUÉ TELEGRAM?

| Característica | Telegram | WhatsApp |
|----------------|----------|----------|
| **Costo API** | $0 (gratis) | $0.005-0.09/msg |
| **Webhooks** | Gratis ilimitados | Pago por mensaje |
| **Aprobación** | Instantánea | Semanas/meses |
| **Rate limits** | 30 msgs/seg | Muy restrictivo |
| **Bots** | Nativo, robusto | Limitado |
| **Comunidades** | Canales/grupos masivos | Más limitado |

**Telegram es el canal perfecto para LATAM:**
- ✅ Más de 700M usuarios globales
- ✅ Muy popular en LATAM (especialmente Colombia)
- ✅ Cultura de bots muy aceptada
- ✅ Sin fricción: usuario solo busca @tubot y start

---

## 🎯 ARQUITECTURA: CONTROLIA + VOLTAGENT + TELEGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONTROLIA AGENT PLATFORM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐  │
│  │   Telegram   │──────▶│   Next.js    │──────▶│   VoltAgent      │  │
│  │   Bot API    │◀──────│   API Routes │◀──────│   Core           │  │
│  │              │      │              │      │                  │  │
│  └──────────────┘      └──────────────┘      └──────┬───────────┘  │
│         │                                           │               │
│         │                                           ▼               │
│         │                              ┌──────────────────┐        │
│         │                              │   OpenAI GPT     │        │
│         │                              │   Claude/etc     │        │
│         │                              └──────────────────┘        │
│         │                                                          │
│         └─────────────────────────────▶┌──────────────────┐        │
│                                        │   Supabase       │        │
│                                        │   (Postgres)     │        │
│                                        └──────────────────┘        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ SETUP TELEGRAM BOT (5 minutos)

### Paso 1: Crear Bot con BotFather

1. Busca **@BotFather** en Telegram
2. Envía `/newbot`
3. Nombra tu bot: `ControlIA Enterprise`
4. Username: `controliaenterprisebot`
5. **Guarda el TOKEN** (ej: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Paso 2: Configurar Webhook

```bash
# Set webhook (tu URL de Vercel)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-app.vercel.app/api/webhook/telegram",
    "allowed_updates": ["message", "callback_query"]
  }'

# Verificar webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Paso 3: Variables de Entorno

```env
# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=tu_secreto_para_verificar

# OpenAI
OPENAI_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://....supabase.co
SUPABASE_ANON_KEY=eyJ...

# App
NEXTAUTH_SECRET=generar_con_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

---

## 💻 CÓDIGO: WEBHOOK DE TELEGRAM

### API Route: `/api/webhook/telegram/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { salesAgent } from '@/src/agents/sales-agent';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Verificar secreto del webhook
function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  return secret === process.env.TELEGRAM_WEBHOOK_SECRET;
}

export async function POST(req: NextRequest) {
  try {
    // Verificar secreto (seguridad básica)
    if (!verifyWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const update = await req.json();
    
    // Procesar mensaje o callback
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const user = message.from;
  
  // Ignorar mensajes de bots
  if (user.is_bot) return;

  // Comandos especiales
  if (text.startsWith('/')) {
    await handleCommand(chatId, text, user);
    return;
  }

  // Buscar o crear empresa/usuario
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .single();

  if (!company) {
    // Nuevo usuario - iniciar onboarding
    await sendTelegramMessage(chatId, 
      '¡Bienvenido a ControlIA! 🚀\n\n' +
      'Soy tu agente de ventas inteligente.\n\n' +
      'Para empezar, necesito saber:\n' +
      '1. ¿Cómo se llama tu empresa?\n' +
      '2. ¿Qué productos vendes?\n\n' +
      'Responde con /registrar [nombre] [productos]'
    );
    return;
  }

  // Procesar con VoltAgent
  const response = await salesAgent.processMessage({
    message: text,
    context: {
      companyId: company.id,
      chatId,
      userId: user.id,
      history: company.conversation_history || [],
      catalog: company.catalog,
    },
  });

  // Enviar respuesta
  await sendTelegramMessage(chatId, response.text, {
    replyMarkup: generateReplyMarkup(response.actions),
  });

  // Guardar conversación
  await saveConversation(company.id, chatId, text, response.text);
}

async function handleCommand(chatId: number, command: string, user: any) {
  const [cmd, ...args] = command.split(' ');
  
  switch (cmd) {
    case '/start':
      await sendTelegramMessage(chatId,
        '¡Hola! 👋 Soy ControlIA, tu agente de ventas.\n\n' +
        '🛍️ Puedo ayudarte a:\n' +
        '• Atender clientes automáticamente\n' +
        '• Responder preguntas de productos\n' +
        '• Tomar pedidos\n' +
        '• Enviar cotizaciones\n\n' +
        'Para empezar: /registrar [nombre empresa]'
      );
      break;
      
    case '/registrar':
      const companyName = args.join(' ');
      if (!companyName) {
        await sendTelegramMessage(chatId, 'Por favor dime: /registrar [nombre de tu empresa]');
        return;
      }
      
      // Crear empresa en Supabase
      await supabase.from('companies').insert({
        name: companyName,
        telegram_chat_id: chatId,
        owner_telegram_id: user.id,
        plan: 'trial',
        created_at: new Date(),
      });
      
      await sendTelegramMessage(chatId,
        `✅ ¡${companyName} registrada!\n\n` +
        'Ahora configura tu catálogo con:\n' +
        '/catalogo [producto1:$precio], [producto2:$precio]\n\n' +
        'Ejemplo: /catalogo Camiseta:$50, Pantalón:$100'
      );
      break;
      
    case '/catalogo':
      // Parsear y guardar catálogo
      const catalogText = args.join(' ');
      const products = parseCatalog(catalogText);
      
      await supabase.from('companies')
        .update({ catalog: products })
        .eq('telegram_chat_id', chatId);
      
      await sendTelegramMessage(chatId,
        '✅ Catálogo guardado:\n' +
        products.map((p: any) => `• ${p.name}: $${p.price}`).join('\n') +
        '\n\n¡Listo! Ahora los clientes pueden escribirme y los atenderé.\n' +
        'Usa /modo_cliente para probar cómo te ven tus clientes.'
      );
      break;
      
    case '/modo_cliente':
      await sendTelegramMessage(chatId,
        '🎭 MODO CLIENTE ACTIVADO\n\n' +
        'Ahora escribe como si fueras un cliente interesado en comprar.\n' +
        'Te responderé como atendería a tus clientes reales.\n\n' +
        'Para volver al modo admin: /modo_admin'
      );
      break;
      
    case '/stats':
      const stats = await getCompanyStats(chatId);
      await sendTelegramMessage(chatId,
        '📊 ESTADÍSTICAS\n\n' +
        `Conversaciones hoy: ${stats.today}\n` +
        `Conversaciones mes: ${stats.month}\n` +
        `Pedidos generados: ${stats.orders}\n` +
        `Ingresos estimados: $${stats.revenue}`
      );
      break;
      
    case '/ayuda':
      await sendTelegramMessage(chatId,
        '❓ COMANDOS DISPONIBLES\n\n' +
        '/start - Iniciar bot\n' +
        '/registrar [nombre] - Registrar empresa\n' +
        '/catalogo [productos] - Configurar catálogo\n' +
        '/modo_cliente - Probar como cliente\n' +
        '/stats - Ver estadísticas\n' +
        '/ayuda - Mostrar ayuda\n\n' +
        '💡 Simplemente escríbeme para conversar'
      );
      break;
      
    default:
      await sendTelegramMessage(chatId, 'Comando no reconocido. Usa /ayuda para ver opciones.');
  }
}

async function handleCallbackQuery(callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  // Procesar acciones de botones inline
  if (data.startsWith('buy:')) {
    const productId = data.split(':')[1];
    await processPurchase(chatId, productId);
  } else if (data.startsWith('info:')) {
    const productId = data.split(':')[1];
    await sendProductInfo(chatId, productId);
  }
  
  // Responder al callback para quitar "cargando"
  await answerCallbackQuery(callbackQuery.id);
}

// Funciones auxiliares

async function sendTelegramMessage(
  chatId: number, 
  text: string, 
  options?: { replyMarkup?: any }
) {
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  
  if (options?.replyMarkup) {
    body.reply_markup = options.replyMarkup;
  }
  
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function answerCallbackQuery(callbackQueryId: string) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

function generateReplyMarkup(actions?: any[]) {
  if (!actions || actions.length === 0) return undefined;
  
  return {
    inline_keyboard: actions.map(action => [{
      text: action.label,
      callback_data: action.value,
    }]),
  };
}

function parseCatalog(text: string): any[] {
  // Parsear formato: "Producto:$50, Producto 2:$100"
  return text.split(',').map(item => {
    const [name, priceStr] = item.split(':');
    return {
      name: name.trim(),
      price: parseInt(priceStr.replace('$', '').trim()),
    };
  });
}

async function saveConversation(
  companyId: string, 
  chatId: number, 
  userMessage: string, 
  botResponse: string
) {
  await supabase.from('conversations').insert({
    company_id: companyId,
    chat_id: chatId,
    user_message: userMessage,
    bot_response: botResponse,
    created_at: new Date(),
  });
}

async function getCompanyStats(chatId: number) {
  // Implementar consultas a Supabase
  return {
    today: 5,
    month: 45,
    orders: 12,
    revenue: 2400,
  };
}

async function processPurchase(chatId: number, productId: string) {
  // Implementar lógica de compra
  await sendTelegramMessage(chatId, '✅ Producto agregado al carrito');
}

async function sendProductInfo(chatId: number, productId: string) {
  // Implementar info de producto
  await sendTelegramMessage(chatId, '📋 Información del producto...');
}
```

---

## 🤖 AGENTE DE VENTAS CON VOLTAGENT

```typescript
// src/agents/sales-agent.ts
import { Agent, AgentConfig } from '@voltagent/core';
import { OpenAIProvider } from '@voltagent/llm';

export const salesAgentConfig: AgentConfig = {
  name: 'Vendedor ControlIA',
  description: 'Agente de ventas para PyMEs latinoamericanas vía Telegram',
  
  llm: new OpenAIProvider({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 500,
  }),
  
  systemPrompt: `Eres un vendedor profesional y amable de una PyME latinoamericana.

CONTEXTO:
- Atiendes clientes por Telegram
- Tu objetivo es ayudarles a comprar, no solo responder
- Eres eficiente, claro y cercano

PERSONALIDAD:
- Saluda con calidez: "¡Hola! 👋 ¿En qué puedo ayudarte?"
- Usa emojis ocasionalmente 😊
- Sé conciso (máximo 3-4 oraciones por mensaje)
- Frases típicas: "Con gusto", "Quedo atento/a", "Perfecto"

PROCESO DE VENTA:
1. Saluda y pregunta qué busca
2. Muestra opciones del catálogo
3. Si quiere comprar, pide:
   - Nombre completo
   - Dirección de entrega
   - Teléfono de contacto
4. Confirma el pedido con resumen
5. Dile que un humano confirmará el pago y envío

REGLAS IMPORTANTES:
- NO inventes productos que no estén en el catálogo
- Si no sabes algo, di "Déjame confirmar con el equipo"
- Si el cliente está molesto, sé empático y escala a humano
- Horario de atención: Lunes a Sábado 8am - 8pm

CATÁLOGO (configurable por empresa):
{{catalog}}

HISTORIAL DE CONVERSACIÓN:
{{history}}`,

  tools: [
    {
      name: 'get_catalog',
      description: 'Obtener catálogo de productos de la empresa',
      handler: async (context: any) => {
        return context.catalog || [];
      },
    },
    {
      name: 'create_order',
      description: 'Crear un pedido',
      parameters: {
        customerName: 'string',
        products: 'array',
        total: 'number',
        address: 'string',
        phone: 'string',
      },
      handler: async (params: any, context: any) => {
        // Guardar en Supabase
        return { orderId: 'ORD-' + Date.now(), status: 'pending' };
      },
    },
    {
      name: 'get_order_status',
      description: 'Consultar estado de un pedido',
      parameters: { orderId: 'string' },
      handler: async (params: any) => {
        return { status: 'in_transit', estimatedDelivery: '2 días' };
      },
    },
  ],
};

export const salesAgent = new Agent(salesAgentConfig);
```

---

## 🎨 INTERFAZ TELEGRAM MEJORADA

### Botones Inline (InlineKeyboard)

```typescript
// Ejemplo de catálogo con botones
async function sendCatalogWithButtons(chatId: number, products: any[]) {
  const keyboard = products.map(product => [{
    text: `🛒 ${product.name} - $${product.price}`,
    callback_data: `buy:${product.id}`,
  }]);
  
  // Agregar botón de info
  keyboard.push([{
    text: '❓ Ver detalles',
    callback_data: `info:all`,
  }]);
  
  await sendTelegramMessage(chatId, 
    '📋 Nuestro catálogo:\nSelecciona un producto:',
    {
      replyMarkup: { inline_keyboard: keyboard },
    }
  );
}

// Botones de confirmación
async function sendOrderConfirmation(chatId: number, order: any) {
  await sendTelegramMessage(chatId,
    `📝 Resumen de tu pedido:\n` +
    `${order.products.map((p: any) => `• ${p.name}: $${p.price}`).join('\n')}\n` +
    `\nTotal: $${order.total}\n\n` +
    `¿Confirmas el pedido?`,
    {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '✅ Confirmar', callback_data: 'confirm:yes' },
            { text: '❌ Cancelar', callback_data: 'confirm:no' },
          ],
        ],
      },
    }
  );
}
```

### Comandos con Menú (BotCommand)

```typescript
// Configurar menú de comandos
async function setBotCommands() {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: 'Iniciar bot' },
        { command: 'catalogo', description: 'Ver catálogo' },
        { command: 'pedido', description: 'Hacer pedido' },
        { command: 'estado', description: 'Estado de pedido' },
        { command: 'ayuda', description: 'Obtener ayuda' },
      ],
    }),
  });
}
```

---

## 📊 MODELOS DE SUPABASE PARA TELEGRAM

```sql
-- Empresas (mejorado para Telegram)
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  telegram_chat_id BIGINT UNIQUE,
  owner_telegram_id BIGINT,
  username TEXT,
  
  -- Configuración
  catalog JSONB DEFAULT '[]',
  business_hours JSONB DEFAULT '{"start": "08:00", "end": "20:00"}',
  auto_reply BOOLEAN DEFAULT true,
  
  -- Plan y billing
  plan TEXT DEFAULT 'trial', -- trial, starter, growth, pro
  trial_ends_at TIMESTAMP,
  
  -- Métricas
  total_conversations INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversaciones
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  chat_id BIGINT NOT NULL,
  customer_telegram_id BIGINT,
  customer_name TEXT,
  
  -- Mensajes
  user_message TEXT,
  bot_response TEXT,
  
  -- Metadata
  intent TEXT, -- compra, consulta, queja, etc.
  sentiment TEXT, -- positive, neutral, negative
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  response_time_ms INTEGER
);

-- Pedidos
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  conversation_id UUID REFERENCES conversations(id),
  
  -- Cliente
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  
  -- Pedido
  products JSONB NOT NULL,
  total INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, confirmed, shipped, delivered, cancelled
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_conversations_company ON conversations(company_id);
CREATE INDEX idx_conversations_chat ON conversations(chat_id);
CREATE INDEX idx_conversations_created ON conversations(created_at);
CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at 
  BEFORE UPDATE ON companies 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 💰 MONETIZACIÓN ESPECÍFICA PARA TELEGRAM

### Planes y Precios (LATAM-friendly)

```typescript
// config/pricing.ts
export const pricingPlans = {
  trial: {
    name: 'Prueba',
    price: 0,
    duration: '14 días',
    features: {
      maxConversations: 100,
      maxProducts: 10,
      channels: ['telegram'],
      support: 'email',
    },
  },
  
  starter: {
    name: 'Starter',
    price: 29, // USD
    interval: 'month',
    features: {
      maxConversations: 500,
      maxProducts: 50,
      channels: ['telegram'],
      support: 'email',
      analytics: 'basic',
    },
  },
  
  growth: {
    name: 'Growth',
    price: 79,
    interval: 'month',
    features: {
      maxConversations: Infinity,
      maxProducts: 200,
      channels: ['telegram', 'whatsapp'],
      support: 'priority',
      analytics: 'advanced',
      api: true,
    },
  },
  
  pro: {
    name: 'Pro',
    price: 149,
    interval: 'month',
    features: {
      maxConversations: Infinity,
      maxProducts: Infinity,
      channels: ['telegram', 'whatsapp', 'web'],
      support: 'dedicated',
      analytics: 'full',
      api: true,
      customAgent: true,
      whiteLabel: true,
    },
  },
};

// Verificar límites
export async function checkPlanLimits(companyId: string, action: string) {
  const { data: company } = await supabase
    .from('companies')
    .select('plan, total_conversations, trial_ends_at')
    .eq('id', companyId)
    .single();
  
  const plan = pricingPlans[company.plan as keyof typeof pricingPlans];
  
  // Verificar trial
  if (company.plan === 'trial' && new Date() > new Date(company.trial_ends_at)) {
    throw new Error('Trial expirado. Actualiza tu plan con /upgrade');
  }
  
  // Verificar límites
  if (action === 'conversation' && company.total_conversations >= plan.features.maxConversations) {
    throw new Error('Límite de conversaciones alcanzado. Usa /upgrade para más');
  }
  
  return true;
}
```

### Comando de Upgrade

```typescript
// En handleCommand
case '/upgrade':
  await sendTelegramMessage(chatId,
    '💳 PLANES DISPONIBLES\n\n' +
    'Starter - $29/mes\n' +
    '• 500 conversaciones\n' +
    '• 50 productos\n\n' +
    'Growth - $79/mes\n' +
    '• Conversaciones ilimitadas\n' +
    '• WhatsApp + Telegram\n\n' +
    'Pro - $149/mes\n' +
    '• Todo ilimitado\n' +
    '• Marca blanca\n\n' +
    'Para actualizar: Visita https://controlia.com/upgrade'
  );
  break;
```

---

## 🚀 DEPLOY Y TESTING

### 1. Deploy en Vercel

```bash
# Desde tu proyecto
vercel --prod

# Obtener URL
# Ejemplo: https://controlia-agent.vercel.app
```

### 2. Configurar Webhook de Telegram

```bash
# Set webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d '{
    "url": "https://controlia-agent.vercel.app/api/webhook/telegram",
    "secret_token": "tu_secreto_seguro_123",
    "allowed_updates": ["message", "callback_query"]
  }'

# Verificar
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 3. Testing Local con ngrok

```bash
# Terminal 1: Correr app local
npm run dev

# Terminal 2: Exponer con ngrok
ngrok http 3000

# Copiar URL https y configurar webhook temporal
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d '{"url": "https://abc123.ngrok.io/api/webhook/telegram"}'
```

---

## 📈 MONITOREO Y ANALYTICS

### Dashboard Simple

```typescript
// app/(dashboard)/stats/page.tsx
export default function StatsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">📊 Estadísticas</h1>
      
      <div className="grid grid-cols-4 gap-4">
        <StatCard 
          title="Conversaciones Hoy" 
          value="24" 
          trend="+12%" 
        />
        <StatCard 
          title="Pedidos Este Mes" 
          value="156" 
          trend="+8%" 
        />
        <StatCard 
          title="Ingresos Estimados" 
          value="$3,240" 
          trend="+15%" 
        />
        <StatCard 
          title="Satisfacción" 
          value="4.8/5" 
          trend="+0.2" 
        />
      </div>
      
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Conversaciones Recientes</h2>
        <ConversationsTable />
      </div>
    </div>
  );
}
```

### Notificaciones al Admin

```typescript
// Notificar pedido nuevo
async function notifyNewOrder(order: any) {
  const { data: company } = await supabase
    .from('companies')
    .select('telegram_chat_id')
    .eq('id', order.company_id)
    .single();
  
  await sendTelegramMessage(company.telegram_chat_id,
    `🛒 NUEVO PEDIDO #${order.id}\n\n` +
    `Cliente: ${order.customer_name}\n` +
    `Total: $${order.total}\n\n` +
    `Responde para confirmar.`
  );
}
```

---

## 🎓 FLUJOS AVANZADOS

### 1. Onboarding Guiado (Conversacional)

```typescript
// Estado de onboarding
async function handleOnboardingStep(chatId: number, text: string, step: number) {
  switch (step) {
    case 1:
      await sendTelegramMessage(chatId, 
        '¡Bienvenido! 👋\n¿Cómo se llama tu empresa?'
      );
      await updateOnboardingStep(chatId, 2);
      break;
      
    case 2:
      await saveCompanyName(chatId, text);
      await sendTelegramMessage(chatId,
        'Perfecto! 📝\nAhora dime qué productos vendes (separados por comas):'
      );
      await updateOnboardingStep(chatId, 3);
      break;
      
    case 3:
      await saveProducts(chatId, text);
      await sendTelegramMessage(chatId,
        '¡Listo! ✅\n\n' +
        'Tu agente está configurado.\n' +
        'Los clientes pueden escribirme ahora.\n\n' +
        'Usa /stats para ver métricas\n' +
        'Usa /modo_cliente para probar'
      );
      await completeOnboarding(chatId);
      break;
  }
}
```

### 2. Escalamiento a Humano

```typescript
// Detectar cuando escalar
async function shouldEscalateToHuman(message: string, context: any): Promise<boolean> {
  // Palabras clave de frustración
  const frustrationWords = ['humano', 'agente', 'supervisor', 'queja', 'malo', 'pesimo'];
  if (frustrationWords.some(w => message.toLowerCase().includes(w))) {
    return true;
  }
  
  // Sentimiento negativo (usar análisis simple o LLM)
  if (context.sentiment === 'negative' && context.frustrationScore > 0.7) {
    return true;
  }
  
  // Consulta compleja
  if (message.length > 200 && context.intent === 'complex_query') {
    return true;
  }
  
  return false;
}

// Escalar
async function escalateToHuman(chatId: number, conversation: any) {
  await sendTelegramMessage(chatId,
    'Entiendo, te conecto con un asesor humano. 👨‍💼\n' +
    'Por favor espera un momento...'
  );
  
  // Notificar al admin
  await notifyHumanNeeded(chatId, conversation);
}
```

---

## ✅ CHECKLIST IMPLEMENTACIÓN

### Día 1: Setup
- [ ] Crear bot con @BotFather
- [ ] Guardar token seguro
- [ ] Clonar VoltAgent
- [ ] Configurar variables .env.local
- [ ] Crear tablas en Supabase
- [ ] Implementar webhook básico
- [ ] Probar /start

### Día 2: Agente
- [ ] Configurar agente con VoltAgent
- [ ] Implementar comandos (/registrar, /catalogo)
- [ ] Probar flujo completo
- [ ] Deploy en Vercel

### Día 3: Primer Cliente
- [ ] Onboard empresa de prueba
- [ ] Configurar catálogo real
- [ ] Probar conversaciones
- [ ] Iterar según feedback

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### "No recibo mensajes"
1. Verificar webhook: `getWebhookInfo`
2. Revisar logs de Vercel
3. Confirmar secret token coincide

### "El bot no responde"
1. Revisar OpenAI API key
2. Verificar Supabase connection
3. Revisar logs de errores

### "Respuestas lentas"
1. Usar GPT-4o-mini (más rápido)
2. Limitar max_tokens
3. Implementar typing indicator

---

## 🚀 PRÓXIMOS PASOS

1. **AHORA:** Crear bot con @BotFather
2. **HOY:** Setup básico funcionando
3. **MAÑANA:** Primer mensaje de prueba
4. **ESTA SEMANA:** 1er cliente onboarded

**¡VAMOS A HACERLO! 💪🚀**

---

**¿Listo para empezar? Solo necesitas 20 minutos para tener tu bot de Telegram funcionando.**
