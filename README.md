# Linventory - Sistema de Gestión de Inventario y POS Retail

Sistema de gestión integral para comercios de ropa (Retail) desarrollado con **React**, **TypeScript**, **Tailwind CSS** y **Supabase**. Diseñado para ser moderno, rápido y fácil de usar, con soporte completo para dos idiomas (Español e Inglés).

![LIN-Fashion Header](https://via.placeholder.com/800x200?text=LIN-Fashion+POS)

## Características Principales / Key Features

- 🌍 **Bilingüe / Bilingual**: Interfaz totalmente adaptable a Español e Inglés.
- 🔐 **Gestión de Usuarios**: Autenticación segura y roles diferenciados (Admin, Cajero/Cashier, Vendedor/Sales).
- 💰 **Punto de Venta (POS)**: Interfaz de venta rápida optimizada para tiendas de ropa.
- 👕 **Gestión de Inventario**: Control de productos, tallas, stock y categorías.
- 📊 **Análisis y Reportes**: Dashboards visuales de ventas, rendimiento de empleados y movimientos de caja.
- 📅 **Turnos y Caja**: Apertura y cierre de caja con control de sesiones.
- 🧾 **Tickets**: Generación e impresión de tickets de venta.

## Tecnologías / Tech Stack

- **Frontend**: React + Vite
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS (Diseño Premium Moderno)
- **Backend & Base de Datos**: Supabase
- **Iconos**: Lucide React

## Requisitos Previos

- Node.js 18 o superior
- npm o pnpm
- Cuenta en Supabase

## Configuración / Setup

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/Ahmedelfakirben/Clothingstor-V1.git
   cd ClothingStore
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Variables de Entorno**:
   Crea un archivo `.env` basado en `.env.example` y configura tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=tu_url_supabase
   VITE_SUPABASE_ANON_KEY=tu_anon_key_supabase
   ```

4. **Base de Datos**:
   Aplica las migraciones situadas en `supabase/migrations` en tu proyecto de Supabase para crear las tablas necesarias (`products`, `orders`, `cash_register_sessions`, etc.).

5. **Iniciar Desarrollo**:
   ```bash
   npm run dev
   ```

## Estructura del Proyecto

```
src/
├── components/     # Componentes del sistema (POS, Inventario, Navegación...)
├── contexts/       # Contextos globales (Auth, Idioma/Language)
├── lib/            # Utilidades (Supabase client, helpers)
├── locales/        # Archivos de traducción (ES/EN)
└── types/          # Definiciones de tipos TypeScript
```

## Scripts

- `npm run dev`: Servidor de desarrollo
- `npm run build`: Build para producción
- `npm run preview`: Vista previa local del build
- `npm run typecheck`: Validación de tipos TS

## Seguridad

- Credenciales protegidas mediante variables de entorno.
- Políticas RLS (Row Level Security) en Supabase para proteger los datos según el rol del usuario.

---

Desarrollado para ofrecer una experiencia premium en la gestión de tiendas de moda.