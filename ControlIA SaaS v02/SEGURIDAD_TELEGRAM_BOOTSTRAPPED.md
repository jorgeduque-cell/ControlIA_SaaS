# 🔒 SEGURIDAD PRÁCTICA - ControlIA + Telegram
## Guía de Seguridad para Un Solo Developer (Bootstrapped)

---

## 🎯 PRINCIPIO: "SEGURIDAD ADECUADA, NO PARANOIA"

Como solo developer con presupuesto limitado, necesitas **seguridad pragmática**:
- ✅ Proteger datos de clientes (obligatorio)
- ✅ Prevenir accesos no autorizados
- ✅ Cumplir normas básicas (LGPD/GDPR light)
- ❌ No gastar $10k en seguridad enterprise
- ❌ No tardar 6 meses en auditorías

**Meta:** Seguridad "suficiente" para PyMEs latinoamericanas en 90 días.

---

## 🛡️ CAPAS DE SEGURIDAD (De adentro hacia afuera)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CAPAS DE SEGURIDAD                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  NIVEL 1: DATOS          NIVEL 2: APLICACIÓN     NIVEL 3: RED      │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐  │
│  │ Encriptación │        │ Auth/Authz   │        │ HTTPS/TLS    │  │
│  │ en reposo    │        │ Validación   │        │ Firewall     │  │
│  │ Backup       │        │ Rate limiting│        │ WAF básico   │  │
│  └──────────────┘        └──────────────┘        └──────────────┘  │
│                                                                     │
│  NIVEL 4: TELEGRAM       NIVEL 5: DESARROLLO    NIVEL 6: OPS      │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐  │
│  │ Webhook      │        │ Secrets mgmt │        │ Monitoreo    │  │
│  │ secreto      │        │ Code review  │        │ Alertas      │  │
│  │ Validación   │        │ Dependencias │        │ Logs         │  │
│  └──────────────┘        └──────────────┘        └──────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ NIVEL 1: SEGURIDAD DE DATOS

### 1.1 Encriptación en Reposito (Supabase)

**✅ Ya incluido:** Supabase encripta datos automáticamente en reposo (AES-256).

**Tú debes hacer:**
```sql
-- Encriptar campos sensibles adicionales (opcional)
-- Para PII (Personally Identifiable Information)

-- Instalar extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ejemplo: Encriptar teléfonos (si quieres extra seguridad)
ALTER TABLE conversations 
ADD COLUMN customer_phone_encrypted TEXT;

-- Función para insertar encriptado
CREATE OR REPLACE FUNCTION insert_encrypted_phone(
  p_conversation_id UUID,
  p_phone TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE conversations 
  SET customer_phone_encrypted = pgp_sym_encrypt(p_phone, '${ENCRYPTION_KEY}')
  WHERE id = p_conversation_id;
END;
$$ LANGUAGE plpgsql;
```

**⚠️ Para empezar:** No necesitas esto. Supabase ya encripta todo.

### 1.2 Backup Automático

**Configurar en Supabase:**
1. Dashboard → Database → Backups
2. Habilitar "Daily backups" (gratis)
3. Configurar retención: 7 días (suficiente para empezar)

**Backup manual (antes de deploys grandes):**
```bash
# Exportar datos
pg_dump -h ${SUPABASE_HOST} -U postgres -d postgres > backup_$(date +%Y%m%d).sql
```

### 1.3 Política de Retención de Datos

```sql
-- Borrar conversaciones antiguas automáticamente (GDPR/LGPD friendly)
CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS void AS $$
BEGIN
  DELETE FROM conversations 
  WHERE created_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Ejecutar mensualmente (configurar en cron o similar)
SELECT cleanup_old_conversations();
```

---

## 2️⃣ NIVEL 2: SEGURIDAD DE APLICACIÓN

### 2.1 Validación de Webhook de Telegram

**CRÍTICO:** Validar que los webhooks vienen realmente de Telegram.

