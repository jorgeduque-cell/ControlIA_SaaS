<div align="center">
  <h1>⚡ ControlIA SaaS</h1>
  <p>Asistente de ventas inteligente con AUTO-APRENDIZAJE y AUTO-CURACIÓN</p>
  
  <p>
    <a href="https://github.com/voltagent/voltagent"><img src="https://img.shields.io/badge/built%20with-VoltAgent-blue" alt="Built with VoltAgent" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node Version" /></a>
    <a href="#"><img src="https://img.shields.io/badge/AI-GPT--4o-purple" alt="AI Model" /></a>
  </p>
</div>

## 🚀 Sistema de Auto-Aprendizaje y Auto-Curación

ControlIA es un sistema autónomo que puede **aprender nuevas capacidades** y **auto-corregirse** cuando hay errores.

### 🎓 Auto-Aprendizaje

Cuando le pides algo que no sabe hacer, el sistema:
1. **Detecta** que es una capacidad nueva
2. **Investiga** en internet cómo implementarla
3. **Genera** el código necesario automáticamente
4. **Aplica** los cambios al sistema
5. **Confirma** que ya puede hacerlo

### 🩺 Auto-Curación (Self-Healing)

Cuando hay errores en el sistema:
- Detecta módulos faltantes y los instala automáticamente
- Genera reportes de salud del sistema
- Intenta corregir errores sin intervención humana

---

## 🎯 Capacidades Principales

- **🤖 8 Agentes Especializados**: CRM, Ventas, Inventario, Finanzas, Documentos, Contenido, Contexto y Architect
- **🧠 Auto-Aprendizaje**: El sistema aprende nuevas funcionalidades bajo demanda
- **🩺 Auto-Curación**: Se auto-repara cuando hay errores
- **🎤 Soporte de Voz**: Transcripción de audio con Whisper
- **📸 Procesamiento de Imágenes**: Análisis de fotos y documentos
- **📄 Generación de Documentos**: PDFs (cotizaciones) y Excels (listados)
- **💰 Cálculo de Márgenes**: Automático con 8% sobre costo
- **📊 Finanzas**: Estado de resultados, flujo de caja, cuentas por cobrar
- **🤖 Integración Telegram**: Bot interactivo con mensajes de voz y fotos

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    SUPERVISOR AGENT                     │
│              (Orquestador Principal)                    │
└─────────────────────┬───────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
┌───▼────┐    ┌──────▼──────┐   ┌──────▼──────┐
│  CRM   │    │   Sales     │   │  Inventory  │
│ Agent  │    │   Agent     │   │   Agent     │
└────────┘    └─────────────┘   └─────────────┘
┌────────┐    ┌─────────────┐   ┌─────────────┐
│Finance │    │  Document   │   │  Content    │
│ Agent  │    │   Agent     │   │   Agent     │
└────────┘    └─────────────┘   └─────────────┘
┌────────┐    ┌─────────────┐
│Context │    │  ARCHITECT  │◄── Auto-aprendizaje
│ Agent  │    │   Agent     │    Auto-curación
└────────┘    └─────────────┘
```

---

## ⚡ Quick Start

### Requisitos

- Node.js 20+
- PostgreSQL (o usar la instancia en Render)
- OpenAI API Key
- Telegram Bot Token

### Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Generar cliente Prisma
npx prisma generate

# Compilar
npm run build

# Iniciar
npm start
```

### Desarrollo

```bash
# Modo desarrollo con hot reload
npm run dev
```

---

## 🧠 Cómo Funciona el Auto-Aprendizaje

### Ejemplo 1: Leer Códigos QR

**Usuario:** "Quiero que el sistema lea códigos QR"

**ControlIA:**
1. Detecta que no tiene esta capacidad
2. Busca "nodejs qr code reader library" en internet
3. Genera el código necesario
4. Crea `src/tools/vision/qr-reader.ts`
5. Responde: "🎓 He aprendido a leer QR. Ahora puedo procesarlos."

### Ejemplo 2: Conectar con WhatsApp

**Usuario:** "Conecta el sistema con WhatsApp"

