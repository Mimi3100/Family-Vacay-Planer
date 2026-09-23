const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const CONFIG=window.APP_CONFIG||{};
const supa=(CONFIG.SUPABASE_URL&&CONFIG.SUPABASE_ANON_KEY)?supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY):null;
const localKey="nuestraAventuraLocal";
let mode=supa?"cloud":"local", user=null, group=null, selectedDay="Todos", mapObj=null, markers={};

const seed={
 trip:{name:"Nuestra Aventura",destination:"Blowing Rock, NC",start:"2026-10-03",end:"2026-10-07",flight_number:""},
 members:[],
 events:[
  ["Día 1","08:00","The Pretty Place Chapel","Greenville, SC","TRAVEL"],
  ["Día 1","11:30","Greenville SC","Paseo familiar","EXPLORE"],
  ["Día 1","13:30","Banana Soda","Belmont, NC","FOOD"],
  ["Día 1","16:00","Biscuitville","Lenoir, NC — de camino","FOOD"],
  ["Día 1","17:30","Arborcrest","Boone, NC","EXPLORE"],
  ["Día 1","19:00","West Jefferson","Slide, Dollar Tree y Frostys","SHOP"],
  ["Día 1","20:30","Blowing Rock","Llegada / alojamiento","STAY"],
  ["Día 1","21:00","The Pedalin Pig","A petición de Daisy","FOOD"],
  ["Día 2","10:00","Asheville","Exploración familiar","EXPLORE"],
  ["Día 2","14:00","Black Mountain","Paseo","EXPLORE"],
  ["Día 2","16:00","Real Gem Mining?","Confirmar disponibilidad","FAMILY"],
  ["Día 4","10:00","Banner Elk","Winery","EXPLORE"],
  ["Día 4","13:00","Beech Mountain","Montaña","EXPLORE"],
  ["Día 4","16:00","St. Bernadette Catholic Church","Linville","MEMORY"],
  ["Día 5","09:00","Bossy Beulah","Winston-Salem","FOOD"],
  ["Día 5","12:00","Buc-ee’s","Parada","TRAVEL"],
  ["Día 5","15:00","Quick Bite","Parada de comida","FOOD"],
  ["Día 5","16:30","Zaxby’s","NO HAY EN MD — confirmar antes","FOOD"]
 ],
 packing:["Documentos / IDs","Cargadores","Ropa familiar","Artículos del bebé","Snacks","Medicinas / esenciales","Carriola","Bolsa de día"],
 places:["The Pretty Place Chapel","Greenville SC","Banana Soda","Biscuitville","Arborcrest","West Jefferson","Blowing Rock","The Pedalin Pig","Asheville","Black Mountain","Real Gem Mining","Banner Elk","Beech Mountain","St. Bernadette Catholic Church","Bossy Beulah","Buc-ee’s"],
 food:["Biscuitville","Banana Soda","The Pedalin Pig","Bossy Beulah","Quick Bite","Zaxby’s"],
 activities:["Asheville","Black Mountain","Real Gem Mining","Beech Mountain","West Jefferson"],
 messages:[],
 statuses:{tsa:false,boarding:false,landed:false,bags:false,car:false}
};