```typescript
// app/api/webhook/telegram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Validar que el webhook viene de Telegram
function validateTelegramWebhook(req: NextRequest, body: string): boolean {
  // Método 1: Secret token (recomendado)
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
  if (secretToken === process.env.TELEGRAM_WEBHOOK_SECRET) {
    return true;
  }
  
  // Método 2: Validación de IP (opcional, más seguro)
  const clientIp = req.ip || req.headers.get('x-forwarded-for');
  const telegramIps = ['149.154.160.0/20', '91.108.4.0/22']; // Rangos oficiales
  
  // Nota: En Vercel, la validación de IP puede ser compleja por proxies
  // Mejor usar el secret token
  
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text(); // Obtener raw body para validación
    
    // VALIDAR WEBHOOK
    if (!validateTelegramWebhook(req, body)) {
      console.error('Webhook no válido - posible ataque');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const update = JSON.parse(body);
    
    // Procesar mensaje...
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**Configurar secret token al crear webhook:**
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-app.vercel.app/api/webhook/telegram",
    "secret_token": "tu_secreto_super_seguro_123456"
  }'
```

### 2.2 Rate Limiting (Protección contra Spam)

```typescript
// utils/rate-limit.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function rateLimit(
  identifier: string, 
  maxRequests: number = 30, 
  windowInSeconds: number = 60
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const key = `rate_limit:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowInSeconds) * windowInSeconds;
  
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart - 1);
  multi.zadd(key, { score: now, member: `${now}-${Math.random()}` });
  multi.zcard(key);
  multi.expireat(key, windowStart + windowInSeconds);
  
  const results = await multi.exec();
  const currentCount = results[2] as number;
  
  return {
    success: currentCount <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - currentCount),
    reset: windowStart + windowInSeconds,
  };
}