**ControlIA:**
1. Investiga WhatsApp Business API
2. Crea un adapter para WhatsApp
3. Integra al sistema
4. Confirma: "🎓 WhatsApp integrado. Ahora puedes recibir pedidos por WhatsApp."

---

## 🩺 Cómo Funciona la Auto-Curación

### Ejemplo 1: Módulo Faltante

**Error:** `Cannot find module 'axios'`

**ControlIA:**
1. Detecta el error automáticamente
2. Ejecuta `npm install axios`
3. Reinicia si es necesario
4. Confirma: "✅ Módulo axios instalado automáticamente"

### Ejemplo 2: Reporte de Salud

**Usuario:** "Muestrame el estado del sistema"

**ControlIA:**
1. Genera reporte de errores recientes
2. Muestra estadísticas de auto-curación
3. Lista módulos instalados automáticamente

---

## 📁 Estructura del Proyecto

```
controlia-agent/
├── src/
│   ├── agents/              # 8 agentes especializados
│   │   ├── architect.ts     # Agente arquitecto (auto-aprendizaje)
│   │   ├── crm.ts
│   │   ├── sales.ts
│   │   ├── inventory.ts
│   │   ├── finance.ts
│   │   ├── document.ts
│   │   ├── content.ts
│   │   └── context.ts
│   ├── adapters/
│   │   └── telegram.ts      # Bot de Telegram (voz + fotos)
│   ├── services/
│   │   ├── self-healing.ts  # Sistema de auto-curación
│   │   └── error-monitor.ts # Monitoreo de errores
│   ├── tools/
│   │   ├── architect/       # Herramientas de auto-aprendizaje
│   │   │   ├── learn-and-implement.ts
│   │   │   └── self-healing.ts
│   │   └── ...
│   ├── prompts/             # Prompts de los agentes
│   └── index.ts             # Punto de entrada
├── prisma/
│   └── schema.prisma        # Modelo de datos
└── dist/                    # Código compilado
```

---

## 🛠️ Agentes Disponibles

| Agente | Capacidades |
|--------|-------------|
| **CRM** | Clientes, notas de visita, pipeline |
| **Sales** | Pedidos, cotizaciones, cobranzas |
| **Inventory** | Stock, alertas, catálogo de productos |
| **Finance** | Estado de resultados, flujo de caja, rentabilidad |
| **Document** | PDFs (cotizaciones), Excels (exportaciones) |
| **Content** | Posts para redes sociales, newsletters |
| **Context** | Memoria semántica, búsqueda inteligente |
| **Architect** | Auto-aprendizaje, auto-curación, procesamiento de imágenes |

---

## 📋 Comandos del Sistema

### Auto-Aprendizaje
- "Aprende a [hacer algo nuevo]" → Activa auto-aprendizaje
- "Necesito que el sistema [nueva funcionalidad]" → Architect Agent investiga e implementa

### Auto-Curación
- "Arregla el error" → Intenta auto-corregir
- "Estado del sistema" → Reporte de salud
- "Autocorregir" → Ejecuta self-healing

### Consultas
- "Ver clientes" → Lista de clientes
- "Inventario" → Stock actual
- "Crear cotización" → PDF de cotización
- "Estado de resultados" → Reporte financiero

---

## 🔐 Seguridad

- Modo single-user (guardrails deshabilitados)
- Validación de inputs
- No exponer secrets en logs
- Auditoría de cambios del Architect Agent

---

## 🐳 Docker

```bash
# Build
docker build -t controlia-agent .

# Run
docker run -p 3141:3141 --env-file .env controlia-agent
```

---

## 📚 Recursos

- **VoltAgent Docs**: [voltagent.dev/docs](https://voltagent.dev/docs/)
- **Prisma**: [prisma.io](https://www.prisma.io/)
- **OpenAI**: [platform.openai.com](https://platform.openai.com/)

---

<div align="center">
  <p>Built with ❤️ using <a href="https://voltagent.dev">VoltAgent</a></p>
  <p>🎓 Auto-aprendizaje | 🩺 Auto-curación | 🤖 IA Avanzada</p>
</div>
