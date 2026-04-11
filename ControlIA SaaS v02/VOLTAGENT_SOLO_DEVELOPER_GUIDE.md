# 🤖 VOLTAGENT PARA UN SOLO DEVELOPER
## Guía Práctica de Customización para Open Claw Latinoamérica

---

## 📖 ¿QUÉ ES VOLTAGENT?

VoltAgent es un **framework open-source TypeScript** para construir agentes de IA empresariales. Te da:
- ✅ Sistema de agentes con memoria
- ✅ Integración con múltiples LLMs
- ✅ Tool registry
- ✅ Workflow engine
- ✅ Observabilidad

**Tu trabajo:** Customizarlo para PyMEs latinoamericanas + WhatsApp

---

## 🎯 ARQUITECTURA SIMPLIFICADA (Tu Versión)

```
┌─────────────────────────────────────────────────────────────┐
│                    OPEN CLAW SOLO                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐  │
│  │   WhatsApp   │──────▶│   Next.js    │──────▶│ VoltAgent │  │
│  │   Business   │◀──────│   API Routes │◀──────│  Core    │  │
│  │     API      │      │              │      │          │  │
│  └──────────────┘      └──────────────┘      └────┬─────┘  │
│         │                                         │         │
│         │                                         ▼         │
│         │                              ┌─────────────────┐  │
│         │                              │   OpenAI GPT    │  │
│         │                              │   Claude/etc    │  │
│         │                              └─────────────────┘  │
│         │                                                   │
│         └────────────────────────────────▶┌──────────────┐  │
│                                           │  Supabase    │  │
│                                           │  (Postgres)  │  │
│                                           └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ CUSTOMIZACIÓN PASO A PASO

### 1. Estructura de VoltAgent (Qué tocar)

```
voltagent/
├── packages/
│   ├── core/              # ⚠️ NO TOCAR (base del framework)
│   ├── memory/            # ⚠️ NO TOCAR (sistema de memoria)
│   ├── tools/             # ⚠️ NO TOCAR (herramientas base)
│   └── ...
├── examples/              # ✅ USAR COMO REFERENCIA
│   ├── basic-agent/
│   ├── multi-agent/
│   └── ...
└── docs/
```

**Tu código va en:** `apps/openclaw-solo/` (nuevo, separado del core)

---

### 2. Crear Tu Primer Agente (Copiar y Modificar)

Basado en `examples/basic-agent/`:

```typescript
// apps/openclaw-solo/src/agents/sales-agent.ts
import { Agent, AgentConfig } from '@voltagent/core';
import { OpenAIProvider } from '@voltagent/llm';
import { SupabaseMemory } from '../memory/supabase-memory';

const salesAgentConfig: AgentConfig = {
  name: 'Vendedor Latino',
  description: 'Agente de ventas para PyMEs latinoamericanas',
  
  llm: new OpenAIProvider({
    model: 'gpt-4o-mini',  // Barato y rápido
    temperature: 0.7,
  }),
  
  memory: new SupabaseMemory({
    tableName: 'conversations',
    maxContextWindow: 10,  // Últimos 10 mensajes
  }),
  
  systemPrompt: `Eres un vendedor amable y profesional de una PyME latinoamericana.
  
REGLAS:
1. Saluda siempre con calidez latina ("¡Hola! ¿Cómo estás?")
2. Si el cliente pregunta por precios, dale el catálogo
3. Si quiere comprar, pide: nombre, dirección, teléfono
4. Sé conciso (máximo 2-3 oraciones)
5. Usa emojis ocasionalmente 😊

CATÁLOGO:
- Producto A: $50
- Producto B: $100
- Producto C: $150

Tu objetivo: Ayudar al cliente a comprar, no solo responder.`,

  tools: [
    // Herramientas que puede usar el agente
    {
      name: 'get_catalog',
      description: 'Obtener catálogo de productos',
      handler: async () => {
        return [
          { name: 'Producto A', price: 50 },
          { name: 'Producto B', price: 100 },
          { name: 'Producto C', price: 150 },
        ];
      },
    },
    {
      name: 'create_order',
      description: 'Crear pedido',
      parameters: {
        customerName: 'string',
        product: 'string',
        quantity: 'number',
      },
      handler: async ({ customerName, product, quantity }) => {
        // Guardar en Supabase
        return { orderId: '123', status: 'created' };
      },
    },
  ],
};