// Uso en webhook
export async function POST(req: NextRequest) {
  const chatId = update.message?.chat?.id;
  
  // Rate limit por chat (30 mensajes/minuto)
  const rateLimitResult = await rateLimit(`telegram:${chatId}`, 30, 60);
  
  if (!rateLimitResult.success) {
    console.warn(`Rate limit excedido para chat ${chatId}`);
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  
  // Procesar mensaje...
}
```

**Alternativa gratis:** Usar `lru-cache` en memoria (para un solo server)
```typescript
import { LRUCache } from 'lru-cache';

const rateCache = new LRUCache<string, number[]>({
  max: 500,
  ttl: 60000, // 1 minuto
});

function checkRateLimit(key: string, maxRequests: number = 30): boolean {
  const now = Date.now();
  const requests = rateCache.get(key) || [];
  
  // Limpiar requests antiguos (> 1 minuto)
  const recentRequests = requests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  rateCache.set(key, recentRequests);
  return true;
}
```

### 2.3 Validación de Entradas

```typescript
// utils/validation.ts
import { z } from 'zod';

// Esquema para mensajes de Telegram
const TelegramMessageSchema = z.object({
  message_id: z.number(),
  from: z.object({
    id: z.number(),
    is_bot: z.boolean(),
    first_name: z.string().optional(),
    username: z.string().optional(),
  }),
  chat: z.object({
    id: z.number(),
    type: z.enum(['private', 'group', 'supergroup', 'channel']),
  }),
  text: z.string().max(4000), // Limitar longitud
  date: z.number(),
});

export function validateTelegramMessage(data: unknown) {
  return TelegramMessageSchema.safeParse(data);
}

// Uso
export async function POST(req: NextRequest) {
  const body = await req.json();
  
  const validation = validateTelegramMessage(body.message);
  if (!validation.success) {
    console.error('Mensaje inválido:', validation.error);
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  
  const message = validation.data;
  // Procesar mensaje válido...
}
```

### 2.4 Sanitización de Mensajes (XSS Prevention)

```typescript
// utils/sanitization.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeText(text: string): string {
  // Eliminar HTML potencialmente peligroso
  return DOMPurify.sanitize(text, { 
    ALLOWED_TAGS: [], // No permitir ningún HTML
    ALLOWED_ATTR: [] 
  });
}

// En el agente
const userMessage = sanitizeText(message.text);
```

---

## 3️⃣ NIVEL 3: SEGURIDAD DE RED

### 3.1 HTTPS/TLS (Obligatorio)

**✅ Automático en Vercel:** Todos los deploys incluyen HTTPS gratuito.

**Verificar:**
```bash
curl -I https://tu-app.vercel.app
# Debe mostrar: HTTP/2 200
```

### 3.2 Headers de Seguridad

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.supabase.co https://api.telegram.org https://api.openai.com;",
          },
        ],
      },
    ];
  },
};
```

### 3.3 CORS (Cross-Origin Resource Sharing)

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Solo permitir orígenes específicos
  const allowedOrigins = [
    'https://tu-dominio.com',
    'https://app.tu-dominio.com',
  ];
  
  const origin = request.headers.get('origin');
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

---

## 4️⃣ NIVEL 4: SEGURIDAD DE TELEGRAM ESPECÍFICA

### 4.1 Proteger el Token del Bot

**❌ NUNCA:**
- Hardcodear el token en el código
- Subir el token a GitHub
- Compartir el token por chat/email
- Usar el mismo token en dev y prod

**✅ SIEMPRE:**
```env
# .env.local (nunca subir a git)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# .env.example (para documentación)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

```gitignore
# .gitignore
.env.local
.env.*.local
*.pem
*.key
```

### 4.2 Rotación de Tokens

**Si sospechas que el token fue comprometido:**
```bash
# 1. Revocar token actual
# Ir a @BotFather → /mybots → Tu Bot → API Token → Revoke

# 2. Obtener nuevo token
# @BotFather generará uno nuevo automáticamente

# 3. Actualizar en Vercel
vercel env rm TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_BOT_TOKEN

# 4. Redeploy
vercel --prod
```

### 4.3 Validar Origen de Mensajes

```typescript
// Verificar que el mensaje viene de un chat permitido (opcional)
const ALLOWED_CHAT_TYPES = ['private']; // Solo chats privados, no grupos

function isValidChat(chat: any): boolean {
  return ALLOWED_CHAT_TYPES.includes(chat.type);
}

// En el webhook
if (!isValidChat(update.message.chat)) {
  console.warn('Chat type no permitido:', update.message.chat.type);
  return NextResponse.json({ success: true }); // Ignorar silenciosamente
}
```

### 4.4 Prevenir Spoofing de Usuarios

```typescript
// Verificar que el usuario no es un bot
if (update.message.from.is_bot) {
  console.warn('Mensaje de bot ignorado');
  return NextResponse.json({ success: true });
}

// Opcional: Lista blanca de usuarios (para beta cerrada)
const ALLOWED_USERS = [123456789, 987654321]; // Telegram user IDs

if (!ALLOWED_USERS.includes(update.message.from.id)) {
  await sendTelegramMessage(chatId, '⛔ Acceso no autorizado.');
  return NextResponse.json({ success: true });
}
```

---

## 5️⃣ NIVEL 5: SEGURIDAD EN DESARROLLO

### 5.1 Manejo de Secrets

**Usar Vercel para secrets:**
```bash
# Agregar secret
vercel env add TELEGRAM_BOT_TOKEN
vercel env add OPENAI_API_KEY
vercel env add SUPABASE_URL

# Listar secrets
vercel env ls

# Eliminar secret
vercel env rm TELEGRAM_BOT_TOKEN
```

**Validar secrets al inicio:**
```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(10),
});

export const env = envSchema.parse(process.env);
```

### 5.2 Dependencias Seguras

```bash
# Auditar dependencias regularmente
npm audit

# Fix automático
npm audit fix

