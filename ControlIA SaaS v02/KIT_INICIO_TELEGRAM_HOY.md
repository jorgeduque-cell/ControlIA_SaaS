# 🛠️ KIT DE INICIO TELEGRAM - Empezar Hoy Mismo
## Código, Prompts y Configuración para tu Primer Bot en 24h

---

## ⚡ SETUP RÁPIDO (20 minutos)

### Paso 1: Crear Bot de Telegram (5 min)

1. Abre Telegram y busca **@BotFather**
2. Envía `/newbot`
3. Nombre: `ControlIA Agent` (o el que quieras)
4. Username: `tuagentebot` (debe terminar en 'bot')
5. **Guarda el TOKEN** que te dan (ej: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Paso 2: Clonar y Configurar (10 min)

```bash
# Clonar VoltAgent
git clone https://github.com/VoltAgent/voltagent.git controlia-telegram
cd controlia-telegram

# Crear tu rama
git checkout -b telegram-solo

# Instalar dependencias
npm install

# Instalar SDK de Telegram
npm install node-telegram-bot-api
```

### Paso 3: Variables de Entorno (5 min)

Crear archivo `.env.local`:
```env
# Telegram (obligatorio)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# OpenAI (obligatorio)
OPENAI_API_KEY=sk-...

# Supabase (obligatorio)
SUPABASE_URL=https://....supabase.co
SUPABASE_ANON_KEY=eyJ...

# Opcional (para local)
NEXTAUTH_SECRET=generar_con_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

---

## 💻 CÓDIGO LISTO PARA COPIAR

### 1. Webhook Handler (app/api/webhook/telegram/route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    
    // Solo procesar mensajes de texto
    if (!update.message || !update.message.text) {
      return NextResponse.json({ success: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const user = update.message.from;

    console.log(`Mensaje de ${user.first_name}: ${text}`);

    // Manejar comandos
    if (text.startsWith('/')) {
      await handleCommand(chatId, text, user);
    } else {
      // Responder con eco (para probar)
      await sendTelegramMessage(chatId, `Recibí: ${text}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// Verificación del webhook (GET)
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'Webhook activo' });
}

// Manejar comandos
async function handleCommand(chatId: number, text: string, user: any) {
  const [command, ...args] = text.split(' ');
  
  switch (command) {
    case '/start':
      await sendTelegramMessage(chatId, 
        `¡Hola ${user.first_name}! 👋\n\n` +
        'Soy ControlIA, tu agente de ventas.\n\n' +
        '📋 Comandos disponibles:\n' +
        '/start - Iniciar\n' +
        '/ayuda - Ver ayuda\n' +
        '/info - Información'
      );
      break;
      
    case '/ayuda':
      await sendTelegramMessage(chatId,
        '❓ AYUDA\n\n' +
        'Soy un bot de ventas que puede:\n' +
        '• Responder preguntas de productos\n' +
        '• Tomar pedidos\n' +
        '• Dar información\n\n' +
        'Escríbeme lo que necesites.'
      );
      break;
      
    case '/info':
      await sendTelegramMessage(chatId,
        'ℹ️ CONTROLIA\n\n' +
        'Versión: 1.0\n' +
        'Creado con VoltAgent + Telegram\n' +
        '© 2026'
      );
      break;
      
    default:
      await sendTelegramMessage(chatId, 
        'Comando no reconocido. Usa /ayuda para ver opciones.'
      );
  }
}

// Enviar mensaje a Telegram
async function sendTelegramMessage(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  });
}
```

### 2. Configurar Supabase (SQL)

```sql
-- Tabla de empresas
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  telegram_chat_id BIGINT UNIQUE,
  owner_telegram_id BIGINT,
  username TEXT,
  plan TEXT DEFAULT 'trial',
  catalog JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de conversaciones
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  chat_id BIGINT NOT NULL,
  customer_name TEXT,
  user_message TEXT,
  bot_response TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_conversations_chat ON conversations(chat_id);
CREATE INDEX idx_conversations_created ON conversations(created_at);
```

### 3. Configurar Webhook

```bash
# Set webhook (reemplazar <TOKEN> y <URL>)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-app.vercel.app/api/webhook/telegram",
    "allowed_updates": ["message"]
  }'

# Verificar webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Borrar webhook (si necesitas)
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

---

## 🤖 PROMPTS PARA KIMI

### Prompt 1: Agente de Ventas Completo
```
"Crea un agente de ventas completo para Telegram usando VoltAgent.
Debe:
1. Recibir mensajes del webhook
2. Usar GPT-4o-mini para responder
3. Tener personalidad de vendedor latinoamericano amable
4. Manejar un catálogo de productos configurable
5. Detectar intención de compra y pedir datos
6. Guardar conversaciones en Supabase
7. Responder en máximo 3-4 oraciones

Dame el código completo del agente."
```

### Prompt 2: Comandos Avanzados
```
"Agrega estos comandos a mi bot de Telegram:
/registrar [nombre] - Registrar nueva empresa
/catalogo - Ver catálogo actual
/agregar [producto]:[precio] - Agregar producto
/pedido - Ver pedidos del día
/stats - Estadísticas de conversaciones

Cada comando debe interactuar con Supabase."
```

### Prompt 3: Botones Inline
```
"Mejora mi bot de Telegram con botones inline:
1. Mostrar catálogo con botones 'Comprar' e 'Info'
2. Confirmar pedidos con 'Sí' y 'No'
3. Menú principal con botones en lugar de comandos

Usar Telegram InlineKeyboard."
```

