# Nuestra Aventura — versión REAL

Esta versión reemplaza el localStorage como sistema principal por Supabase cuando `config.js` tiene una URL y anon key válidas.

## Lo que ya está implementado
- Login / registro.
- Crear grupo y código de invitación.
- Añadir/eliminar miembros (admin/owner).
- Datos del viaje editables.
- Itinerario compartido y editable.
- Equipaje compartido.
- Lugares, comida y actividades.
- Chat familiar con sincronización realtime.
- Compartir ubicación manual con consentimiento.
- Mapa familiar con Leaflet/OpenStreetMap.
- Guardar ubicación del carro y abrir navegación.
- Estados de viaje: TSA, boarding, landed, baggage.
- Weather actual del destino vía Open-Meteo.
- PWA/offline cache.
- Modo local para probar la interfaz sin cuenta.

## Configuración
1. Crea un proyecto Supabase.
2. Ejecuta `supabase-schema.sql` en SQL Editor.
3. En Supabase Authentication habilita Email/Password.
4. Copia Project URL y anon public key a `config.js`.
5. Sube todos los archivos al repositorio de GitHub Pages.

## Importante
La ubicación funciona mientras el usuario autoriza y ejecuta la app; un navegador web/PWA no debe prometer el mismo seguimiento continuo en segundo plano que Find My de Apple. Para tracking de fondo de nivel nativo habría que convertir esto en una app móvil nativa/wrapper y configurar permisos de background location.

No uses una service_role key en `config.js`.