# Verificar vulnerabilidades específicas
npm audit --json | jq '.vulnerabilities'
```

**GitHub Actions para auditoría automática:**
```yaml
# .github/workflows/security.yml
name: Security Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1' # Cada lunes

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm audit --audit-level=moderate
```

### 5.3 Code Review con Kimi

**Prompt para revisión de seguridad:**
```
"Revisa este código de webhook de Telegram por problemas de seguridad:
1. ¿Hay validación de entradas?
2. ¿Hay rate limiting?
3. ¿Hay exposición de secrets?
4. ¿Hay vulnerabilidades XSS/SQL injection?
5. ¿Qué mejoras recomiendas?"
```

---

## 6️⃣ NIVEL 6: SEGURIDAD OPERACIONAL

### 6.1 Logging y Monitoreo

```typescript
// utils/logger.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function logSecurityEvent(
  event: string,
  details: Record<string, any>,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
) {
  await supabase.from('security_logs').insert({
    event,
    details,
    severity,
    ip_address: details.ip,
    user_agent: details.userAgent,
    created_at: new Date(),
  });
  
  // Alertar en casos críticos
  if (severity === 'critical') {
    await sendAlertToAdmin(`🚨 ALERTA DE SEGURIDAD: ${event}`);
  }
}

// Uso
if (!isValidWebhook) {
  await logSecurityEvent(
    'invalid_webhook_attempt',
    { ip: req.ip, headers: req.headers },
    'high'
  );
}
```

### 6.2 Alertas de Seguridad

```typescript
// utils/alerts.ts
export async function sendAlertToAdmin(message: string) {
  // Enviar por Telegram al admin
  await sendTelegramMessage(
    process.env.ADMIN_TELEGRAM_ID!,
    `🚨 ALERTA: ${message}`
  );
  
  // Opcional: Enviar por email
  // await sendEmail(process.env.ADMIN_EMAIL!, 'Alerta de Seguridad', message);
}
```

### 6.3 Dashboard de Seguridad (Simple)

```typescript
// app/(dashboard)/security/page.tsx
export default function SecurityPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">🔒 Seguridad</h1>
      
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SecurityCard 
          title="Webhooks Hoy" 
          value="1,234" 
          status="normal" 
        />
        <SecurityCard 
          title="Intentos Fallidos" 
          value="3" 
          status="warning" 
        />
        <SecurityCard 
          title="Rate Limits" 
          value="0" 
          status="normal" 
        />
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Logs de Seguridad Recientes</h2>
        <SecurityLogsTable />
      </div>
    </div>
  );
}
```

---

## 7️⃣ CUMPLIMIENTO LGPD/GDPR (Básico)

### 7.1 Consentimiento

```typescript
// Al registrar empresa, pedir consentimiento
const consentMessage = `
📋 TÉRMINOS Y PRIVACIDAD

Al usar ControlIA, aceptas:
1. Almacenamos conversaciones para mejorar el servicio
2. No compartimos datos con terceros
3. Puedes solicitar borrado de datos en cualquier momento
4. Retenemos datos por 1 año máximo

¿Aceptas? Responde "Sí" para continuar.
`;
```

### 7.2 Derecho al Olvido

```typescript
// Comando /borrar_datos
async function handleDeleteData(chatId: number, userId: number) {
  // Verificar identidad
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('owner_telegram_id', userId)
    .single();
  
  if (!company) {
    await sendTelegramMessage(chatId, '⛔ No autorizado.');
    return;
  }
  
  // Borrar datos
  await supabase.from('conversations').delete().eq('company_id', company.id);
  await supabase.from('orders').delete().eq('company_id', company.id);
  await supabase.from('companies').delete().eq('id', company.id);
  
  await sendTelegramMessage(chatId, '✅ Tus datos han sido eliminados.');
  
  // Log para auditoría
  await logSecurityEvent('data_deletion_request', { userId }, 'medium');
}
```

### 7.3 Política de Privacidad (Template)

```markdown
# Política de Privacidad - ControlIA

