# 🛠️ KIT DE INICIO - Empezar Hoy Mismo
## Código, Prompts y Configuración para tu Primer Agente en 24h

---

## ⚡ SETUP RÁPIDO (30 minutos)

### Paso 1: Clonar y Configurar (10 min)
```bash
# Clonar VoltAgent
git clone https://github.com/VoltAgent/voltagent.git openclaw-solo
cd openclaw-solo

# Crear tu rama
git checkout -b latam-solo-v1

# Instalar dependencias
npm install

# Instalar dependencias adicionales para WhatsApp
npm install @whatsapp-cloud-api/sdk bull ioredis
```

### Paso 2: Variables de Entorno (5 min)
Crear archivo `.env.local`:
```env
# OpenAI (obtener en platform.openai.com)
OPENAI_API_KEY=sk-...

# Supabase (crear proyecto gratis en supabase.com)
SUPABASE_URL=https://....supabase.co
SUPABASE_ANON_KEY=eyJ...

# Redis (redis.io - gratis 30MB)
REDIS_URL=redis://default:...@....redis-cloud.com:... 

# WhatsApp Business API (developers.facebook.com)
WHATSAPP_TOKEN=EAA...
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_WEBHOOK_VERIFY_TOKEN=tu_token_secreto_123

# App
NEXTAUTH_SECRET=generar_con_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

### Paso 3: Configurar Supabase (10 min)
1. Ir a supabase.com → New Project (gratis)
2. SQL Editor → New Query → Pegar:

```sql
-- Tabla de empresas/clientes
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp_number TEXT UNIQUE,
  plan TEXT DEFAULT 'starter',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de conversaciones
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  messages JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de agentes
CREATE TABLE agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Paso 4: Correr Local (5 min)
```bash
npm run dev
# Abrir http://localhost:3000
```

---

## 🤖 PROMPTS PARA KIMI CODE

### Prompt 1: Handler de WhatsApp
```
Crea un archivo src/handlers/whatsapp.ts que:
1. Reciba webhooks de WhatsApp Business API
2. Valide el verify token
3. Extraiga: número de teléfono, mensaje, nombre del contacto
4. Guarde en Supabase (tabla conversations)
5. Responda con "Mensaje recibido" HTTP 200

Usa el SDK oficial de Meta. Incluye manejo de errores y logging.
```

### Prompt 2: Agente de Ventas
```
Crea src/agents/sales-agent.ts usando VoltAgent que:
1. Reciba el historial de conversación
2. Use GPT-4o-mini para generar respuesta
3. Tenga personalidad de vendedor amable latinoamericano
4. Pida datos del cliente si no los tiene (nombre, email)
5. Ofrezca catálogo de productos
6. Guarde la respuesta en Supabase

El prompt del sistema debe ser en español y muy específico.
```

### Prompt 3: Dashboard Simple
```
Crea una página en app/(dashboard)/conversations/page.tsx con:
1. Lista de conversaciones activas (de Supabase)
2. Chat en tiempo real (usar Supabase realtime)
3. Botón para ver detalle de conversación
4. Filtro por estado (active, closed)

Usar Tailwind CSS, shadcn/ui components. Que se vea profesional pero simple.
```

### Prompt 4: API Routes
```
Crea las siguientes API routes en Next.js:
1. /api/webhook/whatsapp - POST para recibir mensajes
2. /api/agents - CRUD completo
3. /api/conversations - Listar y actualizar
4. /api/send-message - Enviar mensaje de vuelta

Todas deben validar autenticación con NextAuth.
```

---

## 📱 FLUJO COMPLETO DE WHATSAPP

### Diagrama del Flujo:
```
Cliente envía WhatsApp
        ↓
Meta/WhatsApp API
        ↓
TU /api/webhook/whatsapp (Vercel)
        ↓
Guardar en Supabase
        ↓
Procesar con VoltAgent + GPT-4
        ↓
Enviar respuesta vía WhatsApp API
        ↓
Cliente recibe respuesta
```

### Código Base (whatsapp-webhook.ts):
```typescript
// app/api/webhook/whatsapp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Extraer datos del mensaje
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    
    if (!message) {
      return NextResponse.json({ success: true });
    }
    
    const phone = message.from;
    const text = message.text?.body || '';
    const name = value?.contacts?.[0]?.profile?.name || 'Desconocido';
    
    // Guardar en Supabase
    const { data: conversation, error } = await supabase
      .from('conversations')
      .upsert({
        customer_phone: phone,
        customer_name: name,
        messages: [{ role: 'user', content: text, timestamp: new Date() }]
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // TODO: Procesar con agente y responder
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Verificación del webhook
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge);
  }
  
  return new NextResponse('Forbidden', { status: 403 });
}
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
Mensaje de WhatsApp:
```
"Hola [Nombre], estoy creando un sistema de IA que responde 
automáticamente los mensajes de WhatsApp de tus clientes. 
Te interesaría probarlo gratis por 1 semana? 
Solo necesito que me des acceso a tu WhatsApp Business."
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
| OpenAI API | $20-30 |
| Vercel Pro (opcional) | $0 |
| Supabase | $0 (gratis) |
| Redis | $0 (gratis) |
| WhatsApp API | $0-10 |
| **TOTAL** | **$20-40/mes** |

