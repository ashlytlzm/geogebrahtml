# Guía de Despliegue en la Web (Vite + FastAPI)

Este proyecto consta de dos partes:
1. **Frontend**: Una aplicación de React construida con Vite (`/`).
2. **Backend**: Un servicio web en Python con FastAPI y SymPy (`/backend`).

A continuación, se detalla el paso a paso para subir y desplegar ambos componentes de forma gratuita y profesional.

---

## Paso 1: Subir tu Código a GitHub

Para desplegar en servicios modernos como Vercel y Render, es recomendable tener el código en un repositorio de GitHub.

1. Abre tu terminal e inicializa Git (si aún no lo has hecho):
   ```bash
   git init
   git add .
   git commit -m "Preparando configuración de despliegue"
   ```
2. Crea un repositorio vacío en **[GitHub](https://github.com/)** llamado `geogebrahtml`.
3. Vincula tu repositorio local y sube los cambios:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/geogebrahtml.git
   git branch -M main
   git push -u origin main
   ```

---

## Paso 2: Desplegar el Backend en Render

**[Render](https://render.com/)** es una plataforma excelente y gratuita para alojar servicios backend en Python (FastAPI).

1. Regístrate o inicia sesión en **Render** (puedes usar tu cuenta de GitHub).
2. Haz clic en el botón **New +** y selecciona **Web Service**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio `geogebrahtml`.
4. Configura el servicio con los siguientes datos:
   * **Name**: `geogebrahtml-backend` (o el nombre que prefieras).
   * **Region**: Selecciona la más cercana a ti (por ejemplo, `Ohio (us-east-2)` o `Frankfurt (eu-central-1)`).
   * **Branch**: `main`
   * **Root Directory**: `backend` *(¡Importante! Esto le dice a Render que ejecute el backend desde esa carpeta)*.
   * **Runtime**: `Python` (se detectará automáticamente).
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   * **Instance Type**: Selecciona el plan **Free** (Gratuito).

5. Despliega la pestaña **Advanced** y añade las siguientes **Variables de Entorno (Environment Variables)**:
   * `ALLOWED_ORIGINS`: `*` *(o la URL de tu frontend en Vercel una vez la tengas, por seguridad)*.
   * `PYTHON_VERSION`: `3.10.0` (o la versión que uses localmente).

6. Haz clic en **Create Web Service**. 
   > **Nota**: El backend tardará un par de minutos en compilarse y activarse. Render te dará una URL pública tipo `https://geogebrahtml-backend.onrender.com`. Cópiala, la necesitarás para el frontend.

---

## Paso 3: Desplegar el Frontend en Vercel

**[Vercel](https://vercel.com/)** es la plataforma líder y gratuita para alojar frontends estáticos como aplicaciones React + Vite.

1. Regístrate o inicia sesión en **Vercel** usando tu cuenta de GitHub.
2. Haz clic en **Add New...** -> **Project**.
3. Importa tu repositorio `geogebrahtml`.
4. Configura el proyecto con los siguientes parámetros:
   * **Framework Preset**: `Vite` (se detecta automáticamente).
   * **Root Directory**: Deja este campo vacío (se construirá desde la raíz del repositorio, ya que allí está el `package.json` principal).
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
   * **Install Command**: `npm install`

5. Despliega la sección **Environment Variables** y agrega la siguiente variable para conectar el frontend con tu backend de Render:
   * **Key**: `VITE_BACKEND_URL`
   * **Value**: `https://geogebrahtml-backend.onrender.com` *(reemplaza con la URL real de tu servicio web en Render)*.

6. Haz clic en **Deploy**.
   > ¡Listo! En menos de un minuto tu frontend estará publicado en una URL gratuita como `https://geogebrahtml.vercel.app`.

---

## Paso 4: Vincular CORS (Opcional por seguridad)

Por defecto, configuramos el backend para permitir solicitudes desde cualquier origen (`*`). Si deseas restringirlo para que nadie más consuma tu API:

1. Ve al panel de control de tu **Web Service en Render**.
2. Dirígete a **Environment**.
3. Edita la variable `ALLOWED_ORIGINS` y cámbiala por la URL de tu frontend en Vercel. Por ejemplo:
   * `ALLOWED_ORIGINS` = `https://geogebrahtml.vercel.app`
4. Guarda los cambios. Render reiniciará tu backend automáticamente y ahora solo aceptará peticiones de tu frontend.