export const salesAgent = new Agent(salesAgentConfig);
```

---

### 3. Integrar con WhatsApp (El Conector)

```typescript
// apps/openclaw-solo/src/handlers/whatsapp-handler.ts
import { salesAgent } from '../agents/sales-agent';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function handleWhatsAppMessage(
  phone: string,
  message: string,
  name: string
) {
  try {
    // 1. Buscar o crear conversación
    let { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('customer_phone', phone)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          customer_phone: phone,
          customer_name: name,
          messages: [],
        })
        .select()
        .single();
      conversation = newConv;
    }

    // 2. Procesar con VoltAgent
    const response = await salesAgent.processMessage({
      message,
      context: {
        conversationId: conversation.id,
        customerPhone: phone,
        customerName: name,
        history: conversation.messages,
      },
    });

    // 3. Guardar en base de datos
    await supabase
      .from('conversations')
      .update({
        messages: [
          ...conversation.messages,
          { role: 'user', content: message, timestamp: new Date() },
          { role: 'assistant', content: response.text, timestamp: new Date() },
        ],
        updated_at: new Date(),
      })
      .eq('id', conversation.id);

    // 4. Enviar respuesta por WhatsApp
    await sendWhatsAppMessage(phone, response.text);

    return { success: true };
  } catch (error) {
    console.error('Error handling message:', error);
    throw error;
  }
}

async function sendWhatsAppMessage(phone: string, message: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`WhatsApp API error: ${await response.text()}`);
  }
}
```

---

### 4. API Route de Webhook

```typescript
// apps/openclaw-solo/app/api/webhook/whatsapp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppMessage } from '@/src/handlers/whatsapp-handler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Extraer datos del webhook de Meta
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    
    if (!message || message.type !== 'text') {
      return NextResponse.json({ success: true });
    }

    const phone = message.from;
    const text = message.text.body;
    const name = value?.contacts?.[0]?.profile?.name || 'Desconocido';

    // Procesar mensaje
    await handleWhatsAppMessage(phone, text, name);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Verificación del webhook (GET)
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

### 5. Dashboard Simple (Conversaciones)