### Mes 4+ (Con clientes):
| Concepto | Monto |
|----------|-------|
| Ingresos (10 clientes × $50) | $500 |
| Costos fijos | -$50 |
| **GANANCIA** | **$450/mes** |

---

## 🚀 DEPLOY EN VERCEL (5 min)

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel --prod

# 4. Configurar variables de entorno en dashboard
vercel env add OPENAI_API_KEY
vercel env add SUPABASE_URL
# ... etc
```

---

## 📊 METRICAS A SEGUIR

### Métricas Técnicas (Dashboard)
- Mensajes procesados/día
- Tiempo de respuesta promedio
- Errores/alertas
- Uso de tokens OpenAI

### Métricas de Negocio (Spreadsheet)
- Clientes activos
- MRR (Monthly Recurring Revenue)
- Churn (clientes que se van)
- CAC (Costo de adquisición)
- LTV (Lifetime Value)

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### "No me funciona el webhook de WhatsApp"
1. Verificar que la URL sea https (no http)
2. Verificar token de verificación
3. Revisar logs en Vercel: `vercel logs --tail`

### "OpenAI me cobra mucho"
1. Cambiar a GPT-4o-mini (10x más barato)
2. Limitar tokens de respuesta
3. Implementar caching simple

### "No consigo clientes"
1. Bajar el precio a $15-20/mes inicialmente
2. Ofrecer 2 meses gratis
3. Ir puerta a puerta a comercios locales

---

## 📅 CRONOGRAMA SEMANA 1

| Día | Tarea | Tiempo |
|-----|-------|--------|
| Lunes | Setup proyecto, Supabase, variables | 2h |
| Martes | Implementar webhook WhatsApp | 3h |
| Miércoles | Crear agente básico con GPT-4 | 3h |
| Jueves | Dashboard simple, probar flujo | 3h |
| Viernes | Deploy, buscar 5 clientes potenciales | 2h |
| Sábado | Contactar clientes, cerrar 1 | 2h |
| Domingo | Documentar, planear semana 2 | 1h |

**Total: 16 horas en la semana (2-3h/día)**

---

## 🎁 BONUS: Prompts de Marketing

### Para LinkedIn:
```
"Acabo de crear un agente de IA que responde los WhatsApp 
de tu negocio automáticamente. 

Si tienes una PyME y te saturan los mensajes, mándame DM.
Busco 3 negocios para probarlo gratis esta semana."
```

### Para Grupos de Facebook:
```
"🤖 ¿Te saturan los mensajes de WhatsApp de clientes?

Estoy desarrollando un asistente de IA que responde 
automáticamente las preguntas frecuentes.

Busco negocios de [CIUDAD] para probarlo GRATIS.
Interesados comentar 👇"
```

---

## ✅ CHECKLIST PRIMERAS 24H

- [ ] Clonar VoltAgent
- [ ] Crear proyecto Supabase
- [ ] Configurar variables .env.local
- [ ] Crear tablas en Supabase
- [ ] Implementar webhook WhatsApp básico
- [ ] Probar webhook con curl o Postman
- [ ] Deploy en Vercel
- [ ] Configurar webhook en Facebook Developers
- [ ] Enviar primer mensaje de prueba
- [ ] Listar 10 contactos para ofrecerles el servicio

---

## 🎯 OBJETIVO FINAL DE ESTE DOC

**Que en 24 horas tengas:**
1. ✅ Sistema básico funcionando
2. ✅ WhatsApp conectado
3. ✅ Base de datos lista
4. ✅ Deploy en producción
5. ✅ 3-5 clientes potenciales identificados

**¿Listo para empezar?** 🚀

---

## 📞 CUANDO NECESITES AYUDA

1. **Error técnico:** Copia el error y pídele a Kimi que lo explique
2. **Duda de arquitectura:** Pregunta "¿Cómo debería estructurar X?"
3. **Necesitas código:** Describe lo que quieres y pide ejemplo
4. **Stuck:** Pide "Dame los próximos 3 pasos concretos"

**¡NO TE QUEDES ATASCADO MÁS DE 30 MINUTOS!**

Pide ayuda y sigue avanzando.

---

**¡MANOS A LA OBRA! 💪🔥**