## 1. Datos que Recopilamos
- Mensajes de Telegram (para procesar respuestas)
- Información de empresa (nombre, catálogo)
- Datos de clientes finales (nombre, teléfono, pedidos)

## 2. Uso de Datos
- Procesar conversaciones con IA
- Mejorar nuestros servicios
- Generar estadísticas anónimas

## 3. Retención
- Conversaciones: 1 año
- Datos de empresa: Hasta cancelación

## 4. Tus Derechos
- Acceder a tus datos
- Solicitar corrección
- Solicitar eliminación (/borrar_datos)

## 5. Contacto
Para dudas: soporte@controlia.com
```

---

## 📋 CHECKLIST DE SEGURIDAD (Antes de Launch)

### Crítico (Hacer sí o sí)
- [ ] Validar webhook con secret token
- [ ] Variables de entorno en Vercel (no en código)
- [ ] HTTPS forzado
- [ ] Rate limiting básico
- [ ] Validación de entradas
- [ ] Backup automático en Supabase
- [ ] Política de privacidad

### Importante (Hacer pronto)
- [ ] Headers de seguridad (CSP, HSTS)
- [ ] Logging de seguridad
- [ ] Alertas de intentos fallidos
- [ ] Auditoría de dependencias
- [ ] Rotación de tokens periódica

### Opcional (Después)
- [ ] Encriptación de campos sensibles
- [ ] 2FA para dashboard
- [ ] Penetration testing
- [ ] Certificación SOC 2 (cuando tengas $)

---

## 🎯 SEGURIDAD POR FASE

### Fase 1 (MVP - Mes 1)
- ✅ Validación de webhook
- ✅ Variables seguras
- ✅ HTTPS
- ✅ Rate limiting básico

### Fase 2 (PMF - Mes 2)
- ✅ Headers de seguridad
- ✅ Logging
- ✅ Política de privacidad
- ✅ Derecho al olvido

### Fase 3 (Scale - Mes 3+)
- ✅ Auditoría automática
- ✅ Alertas en tiempo real
- ✅ Dashboard de seguridad
- ✅ Penetration testing básico

---

## 💰 COSTO DE SEGURIDAD

| Item | Costo | Cuándo |
|------|-------|--------|
| HTTPS (Vercel) | $0 | Siempre |
| Validación webhook | $0 | Siempre |
| Rate limiting (Redis) | $0 | Siempre |
| Headers seguridad | $0 | Siempre |
| Backup Supabase | $0 | Siempre |
| Upstash Redis (rate limit) | $0 | Hasta 10k req/día |
| Auditoría dependencias | $0 | GitHub Actions |
| **TOTAL** | **$0** | - |

**Seguridad básica pero sólida = GRATIS**

---

## 🚀 IMPLEMENTACIÓN HOY (2 horas)

### Hora 1: Configuración Base
- [ ] Configurar webhook con secret token
- [ ] Mover variables a Vercel
- [ ] Agregar headers de seguridad
- [ ] Implementar rate limiting

### Hora 2: Validación y Logging
- [ ] Validar entradas con Zod
- [ ] Sanitizar mensajes
- [ ] Agregar logging de seguridad
- [ ] Crear política de privacidad

---

## 📞 RECURSOS

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **Vercel Security:** https://vercel.com/docs/concepts/edge-network/security
- **Supabase Security:** https://supabase.com/docs/guides/database/security
- **Telegram Bot Security:** https://core.telegram.org/bots/security

---

## ✅ MENSAJE FINAL

**Seguridad no es opcional, pero tampoco tiene que ser compleja.**

Con estas medidas básicas:
- ✅ Proteges datos de clientes
- ✅ Cumples LGPD/GDPR mínimo
- ✅ Evitas 99% de ataques comunes
- ✅ Gastas $0 adicionales

**Implementa la seguridad básica HOY, mejora gradualmente.**

**¿Listo para asegurar tu bot?** 🔒
