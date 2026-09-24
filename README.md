# Nuestra Aventura · Family Hub V4

Real family travel app for GitHub Pages + Supabase.

## Includes
- Supabase email/password accounts with persistent sessions.
- Multiple trips per account and a trip switcher.
- Real invite-code joining through `join_group_by_invite` RPC.
- Real shared members with admin/owner removal controls.
- Editable itinerary, packing, places, food and activities.
- Rich itinerary fields: drive time, arrival/departure, duration, maps, parking, bathrooms and clothing notes.
- Family/baby/stroller flags.
- Shared chat, locations, car parking and travel status.
- OpenStreetMap/Leaflet family map.
- Current weather and seven-day forecast through Open-Meteo.
- Contextual NOVA assistant based on the current trip data.
- Offline local mode and cached last-known cloud data.
- Mobile drawer with outside-tap, Escape and left-swipe close.

## Deploy
1. Run `supabase-schema.sql` once if creating the database from zero.
2. If the old schema is already installed, run `supabase-schema-v4.sql`.
3. Keep the publishable/anon key in `config.js`; never use a service_role key.
4. Upload all project files to GitHub Pages.