### Prompt 4: Dashboard Web
```
"Crea un dashboard simple en Next.js para ver:
1. Lista de empresas registradas
2. Conversaciones recientes
3. Estadísticas (conversaciones hoy, pedidos, etc.)
4. Gráfico simple de conversaciones por día

Usar Tailwind CSS y shadcn/ui."
```

---

## 🚀 DEPLOY EN VERCEL (5 min)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod

# Configurar variables de entorno en dashboard
vercel env add TELEGRAM_BOT_TOKEN
vercel env add OPENAI_API_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
```

---

## 🎯 PRIMER CLIENTE EN 48H

### Paso 1: Identificar (Hoy)
Busca en tu red:
- Tío con tienda de ropa
- Amigo con restaurante
- Vecino con ferretería
- Prima con salón de belleza

### Paso 2: Ofrecer (Mañana)
Mensaje de Telegram/WhatsApp:
```
"Hola [Nombre], estoy creando un bot de IA para Telegram 
que responde automáticamente los mensajes de clientes.

¿Te interesaría probarlo gratis por 1 semana? 
Solo necesito que me des acceso a tu Telegram."
```

### Paso 3: Cerrar (Pasado mañana)
Oferta irresistible:
```
"Precio normal: $50/mes
Precio amigo (solo para ti): $25/mes los primeros 3 meses
Después: $50/mes"
```

---

## 💸 PRESUPUESTO MENSUAL REAL

### Mes 1-3 (MVP):
| Servicio | Costo |
|----------|-------|
| Telegram Bot API | $0 |
| OpenAI API | $20-30 |
| Vercel | $0 |
| Supabase | $0 |
| **TOTAL** | **$20-30/mes** |

### Mes 4+ (Con clientes):
| Concepto | Monto |
|----------|-------|
| Ingresos (10 × $50) | $500 |
| Costos | -$30 |
| **GANANCIA** | **$470/mes** |

---

## 📊 METRICAS A SEGUIR

### Métricas Técnicas
- Mensajes procesados/día
- Tiempo de respuesta promedio
- Errores/alertas
- Uso de tokens OpenAI

### Métricas de Negocio (Spreadsheet)
- Clientes activos
- MRR (Monthly Recurring Revenue)
- Churn (clientes que se van)
- NPS (satisfacción)

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### "No recibo mensajes en mi webhook"
1. Verificar webhook: `getWebhookInfo`
2. Revisar logs de Vercel: `vercel logs --tail`
3. Asegurar que la URL sea HTTPS

### "El bot no responde"
1. Revisar OpenAI API key
2. Verificar Supabase connection
3. Revisar logs de errores

### "OpenAI me cobra mucho"
1. Cambiar a `gpt-4o-mini` (10x más barato)
2. Limitar `max_tokens` a 500
3. Implementar caché simple

---

## 📅 CRONOGRAMA SEMANA 1

| Día | Tarea | Tiempo |
|-----|-------|--------|
| Lunes | Crear bot, setup proyecto | 1h |
| Martes | Implementar webhook básico | 2h |
| Miércoles | Agregar comandos /start, /ayuda | 2h |
| Jueves | Integrar GPT-4, probar respuestas | 2h |
| Viernes | Deploy, buscar 5 clientes | 1h |
| Sábado | Contactar clientes, cerrar 1 | 1h |
| Domingo | Documentar, planear semana 2 | 30min |

**Total: 10 horas en la semana (~1.5h/día)**

---

## 🎁 BONUS: Mensajes de Venta

### Para LinkedIn:
```
"Acabo de crear un bot de Telegram que responde los mensajes 
de tu negocio automáticamente con IA.

Si tienes una PyME y te saturan los mensajes, mándame DM.
Busco 3 negocios para probarlo gratis esta semana."
```

### Para Grupos de Facebook:
```
"🤖 ¿Te saturan los mensajes de Telegram/WhatsApp de clientes?

Estoy desarrollando un asistente de IA que responde 
automáticamente las preguntas frecuentes.

Busco negocios de [CIUDAD] para probarlo GRATIS.
Interesados comentar 👇"
```

---

## ✅ CHECKLIST PRIMERAS 24H

- [ ] Crear bot con @BotFather
- [ ] Guardar token seguro
- [ ] Clonar VoltAgent
- [ ] Crear cuenta Vercel
- [ ] Crear proyecto Supabase
- [ ] Configurar variables .env.local
- [ ] Implementar webhook básico
- [ ] Probar /start localmente
- [ ] Deploy en Vercel
- [ ] Configurar webhook
- [ ] Probar bot en Telegram
- [ ] Listar 10 contactos para ofrecerles

---

## 🎯 OBJETIVO FINAL DE ESTE DOC

**Que en 24 horas tengas:**
1. ✅ Bot de Telegram funcionando
2. ✅ Webhook configurado
3. ✅ Base de datos lista
4. ✅ Deploy en producción
5. ✅ 3-5 clientes potenciales identificados

**¿Listo para empezar?** 🚀

---

## 📞 CUANDO NECESITES AYUDA

1. **Error técnico:** Copia el error y pídele a Kimi que lo explique
2. **Duda de arquitectura:** "¿Cómo debería estructurar X?"
3. **Necesitas código:** "Dame ejemplo de Y"
4. **Stuck:** "Dame los próximos 3 pasos concretos"

**¡NO TE QUEDES ATASCADO MÁS DE 30 MINUTOS!**

Pide ayuda y sigue avanzando.

---

**¡MANOS A LA OBRA! 💪🔥**