```typescript
// apps/openclaw-solo/app/(dashboard)/conversations/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);

  useEffect(() => {
    // Cargar conversaciones
    loadConversations();
    
    // Suscribirse a cambios en tiempo real
    const subscription = supabase
      .channel('conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' },
        (payload) => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadConversations() {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    
    setConversations(data || []);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Conversaciones</h1>
      
      <div className="space-y-4">
        {conversations.map((conv) => (
          <div key={conv.id} className="border rounded-lg p-4 hover:bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{conv.customer_name}</h3>
                <p className="text-sm text-gray-500">{conv.customer_phone}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${
                conv.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100'
              }`}>
                {conv.status}
              </span>
            </div>
            
            {conv.messages?.length > 0 && (
              <div className="mt-3 text-sm text-gray-600">
                <p>Último mensaje: {conv.messages[conv.messages.length - 1]?.content}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 🎯 CUSTOMIZACIONES ESPECÍFICAS PARA LATAM

### 1. Personalidad "Latina"

```typescript
// En tu systemPrompt
const latinoPersonality = `Eres un vendedor de una PyME latinoamericana.

CARACTERÍSTICAS:
- Calidez: Usa "usted" pero cercano
- Emojis: Ocasionalmente 😊👍
- Horarios: Respeta horario local (no escribir de 10pm a 8am)
- Pagos: Menciona opciones (transferencia, efectivo, tarjeta)
- Entregas: Pregunta ciudad/zona para calcular envío

FRASES TÍPICAS:
- "¡Con gusto!"
- "Quedo atento/a"
- "¿En qué más puedo ayudarle?"
- "Perfecto, queda confirmado"`;
```

### 2. Catálogo Configurable por Empresa

```typescript
// Tabla en Supabase: company_catalogs
const catalogTool = {
  name: 'get_company_catalog',
  handler: async (companyId: string) => {
    const { data } = await supabase
      .from('company_catalogs')
      .select('*')
      .eq('company_id', companyId);
    
    return data?.map(item => ({
      name: item.name,
      price: item.price,
      description: item.description,
    })) || [];
  },
};
```

### 3. Detección de Intenciones (Básica)

```typescript
// Antes de llamar al LLM, detectar intención simple
function detectIntent(message: string): string {
  const lower = message.toLowerCase();
  
  if (lower.includes('precio') || lower.includes('cuánto')) return 'pricing';
  if (lower.includes('comprar') || lower.includes('quiero')) return 'purchase';
  if (lower.includes('hora') || lower.includes('dirección')) return 'info';
  if (lower.includes('gracias')) return 'thanks';
  
  return 'general';
}

// Usar para dar contexto al agente
const intent = detectIntent(userMessage);
const contextPrompt = `El usuario parece estar preguntando por: ${intent}`;
```

---

## 💰 MONETIZACIÓN CON VOLTAGENT

### Modelo de Precios Simple

```typescript
// Tabla: subscriptions
const pricingPlans = {
  starter: {
    price: 29,
    maxAgents: 1,
    maxMessages: 500,
    features: ['whatsapp', 'dashboard'],
  },
  growth: {
    price: 79,
    maxAgents: 3,
    maxMessages: Infinity,
    features: ['whatsapp', 'telegram', 'dashboard', 'analytics'],
  },
  pro: {
    price: 149,
    maxAgents: 10,
    maxMessages: Infinity,
    features: ['all_channels', 'api_access', 'priority_support'],
  },
};

// Middleware para verificar límites
async function checkSubscriptionLimits(companyId: string, action: string) {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, message_count')
    .eq('company_id', companyId)
    .single();
  
  const plan = pricingPlans[sub.plan as keyof typeof pricingPlans];
  
  if (action === 'message' && sub.message_count >= plan.maxMessages) {
    throw new Error('Límite de mensajes alcanzado');
  }
  
  return true;
}
```

---

## 🚀 DEPLOY Y TESTING

### 1. Deploy en Vercel

```bash
# Desde apps/openclaw-solo/
vercel --prod

# Configurar variables de entorno en dashboard de Vercel
vercel env add OPENAI_API_KEY
vercel env add SUPABASE_URL
# ... etc
```

### 2. Configurar Webhook en Meta

1. Ir a: https://developers.facebook.com/apps
2. Tu app → WhatsApp → Configuration
3. Webhook URL: `https://tu-app.vercel.app/api/webhook/whatsapp`
4. Verify Token: El mismo que pusiste en .env.local
5. Subscribe to messages

### 3. Testing Local (ngrok)

```bash
# Instalar ngrok
npm install -g ngrok

# Exponer localhost:3000
ngrok http 3000

# Copiar URL https y poner en Meta webhook
# Ejemplo: https://abc123.ngrok.io/api/webhook/whatsapp
```

---

## 📊 MONITOREO SIMPLE

### Logging Básico

```typescript
// utils/logger.ts
export function logConversation(
  companyId: string,
  phone: string,
  direction: 'in' | 'out',
  message: string,
  latency?: number
) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    companyId,
    phone,
    direction,
    messageLength: message.length,
    latency,
  }));
}
```

### Métricas en Supabase

```sql
-- Vista de métricas por empresa
CREATE VIEW company_metrics AS
SELECT 
  company_id,
  COUNT(*) as total_conversations,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_conversations,
  AVG(JSONB_ARRAY_LENGTH(messages)) as avg_messages_per_conversation
FROM conversations
GROUP BY company_id;
```

---

## 🎓 APRENDIZAJE CONTINUO

### Recursos VoltAgent

1. **Documentación:** https://voltagent.dev/docs/
2. **Ejemplos:** https://github.com/VoltAgent/voltagent/tree/main/examples
3. **Discord:** https://s.voltagent.dev/discord
4. **GitHub Issues:** Reportar bugs, pedir ayuda

### Patrones Avanzados (Para Después)

- Multi-agent systems (orquestador + especialistas)
- RAG con documentos de empresa
- Workflows complejos (aprobaciónes humanas)
- Fine-tuning de modelos

---

## ✅ CHECKLIST IMPLEMENTACIÓN

### Semana 1: Fundamentos
- [ ] Clonar VoltAgent
- [ ] Crear estructura `apps/openclaw-solo/`
- [ ] Configurar Supabase
- [ ] Implementar webhook WhatsApp
- [ ] Crear agente básico
- [ ] Dashboard simple
- [ ] Deploy en Vercel
- [ ] Probar flujo completo

### Semana 2: Primer Cliente
- [ ] Onboarding de empresa
- [ ] Catálogo configurable
- [ ] Sistema de precios
- [ ] Cobro con Stripe/PayU
- [ ] Buscar 3 clientes pilotos

### Semana 3-4: Iterar
- [ ] Feedback de clientes
- [ ] Mejorar prompts
- [ ] Agregar features
- [ ] Escalar a 10 clientes

---

## 🆘 SOLUCIÓN DE PROBLEMAS COMUNES

### "El agente responde mal"
- Mejorar systemPrompt (más específico)
- Agregar ejemplos few-shot
- Limitar contexto (últimos 5 mensajes)

### "WhatsApp no recibe mensajes"
- Verificar webhook URL es HTTPS
- Revisar logs de Vercel
- Confirmar token de verificación

### "OpenAI muy caro"
- Cambiar a gpt-4o-mini
- Limitar max_tokens
- Implementar caché simple

### "Base de datos lenta"
- Agregar índices en Supabase
- Limitar queries (pagination)
- Usar Redis para cache

---

## 🎯 MÉTRICAS DE ÉXITO

### Técnicas
- Latencia < 3 segundos
- Uptime > 99%
- Errores < 1%

### Negocio
- 10 clientes en 60 días
- $500 MRR en 60 días
- Churn < 10%

---

## 🚀 PRÓXIMOS PASOS

1. **AHORA:** Clonar VoltAgent
2. **HOY:** Setup básico funcionando
3. **MAÑANA:** Primer mensaje de prueba
4. **ESTA SEMANA:** 1 cliente pagando

**¡VAMOS A HACERLO REALIDAD! 💪🚀**

---

## 📞 CUANDO NECESITES AYUDA

1. **Error de código:** Pega el error a Kimi
2. **Duda de arquitectura:** "¿Cómo debería estructurar X?"
3. **Feature nuevo:** "Quiero agregar Y, ¿cómo lo hago?"
4. **Stuck:** "Dame los próximos 3 pasos"

**¡NO PARES HASTA TENER CLIENTES PAGANDO! 🔥**