function loadLocal(){try{return JSON.parse(localStorage.getItem(localKey))||structuredClone(seed)}catch{return structuredClone(seed)}}
let local=loadLocal();
function saveLocal(){localStorage.setItem(localKey,JSON.stringify(local))}
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function initials(n){return (n||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function openMap(lat,lon,label="Destino"){window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&destination_place_id=&travelmode=driving`,"_blank")}
function navSearch(q){window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,"_blank")}

async function boot(){
 if(!supa){$("#authView").classList.add("hidden");$("#app").classList.remove("hidden");initLocal();return}
 const {data}=await supa.auth.getSession(); if(data.session){user=data.session.user;await cloudInit()} else showAuth();
 supa.auth.onAuthStateChange(async(_e,s)=>{if(s){user=s.user;await cloudInit()}else showAuth()});
}
function showAuth(){$("#authView").classList.remove("hidden");$("#app").classList.add("hidden")}
async function cloudInit(){
 $("#authView").classList.add("hidden");$("#app").classList.remove("hidden");
 let {data:p}=await supa.from("profiles").select("*").eq("id",user.id).maybeSingle();
 if(!p){await supa.from("profiles").insert({id:user.id,email:user.email,name:user.user_metadata?.name||user.email.split("@")[0]});}
 let {data:m}=await supa.from("members").select("*,groups(*)").eq("user_id",user.id).maybeSingle();
 if(m){group=m.groups;mode="cloud";await loadCloud();} else {mode="cloud";group=null;renderAll();}
}
async function loadCloud(){
 const g=group.id;
 const [ev,pk,pl,fo,ac,msg,loc,sts]=await Promise.all([
  supa.from("events").select("*").eq("group_id",g).order("date").order("time"),
  supa.from("packing").select("*").eq("group_id",g).order("created_at"),
  supa.from("places").select("*").eq("group_id",g).order("created_at"),
  supa.from("food").select("*").eq("group_id",g).order("created_at"),
  supa.from("activities").select("*").eq("group_id",g).order("created_at"),
  supa.from("messages").select("*").eq("group_id",g).order("created_at"),
  supa.from("locations").select("*").eq("group_id",g),
  supa.from("travel_status").select("*").eq("group_id",g).maybeSingle()
 ]);
 local.trip={name:group.name,destination:group.destination,start:group.start_date,end:group.end_date,flight_number:group.flight_number||""};
 local.events=ev.data||[];local.packing=pk.data||[];local.places=pl.data||[];local.food=fo.data||[];local.activities=ac.data||[];local.messages=msg.data||[];local.locations=loc.data||[];local.statuses=sts.data||{};
 const mem=await supa.from("members").select("*,profiles(name,email)").eq("group_id",g);
 local.members=mem.data||[];renderAll();subscribeRealtime();
}
function subscribeRealtime(){
 if(!supa||!group)return;
 supa.channel("trip-"+group.id).on("postgres_changes",{event:"*",schema:"public",table:"events",filter:`group_id=eq.${group.id}`},()=>loadCloud())
 .on("postgres_changes",{event:"*",schema:"public",table:"packing",filter:`group_id=eq.${group.id}`},()=>loadCloud())
 .on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`group_id=eq.${group.id}`},()=>loadCloud())
 .on("postgres_changes",{event:"*",schema:"public",table:"locations",filter:`group_id=eq.${group.id}`},()=>loadCloud()).subscribe();
}
async function write(table,payload,id){
 if(mode==="local"){return}
 let q=id?supa.from(table).update(payload).eq("id",id):supa.from(table).insert(payload);
 const {error}=await q;if(error)toast(error.message);return !error
}
async function createGroup(){
 const name=prompt("Nombre del grupo","Nuestra Aventura");if(!name)return;
 const code=Math.random().toString(36).slice(2,8).toUpperCase();
 const {data:g,error}=await supa.from("groups").insert({name,destination:"Blowing Rock, NC",start_date:"2026-10-03",end_date:"2026-10-07",invite_code:code,owner_id:user.id}).select().single();
 if(error){toast(error.message);return}
 await supa.from("members").insert({group_id:g.id,user_id:user.id,role:"owner"});
 group=g;await loadCloud();toast("Grupo creado. Código: "+code)
}
async function joinGroup(){
 const code=prompt("Código de invitación");if(!code)return;
 const {data:g,error}=await supa.from("groups").select("*").eq("invite_code",code.trim().toUpperCase()).single();
 if(error){toast("Código no encontrado");return}
 await supa.from("members").insert({group_id:g.id,user_id:user.id,role:"adult"});group=g;await loadCloud()
}
async function createIfNoGroup(){if(!group){if(confirm("¿Crear un grupo nuevo?"))await createGroup();else if(confirm("¿Tienes un código de invitación?"))await joinGroup();}}
async function initLocal(){local=loadLocal();local.members=[{id:"mimi",name:"Mimi",role:"owner"},{id:"partner",name:"Partner",role:"adult"},{id:"adley",name:"Adley",role:"kid"},{id:"oliver",name:"Oliver",role:"kid"}];renderAll();loadWeather()}

function showView(name){$$(".view").forEach(v=>v.classList.remove("active-view"));$("#view-"+name)?.classList.add("active-view");$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$("#pageName").textContent=({home:"Inicio",itinerary:"Itinerario",map:"Mapa & familia",places:"Lugares",packing:"Equipaje",airport:"Viaje / aeropuerto",food:"Comida",activities:"Actividades",chat:"Familia",assistant:"NOVA",settings:"Grupo"})[name]||name;if(name==="map")setTimeout(initMap,50);if(innerWidth<761)$("#sidebar").classList.remove("open")}
function renderHome(){
 const t=local.trip,today=new Date();today.setHours(0,0,0,0);const start=new Date((t.start||"2026-10-03")+"T00:00:00");const days=Math.max(0,Math.ceil((start-today)/86400000));$("#daysLeft").textContent=days;$("#tripDates").textContent=`${fmt(t.start)} — ${fmt(t.end)}`;$("#destination").textContent=t.destination;$("#tripTitle").textContent=t.name;
 const p=local.packing||[],done=p.filter(x=>x.done===true||x[1]===true).length;$("#packPct").textContent=(p.length?Math.round(done/p.length*100):0)+"%";$("#packSub").textContent=`${done} de ${p.length}`;$("#tripProgress").style.width=Math.min(100,Math.max(4,100-days))+"%";
 $("#familyCount").textContent=`${(local.members||[]).length} personas en el grupo`;$("#familyAvatars").innerHTML=(local.members||[]).slice(0,5).map(m=>`<span>${initials(m.profiles?.name||m.name)}</span>`).join("");
 $("#nextEvents").innerHTML=(local.events||[]).slice(0,4).map(e=>`<div class="timeline-item"><time>${esc(e.time||"—")}</time><i class="timeline-dot"></i><div><strong>${esc(e.title)}</strong><small>${esc(e.description||e.desc||"")}</small></div></div>`).join("")||"<p class='muted'>No hay eventos.</p>";
}
function fmt(x){return x?new Date(x+"T12:00:00").toLocaleDateString("es-PR",{day:"numeric",month:"short"}):"—"}
function renderItinerary(){
 const days=["Todos",...new Set((local.events||[]).map(e=>e.day||"Día"))];$("#dayFilters").innerHTML=days.map(d=>`<button class="filter ${d===selectedDay?"active":""}" data-day="${esc(d)}">${esc(d)}</button>`).join("");
 $$(".filter").forEach(b=>b.onclick=()=>{selectedDay=b.dataset.day;renderItinerary()});
 const arr=selectedDay==="Todos"?local.events:local.events.filter(e=>(e.day||"Día")===selectedDay);
 $("#itineraryList").innerHTML=arr.map(e=>`<article class="event-card"><time>${esc(e.day||"")}<br><strong>${esc(e.time||"")}</strong></time><div><h3>${esc(e.title)}</h3><p>${esc(e.description||e.desc||"")}</p></div><span class="tag">${esc(e.tag||"CUSTOM")}</span><button class="delete-btn" data-del-event="${e.id||""}">×</button></article>`).join("");
 $$("[data-del-event]").forEach(b=>b.onclick=()=>deleteEvent(b.dataset.delEvent))
}
async function deleteEvent(id){if(!confirm("Eliminar este evento?"))return;if(mode==="local"){local.events=local.events.filter(e=>String(e.id)!==id);saveLocal();renderAll();return}await supa.from("events").delete().eq("id",id);await loadCloud()}
function renderPacking(){const p=local.packing||[],done=p.filter(x=>x.done===true||x[1]===true).length,pct=p.length?Math.round(done/p.length*100):0;$("#summaryPct").textContent=pct+"%";$("#summaryBar").style.width=pct+"%";$("#summaryText").textContent=`${done} / ${p.length}`;$("#packingList").innerHTML=p.map(x=>`<label class="check ${x.done?"done":x[1]?"done":""}"><input type="checkbox" ${x.done||x[1]?"checked":""} data-pack="${x.id||""}"><span>${esc(x.name||x[0])}</span><button class="delete-btn" data-del-pack="${x.id||""}">×</button></label>`).join("");$$("[data-pack]").forEach(c=>c.onchange=async()=>{const x=p.find(z=>String(z.id)===c.dataset.pack);if(mode==="local"){const i=p.indexOf(x);if(x)x.done=c.checked;else p[i][1]=c.checked;saveLocal();renderPacking()}else{await write("packing",{done:c.checked},c.dataset.pack)}});$$("[data-del-pack]").forEach(b=>b.onclick=async()=>{if(mode==="local"){local.packing=p.filter(x=>String(x.id)!==b.dataset.delPack);saveLocal();renderPacking()}else await supa.from("packing").delete().eq("id",b.dataset.delPack)})}
function card(x,type){const id=x.id||"";return `<article class="info-card"><div class="symbol">${type==="food"?"♡":type==="activity"?"✧":"⌖"}</div><h3>${esc(x.name||x[1])}</h3><p>${esc(x.description||x[2]||"")}</p><span class="chip">${esc(x.category||x[3]||"FAMILY")}</span>${type==="place"?`<button class="text-btn nav-place" data-place="${esc(x.name||x[1])}">Navegar →</button>`:""}<button class="delete-btn" data-delete="${type}" data-id="${id}">×</button></article>`}
function renderCollections(){const q=($("#placeSearch")?.value||"").toLowerCase();$("#placesGrid").innerHTML=(local.places||[]).filter(x=>(x.name||x[1]).toLowerCase().includes(q)).map(x=>card(x,"place")).join("");$("#foodGrid").innerHTML=(local.food||[]).map(x=>card(x,"food")).join("");$("#activityGrid").innerHTML=(local.activities||[]).map(x=>card(x,"activity")).join("");$$(".nav-place").forEach(b=>b.onclick=()=>navSearch(b.dataset.place));$$("[data-delete]").forEach(b=>b.onclick=()=>deleteCollection(b.dataset.delete,b.dataset.id))}
async function deleteCollection(type,id){if(!confirm("Eliminar este elemento?"))return;const table={place:"places",food:"food",activity:"activities"}[type];if(mode==="local"){local[{place:"places",food:"food",activity:"activities"}[type]]=local[{place:"places",food:"food",activity:"activities"}[type]].filter(x=>String(x.id)!==id);saveLocal();renderCollections()}else await supa.from(table).delete().eq("id",id)}
function renderChat(){$("#messages").innerHTML=(local.messages||[]).map(m=>`<div class="message ${m.user_id===user?.id||m.me?"me":""}"><strong>${esc(m.profiles?.name||m.name||"Familia")}</strong><br>${esc(m.body||m[1])}<small>${m.created_at?new Date(m.created_at).toLocaleString("es-PR"):"Ahora"}</small></div>`).join("");$("#messages").scrollTop=$("#messages").scrollHeight;$("#chatMembers").innerHTML=(local.members||[]).map(m=>memberHtml(m,false)).join("")}
function memberHtml(m,admin){const name=m.profiles?.name||m.name||m.profiles?.email||"Miembro";return `<div class="member"><span>${initials(name)}</span><div><strong>${esc(name)}</strong><small>${esc(m.role||"adult")}</small></div><i class="online-dot">●</i>${admin&&m.user_id!==user?.id?`<button class="delete-btn remove-member" data-id="${m.user_id}">×</button>`:""}</div>`}
async function renderMembers(){const ms=local.members||[];$("#membersList").innerHTML=ms.map(m=>{const name=m.profiles?.name||m.name||"Miembro";const loc=(local.locations||[]).find(l=>l.user_id===m.user_id);return `<div class="member"><span>${initials(name)}</span><div><strong>${esc(name)}</strong><small>${esc(m.role||"adult")} · ${loc?new Date(loc.updated_at).toLocaleTimeString("es-PR",{hour:"2-digit",minute:"2-digit"}):"sin ubicación"}</small></div><button class="text-btn" data-focus="${m.user_id}">Ver</button></div>`}).join("");$("#adminMembers").innerHTML=ms.map(m=>memberHtml(m,true)).join("");$$(".remove-member").forEach(b=>b.onclick=()=>removeMember(b.dataset.id))}
async function removeMember(id){if(!confirm("¿Eliminar esta persona del grupo?"))return;await supa.from("members").delete().eq("user_id",id).eq("group_id",group.id);await loadCloud()}
function renderStatuses(){$("#travelStatuses").innerHTML=[["tsa","TSA pasado","Seguridad completada"],["boarding","Abordando","Estamos en la puerta"],["landed","Aterrizamos","Ya llegamos"],["bags","Equipaje recogido","Maletas listas"]].map(([k,t,d])=>`<button class="status-card ${local.statuses?.[k]?"done":""}" data-status="${k}"><span>${local.statuses?.[k]?"✓":"○"}</span><div><strong>${t}</strong><small>${d}</small></div></button>`).join("");$$("[data-status]").forEach(b=>b.onclick=async()=>{const k=b.dataset.status;local.statuses[k]=!local.statuses[k];if(mode==="cloud")await supa.from("travel_status").upsert({group_id:group.id,...local.statuses});else saveLocal();renderStatuses()});$("#flightInfo").textContent=local.trip.flight_number?`Vuelo ${local.trip.flight_number} · La app puede mostrar enlaces de seguimiento del proveedor que conectes.`:"No hay número de vuelo configurado."}
function renderSettings(){const t=local.trip;$("#tripNameInput").value=t.name||"";$("#tripDestinationInput").value=t.destination||"";$("#tripStartInput").value=t.start||"";$("#tripEndInput").value=t.end||"";$("#flightNumberInput").value=t.flight_number||""}
function renderAll(){renderHome();renderItinerary();renderCollections();renderPacking();renderChat();renderStatuses();renderMembers();renderSettings();loadWeather()}
async function loadWeather(){try{const q=encodeURIComponent(local.trip.destination||"Blowing Rock, NC");const g=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`).then(r=>r.json());const r=g.results?.[0];if(!r)return;const w=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit`).then(r=>r.json());$("#weatherTemp").textContent=Math.round(w.current.temperature_2m)+"°F";$("#weatherDesc").textContent="Ahora";$("#weatherMeta").textContent=`Viento ${Math.round(w.current.wind_speed_10m)} mph`;}catch{$("#weatherMeta").textContent="Sin conexión"}}
function initMap(){if(mapObj)return;mapObj=L.map("map").setView([36.135,-81.677],10);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors"}).addTo(mapObj);renderMapMarkers()}
function renderMapMarkers(){if(!mapObj)return;(local.locations||[]).forEach(l=>{if(markers[l.user_id])markers[l.user_id].remove();markers[l.user_id]=L.marker([l.lat,l.lon]).addTo(mapObj).bindPopup(esc(l.name||"Familia"));});const car=local.car;if(car){if(markers.car)markers.car.remove();markers.car=L.marker([car.lat,car.lon]).addTo(mapObj).bindPopup("🚗 Mi carro")}}
async function shareLocation(){if(!navigator.geolocation){toast("Este navegador no permite ubicación.");return}navigator.geolocation.getCurrentPosition(async pos=>{const payload={group_id:group?.id,user_id:user?.id,lat:pos.coords.latitude,lon:pos.coords.longitude,name:user?.user_metadata?.name||user?.email||"Yo",updated_at:new Date().toISOString()};if(mode==="cloud"){await supa.from("locations").upsert(payload,{onConflict:"group_id,user_id"})}else{local.locations=local.locations||[];local.locations=local.locations.filter(x=>x.user_id!=="local");local.locations.push({...payload,user_id:"local"});saveLocal()}renderMapMarkers();toast("Ubicación compartida ✦")},()=>toast("No se pudo obtener la ubicación."),{enableHighAccuracy:true,maximumAge:15000,timeout:15000})}
async function saveCar(){navigator.geolocation?.getCurrentPosition(async p=>{const car={lat:p.coords.latitude,lon:p.coords.longitude,updated_at:new Date().toISOString()};if(mode==="cloud")await supa.from("parking").upsert({group_id:group.id,user_id:user.id,...car});local.car=car;saveLocal();renderMapMarkers();$("#carStatus").textContent="Guardado "+new Date().toLocaleTimeString("es-PR");toast("Carro guardado 🚗")},()=>toast("Permite ubicación para guardar el carro."))}
async function findCar(){if(!local.car){toast("Primero guarda el carro.");return}openMap(local.car.lat,local.car.lon,"Mi carro")}
function addEvent(){const title=prompt("Nombre del evento");if(!title)return;const day=prompt("Día","Día 1")||"Día 1",time=prompt("Hora","10:00")||"10:00",desc=prompt("Descripción","Añadido por la familia.")||"";if(mode==="local"){local.events.push({id:crypto.randomUUID(),day,time,title,description:desc,tag:"CUSTOM"});saveLocal();renderAll()}else write("events",{group_id:group.id,day,time,title,description:desc,tag:"CUSTOM",date:local.trip.start}).then(loadCloud)}
function addPack(){const n=prompt("¿Qué quieres añadir al equipaje?");if(!n)return;if(mode==="local"){local.packing.push({id:crypto.randomUUID(),name:n,done:false});saveLocal();renderPacking()}else write("packing",{group_id:group.id,name:n,done:false}).then(loadCloud)}
function addPlace(){const n=prompt("Nombre del lugar");if(!n)return;const d=prompt("Descripción","Lugar para la familia")||"";if(mode==="local"){local.places.push({id:crypto.randomUUID(),name:n,description:d,category:"FAMILY"});saveLocal();renderCollections()}else write("places",{group_id:group.id,name:n,description:d,category:"FAMILY"}).then(loadCloud)}
function addFood(){const n=prompt("Restaurante/comida");if(!n)return;if(mode==="local"){local.food.push({id:crypto.randomUUID(),name:n,description:"Añadido por la familia",category:"FOOD"});saveLocal();renderCollections()}else write("food",{group_id:group.id,name:n,description:"Añadido por la familia",category:"FOOD"}).then(loadCloud)}
function addActivity(){const n=prompt("Actividad");if(!n)return;if(mode==="local"){local.activities.push({id:crypto.randomUUID(),name:n,description:"Añadida por la familia",category:"FAMILY"});saveLocal();renderCollections()}else write("activities",{group_id:group.id,name:n,description:"Añadida por la familia",category:"FAMILY"}).then(loadCloud)}
function askAI(q){q=q.trim();if(!q)return;$("#aiMessages").insertAdjacentHTML("beforeend",`<div class="ai-bubble user">${esc(q)}</div>`);let a="Puedo ayudarte a organizar este viaje con los datos guardados.";const l=q.toLowerCase();if(l.includes("equip")||l.includes("falta")){const left=local.packing.filter(x=>!(x.done||x[1])).map(x=>x.name||x[0]);a=left.length?`Faltan: <b>${esc(left.join(", "))}</b>.`:"¡El equipaje está completo! ✨"}else if(l.includes("sigue")||l.includes("después")||l.includes("itiner")){const e=local.events[0];a=e?`Lo próximo guardado es <b>${esc(e.title)}</b> a las ${esc(e.time||"—")}.`:"No hay eventos guardados."}else if(l.includes("idea")||l.includes("actividad"))a="Pueden elegir una actividad de la sección Actividades y abrir navegación desde Lugares.";setTimeout(()=>$("#aiMessages").insertAdjacentHTML("beforeend",`<div class="ai-bubble">${a}</div>`),200)}
$$(".nav-item").forEach(b=>b.onclick=()=>showView(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>showView(b.dataset.jump));$("#menuBtn").onclick=()=>$("#sidebar").classList.toggle("open");$("#themeBtn").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("theme",document.body.classList.contains("light")?"light":"dark")};if(localStorage.getItem("theme")==="light")document.body.classList.add("light");
$("#addEventBtn").onclick=addEvent;$("#addPackBtn").onclick=addPack;$("#addPlaceBtn").onclick=addPlace;$("#addFoodBtn").onclick=addFood;$("#addActivityBtn").onclick=addActivity;$("#placeSearch").oninput=renderCollections;$("#shareLocationBtn").onclick=shareLocation;$("#saveCarBtn").onclick=saveCar;$("#saveCarHome").onclick=saveCar;$("#findCarBtn").onclick=findCar;$("#chatForm").onsubmit=async e=>{e.preventDefault();const body=$("#chatInput").value.trim();if(!body)return;if(mode==="local"){local.messages.push({name:"Yo",body,me:true,created_at:new Date().toISOString()});saveLocal();renderChat()}else{await supa.from("messages").insert({group_id:group.id,user_id:user.id,body});await loadCloud()}$("#chatInput").value=""};$("#aiForm").onsubmit=e=>{e.preventDefault();askAI($("#aiInput").value);$("#aiInput").value=""};$$(".suggestions button").forEach(b=>b.onclick=()=>askAI(b.dataset.q));
$("#saveTripBtn").onclick=async()=>{const t={name:$("#tripNameInput").value.trim(),destination:$("#tripDestinationInput").value.trim(),start:$("#tripStartInput").value,end:$("#tripEndInput").value,flight_number:$("#flightNumberInput").value.trim()};if(mode==="local"){local.trip=t;saveLocal();renderAll()}else{await supa.from("groups").update({name:t.name,destination:t.destination,start_date:t.start,end_date:t.end,flight_number:t.flight_number}).eq("id",group.id);group={...group,...{name:t.name,destination:t.destination,start_date:t.start,end_date:t.end,flight_number:t.flight_number}};local.trip=t;renderAll()}toast("Viaje actualizado ✦")};
$("#addMemberBtn").onclick=async()=>{if(mode!=="cloud"){toast("Crea/conecta un grupo para invitar personas.");return}alert(`Código de invitación: ${group.invite_code}\n\nComparte este código con la persona para que entre al grupo.`)};
$("#notifyBtn").onclick=()=>toast("Las notificaciones del sistema se conectan mediante el proveedor que configures.");
$("#editFlightBtn").onclick=()=>showView("settings");
$("#signOutBtn").onclick=async()=>{if(supa)await supa.auth.signOut();else{location.reload()}};
$("#demoLocalBtn").onclick=()=>{mode="local";$("#authView").classList.add("hidden");$("#app").classList.remove("hidden");initLocal()};
$$(".tab").forEach(t=>t.onclick=()=>{$$(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");$("#authSubmit").textContent=t.dataset.auth==="signup"?"Crear cuenta":"Entrar";$("#authForm").dataset.mode=t.dataset.auth});
$("#authForm").onsubmit=async e=>{e.preventDefault();if(!supa)return;const email=$("#authEmail").value.trim(),password=$("#authPassword").value;const fn=$("#authForm").dataset.mode||"login";const r=fn==="signup"?await supa.auth.signUp({email,password}):await supa.auth.signInWithPassword({email,password});if(r.error)$("#authMsg").textContent=r.error.message;else if(fn==="signup")$("#authMsg").textContent="Cuenta creada. Revisa tu email si la confirmación está activada."};
window.addEventListener("online",()=>{ $("#offline").classList.add("hidden"); if(mode==="cloud")loadCloud()});window.addEventListener("offline",()=>$("#offline").classList.remove("hidden"));
if("geolocation" in navigator){} boot();