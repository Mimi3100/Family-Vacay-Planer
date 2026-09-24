/* =========================================================
   NUESTRA AVENTURA · FAMILY HUB · V4
   Real Supabase app: auth, multiple trips, shared data,
   invitations, offline cache, realtime, map, weather and NOVA.
   ========================================================= */
(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const CONFIG = window.APP_CONFIG || {};
  const SUPABASE_URL = CONFIG.SUPABASE_URL || "https://zolwiqjlboiqlwmjcnyc.supabase.co";
  const SUPABASE_KEY = CONFIG.SUPABASE_KEY || CONFIG.SUPABASE_ANON_KEY || "";
  const SITE_URL = CONFIG.SITE_URL || location.href;
  const STORAGE = {
    offline: "nuestra_aventura_offline_v4",
    currentGroup: "nuestra_aventura_current_group_v4",
    theme: "nuestra_aventura_theme_v4"
  };

  const supabaseClient = window.supabase && SUPABASE_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: localStorage,
          flowType: "pkce"
        }
      })
    : null;

  let onlineMode = !!supabaseClient && navigator.onLine;
  let currentUser = null;
  let currentGroup = null;
  let groups = [];
  let selectedDay = "Todos";
  let realtimeChannel = null;
  let mapObj = null;
  let mapMarkers = new Map();
  let modalSave = null;
  let drawerTouch = null;
  let weatherTimer = null;

  let data = emptyData();
  const offlineSeed = {
    id: "offline-trip",
    name: "Mi viaje",
    destination: "Blowing Rock, NC",
    start_date: "2026-10-02",
    end_date: "2026-10-08",
    flight_number: "",
    invite_code: "LOCAL",
    owner_id: "offline-user"
  };

  function emptyData() {
    return {
      events: [], packing: [], places: [], food: [], activities: [], messages: [],
      members: [], profiles: [], locations: [], parking: null, travel_status: null
    };
  }

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    applyTheme();
    bindEvents();
    setupDrawer();
    updateConnectionUI();

    if (!supabaseClient) {
      showAuth(false);
      enterOffline(false);
      return;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;
        currentGroup = null;
        groups = [];
        teardownRealtime();
        showAuth(true);
        return;
      }
      if (session?.user) {
        currentUser = session.user;
        queueMicrotask(() => initializeCloudUser());
      }
    });

    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (sessionData.session?.user) {
      currentUser = sessionData.session.user;
      await initializeCloudUser();
    } else {
      showAuth(true);
    }
  }

  function bindEvents() {
    $$('[data-auth-tab]').forEach(btn => btn.addEventListener("click", () => setAuthTab(btn.dataset.authTab)));
    $("#loginForm")?.addEventListener("submit", login);
    $("#signupForm")?.addEventListener("submit", signup);
    $("#forgotPasswordBtn")?.addEventListener("click", forgotPassword);
    $("#offlineBtn")?.addEventListener("click", () => enterOffline(true));
    $("#signOutBtn")?.addEventListener("click", logout);
    $("#themeBtn")?.addEventListener("click", toggleTheme);
    $("#menuBtn")?.addEventListener("click", openDrawer);
    $("#closeDrawerBtn")?.addEventListener("click", closeDrawer);
    $("#tripSwitcherBtn")?.addEventListener("click", toggleTripMenu);
    $("#createTripBtn")?.addEventListener("click", createGroup);
    $("#joinTripBtn")?.addEventListener("click", joinGroup);
    $("#homeCreateTripBtn")?.addEventListener("click", createGroup);
    $("#homeJoinTripBtn")?.addEventListener("click", joinGroup);
    $("#addEventBtn")?.addEventListener("click", () => openEventModal());
    $("#addPackBtn")?.addEventListener("click", addPacking);
    $("#addPlaceBtn")?.addEventListener("click", () => openPlaceModal());
    $("#addFoodBtn")?.addEventListener("click", () => openFoodModal());
    $("#addActivityBtn")?.addEventListener("click", () => openActivityModal());
    $("#placeSearch")?.addEventListener("input", renderPlaces);
    $("#shareLocationBtn")?.addEventListener("click", shareLocation);
    $("#saveCarBtn")?.addEventListener("click", saveCar);
    $("#saveCarHome")?.addEventListener("click", saveCar);
    $("#findCarBtn")?.addEventListener("click", findCar);
    $("#chatForm")?.addEventListener("submit", sendMessage);
    $("#aiForm")?.addEventListener("submit", askNOVA);
    $$(".suggestions button").forEach(b => b.addEventListener("click", () => askNOVA(null, b.dataset.q)));
    $("#tripForm")?.addEventListener("submit", saveTripSettings);
    $("#copyCodeBtn")?.addEventListener("click", copyInviteCode);
    $("#shareInviteBtn")?.addEventListener("click", shareInvite);
    $("#editFlightBtn")?.addEventListener("click", () => navigate("settings"));
    $("#refreshWeatherBtn")?.addEventListener("click", () => loadWeather(true));

    document.addEventListener("click", delegatedClick);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeDrawer();
        closeTripMenu();
        closeModal();
      }
    });
    window.addEventListener("online", async () => {
      onlineMode = !!supabaseClient;
      updateConnectionUI();
      if (currentUser) await loadGroups();
    });
    window.addEventListener("offline", () => {
      onlineMode = false;
      updateConnectionUI();
      loadCachedCurrentGroup();
    });
  }

  async function delegatedClick(e) {
    const nav = e.target.closest(".nav-item,[data-jump]");
    if (nav) {
      e.preventDefault();
      navigate(nav.dataset.view || nav.dataset.jump);
      return;
    }
    const edit = e.target.closest("[data-edit-table]");
    if (edit) {
      const item = data[edit.dataset.editTable]?.find(x => x.id === edit.dataset.editId);
      if (item) {
        if (edit.dataset.editTable === "places") openPlaceModal(item);
        if (edit.dataset.editTable === "food") openFoodModal(item);
        if (edit.dataset.editTable === "activities") openActivityModal(item);
      }
      return;
    }
    const editEvent = e.target.closest("[data-edit-event]");
    if (editEvent) {
      const item = data.events.find(x => x.id === editEvent.dataset.editEvent);
      if (item) openEventModal(item);
      return;
    }
    const del = e.target.closest("[data-delete-table]");
    if (del) {
      await deleteRecord(del.dataset.deleteTable, del.dataset.deleteId);
      return;
    }
    const pack = e.target.closest("[data-pack-toggle]");
    if (pack) {
      const item = data.packing.find(x => x.id === pack.dataset.packToggle);
      if (item) await updateRecord("packing", item.id, { done: pack.checked });
      return;
    }
    const remove = e.target.closest("[data-remove-member]");
    if (remove) {
      const member = data.members.find(m => m.id === remove.dataset.removeMember);
      if (member) await removeMember(member);
      return;
    }
    const trip = e.target.closest("[data-select-trip]");
    if (trip) {
      await selectGroup(trip.dataset.selectTrip);
      return;
    }
  }

  /* ---------------- AUTH ---------------- */
  function showAuth(show = true) {
    $("#authView")?.classList.toggle("hidden", !show);
    $("#app")?.classList.toggle("hidden", show);
    if (show) setAuthMessage("");
  }

  function setAuthTab(type) {
    const login = type === "login";
    $("#loginForm")?.classList.toggle("hidden", !login);
    $("#signupForm")?.classList.toggle("hidden", login);
    $$('[data-auth-tab]').forEach(b => b.classList.toggle("active", b.dataset.authTab === type));
    setAuthMessage("");
  }

  async function login(e) {
    e.preventDefault();
    if (!supabaseClient) return setAuthMessage("Supabase no está configurado.");
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    setAuthMessage("Entrando…");
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) setAuthMessage(translateError(error.message));
  }

  async function signup(e) {
    e.preventDefault();
    if (!supabaseClient) return setAuthMessage("Supabase no está configurado.");
    const name = $("#signupName").value.trim();
    const email = $("#signupEmail").value.trim();
    const password = $("#signupPassword").value;
    const password2 = $("#signupPassword2").value;
    if (password !== password2) return setAuthMessage("Las contraseñas no coinciden.");
    setAuthMessage("Creando cuenta…");
    const { data: result, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: SITE_URL }
    });
    if (error) return setAuthMessage(translateError(error.message));
    if (result.session) {
      currentUser = result.user;
      await initializeCloudUser();
    } else {
      setAuthMessage("Cuenta creada. Revisa tu email para confirmar la cuenta si Supabase tiene esa opción activada.");
    }
  }

  async function forgotPassword() {
    const email = $("#loginEmail")?.value.trim();
    if (!email) return setAuthMessage("Escribe tu email primero.");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: SITE_URL });
    setAuthMessage(error ? translateError(error.message) : "Te envié el enlace para cambiar tu contraseña.");
  }

  async function logout() {
    if (supabaseClient && currentUser) await supabaseClient.auth.signOut();
    else enterOffline(false);
  }

  async function initializeCloudUser() {
    showAuth(false);
    onlineMode = !!supabaseClient && navigator.onLine;
    await ensureProfile();
    await loadGroups();
  }

  async function ensureProfile() {
    if (!currentUser || !supabaseClient) return;
    const name = currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "Usuario";
    const { error } = await supabaseClient.from("profiles").upsert({
      id: currentUser.id, email: currentUser.email || "", name
    }, { onConflict: "id" });
    if (error) console.warn("Profile:", error.message);
  }

  /* ---------------- GROUPS ---------------- */
  async function loadGroups() {
    if (!supabaseClient || !currentUser || !onlineMode) {
      loadCachedCurrentGroup();
      return;
    }
    const { data: memberships, error } = await supabaseClient
      .from("members")
      .select("id,group_id,user_id,role,groups(*)")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Groups:", error);
      loadCachedCurrentGroup();
      toast(translateError(error.message));
      return;
    }
    groups = (memberships || []).map(m => ({ ...m.groups, my_role: m.role })).filter(Boolean);
    const savedId = localStorage.getItem(STORAGE.currentGroup);
    const next = groups.find(g => g.id === savedId) || groups[0] || null;
    currentGroup = next;
    if (currentGroup) localStorage.setItem(STORAGE.currentGroup, currentGroup.id);
    else localStorage.removeItem(STORAGE.currentGroup);
    renderTripMenu();
    await loadGroupData();
  }

  async function createGroup() {
    if (!currentUser || !supabaseClient) return toast("Inicia sesión para crear un viaje compartido.");
    const name = prompt("Nombre del viaje:", "Nuestra Aventura")?.trim();
    if (!name) return;
    const destination = prompt("Destino:", "Blowing Rock, NC")?.trim() || "";
    const start = prompt("Fecha de inicio (YYYY-MM-DD):", "2026-10-02")?.trim() || null;
    const end = prompt("Fecha de fin (YYYY-MM-DD):", "2026-10-08")?.trim() || null;
    const invite = generateInviteCode();
    const { data: g, error } = await supabaseClient.from("groups").insert({
      name, destination, start_date: start || null, end_date: end || null,
      invite_code: invite, owner_id: currentUser.id
    }).select().single();
    if (error) return toast(translateError(error.message));
    const { error: memberError } = await supabaseClient.from("members").insert({ group_id: g.id, user_id: currentUser.id, role: "owner" });
    if (memberError) return toast(translateError(memberError.message));
    await loadGroups();
    await selectGroup(g.id);
    toast(`Viaje creado · código ${invite}`);
  }

  async function joinGroup() {
    if (!currentUser || !supabaseClient) return toast("Inicia sesión para unirte a un viaje.");
    const code = prompt("Código de invitación:")?.trim().toUpperCase();
    if (!code) return;
    if (!navigator.onLine) return toast("Necesitas conexión para unirte a un viaje compartido.");
    const { data: g, error } = await supabaseClient.rpc("join_group_by_invite", { p_invite_code: code });
    if (error) return toast(translateError(error.message));
    if (!g) return toast("No encontré ese código.");
    await loadGroups();
    await selectGroup(g.id);
    toast("Te uniste al viaje.");
  }

  async function selectGroup(id) {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    currentGroup = g;
    localStorage.setItem(STORAGE.currentGroup, id);
    closeTripMenu();
    await loadGroupData();
    renderAll();
    toast(`Viaje activo: ${g.name}`);
  }

  function renderTripMenu() {
    $("#sidebarTripName").textContent = currentGroup?.name || "Sin viaje";
    const menu = $("#tripMenu");
    if (!menu) return;
    menu.innerHTML = groups.map(g => `<button class="trip-option ${g.id === currentGroup?.id ? "active" : ""}" data-select-trip="${esc(g.id)}"><strong>${esc(g.name)}</strong><small>${esc(g.destination || "Sin destino")}</small></button>`).join("") || `<div class="trip-option"><small>No hay viajes todavía.</small></div>`;
  }

  function toggleTripMenu() { $("#tripMenu")?.classList.toggle("hidden"); renderTripMenu(); }
  function closeTripMenu() { $("#tripMenu")?.classList.add("hidden"); }

  async function loadGroupData() {
    if (!currentGroup) {
      data = emptyData();
      renderAll();
      return;
    }
    if (!onlineMode || !supabaseClient || currentGroup.id === "offline-trip") {
      loadCachedDataForCurrentGroup();
      renderAll();
      return;
    }
    const gid = currentGroup.id;
    const results = await Promise.all([
      fetchRows("events", gid, "date,time,created_at"),
      fetchRows("packing", gid, "created_at"),
      fetchRows("places", gid, "created_at"),
      fetchRows("food", gid, "created_at"),
      fetchRows("activities", gid, "created_at"),
      fetchRows("messages", gid, "created_at"),
      fetchRows("members", gid, "created_at"),
      fetchRows("locations", gid, "updated_at"),
      fetchSingle("parking", gid),
      fetchSingle("travel_status", gid)
    ]);
    data.events = results[0]; data.packing = results[1]; data.places = results[2]; data.food = results[3];
    data.activities = results[4]; data.messages = results[5]; data.members = results[6]; data.locations = results[7];
    data.parking = results[8]; data.travel_status = results[9] || { group_id: gid, tsa:false, boarding:false, landed:false, bags:false };
    await loadProfiles();
    cacheCurrentGroup();
    setupRealtime();
    renderAll();
  }

  async function fetchRows(table, gid, order = "created_at") {
    const { data: rows, error } = await supabaseClient.from(table).select("*").eq("group_id", gid).order(order.split(",")[0], { ascending:true });
    if (error) { console.warn(table, error.message); return []; }
    return rows || [];
  }
  async function fetchSingle(table, gid) {
    const { data: row, error } = await supabaseClient.from(table).select("*").eq("group_id", gid).maybeSingle();
    if (error) { console.warn(table, error.message); return null; }
    return row;
  }
  async function loadProfiles() {
    const ids = data.members.map(m => m.user_id).filter(Boolean);
    if (!ids.length || !supabaseClient) { data.profiles = []; return; }
    const { data: profiles } = await supabaseClient.from("profiles").select("*").in("id", ids);
    data.profiles = profiles || [];
  }

  /* ---------------- CRUD ---------------- */
  async function insertRecord(table, values) {
    if (!currentGroup) return toast("Primero crea o selecciona un viaje.");
    if (!onlineMode || !supabaseClient || currentGroup.id === "offline-trip") {
      const row = { id: crypto.randomUUID(), group_id: currentGroup.id, created_at:new Date().toISOString(), ...values };
      if (!Array.isArray(data[table])) data[table] = [];
      data[table].push(row); saveCachedData(); renderAll(); return row;
    }
    const { data: row, error } = await supabaseClient.from(table).insert({ group_id: currentGroup.id, ...values }).select().single();
    if (error) { toast(translateError(error.message)); return null; }
    data[table].push(row); renderAll(); return row;
  }

  async function updateRecord(table, id, values) {
    if (!currentGroup) return;
    if (!onlineMode || !supabaseClient || currentGroup.id === "offline-trip") {
      const list = data[table] || []; const i = list.findIndex(x => x.id === id);
      if (i >= 0) { list[i] = {...list[i], ...values}; saveCachedData(); renderAll(); }
      return;
    }
    const { data: row, error } = await supabaseClient.from(table).update(values).eq("id", id).select().single();
    if (error) { toast(translateError(error.message)); return; }
    const i = data[table].findIndex(x => x.id === id); if (i >= 0) data[table][i] = row;
    renderAll();
  }

  async function deleteRecord(table, id) {
    if (!confirm("¿Eliminar este elemento?")) return;
    if (!onlineMode || !supabaseClient || currentGroup?.id === "offline-trip") {
      data[table] = (data[table] || []).filter(x => x.id !== id); saveCachedData(); renderAll(); return;
    }
    const { error } = await supabaseClient.from(table).delete().eq("id", id);
    if (error) return toast(translateError(error.message));
    data[table] = data[table].filter(x => x.id !== id); renderAll();
  }

  /* ---------------- MODALS ---------------- */
  function openModal(title, fields, callback) {
    $("#modalTitle").textContent = title;
    $("#modalFields").innerHTML = fields.join("");
    modalSave = callback;
    $("#modal").classList.remove("hidden");
    setTimeout(() => $("#modalFields input, #modalFields textarea")?.focus(), 20);
  }
  function closeModal() { $("#modal")?.classList.add("hidden"); $("#modalFields").innerHTML=""; modalSave=null; }
  $("#modalForm")?.addEventListener("submit", async e => {
    e.preventDefault(); if (!modalSave) return;
    const values = {};
    $$("[data-field]", $("#modalFields")).forEach(el => {
      values[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value.trim();
    });
    await modalSave(values); closeModal();
  });
  $("#modalClose")?.addEventListener("click", closeModal);
  $("#modalCancel")?.addEventListener("click", closeModal);
  $("#modalBackdrop")?.addEventListener("click", closeModal);

  function inputField(name,label,value="",type="text",required=false) {
    return `<div class="modal-field"><label>${esc(label)}<input data-field="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required?"required":""}></label></div>`;
  }
  function textField(name,label,value="") {
    return `<div class="modal-field"><label>${esc(label)}<textarea data-field="${esc(name)}" rows="3">${esc(value)}</textarea></label></div>`;
  }
  function checkField(name,label,value=false) {
    return `<label class="modal-check"><input data-field="${esc(name)}" type="checkbox" ${value?"checked":""}><span>${esc(label)}</span></label>`;
  }

  function openEventModal(item=null) {
    openModal(item?"Editar evento":"Añadir evento", [
      inputField("title","Título",item?.title||"","text",true),
      inputField("date","Fecha",item?.date||currentGroup?.start_date||"","date"),
      inputField("time","Hora",item?.time||"","time"),
      inputField("day","Día / bloque",item?.day||"Día 1"),
      inputField("departure_time","Salida sugerida",item?.departure_time||"","time"),
      inputField("arrival_time","Llegada estimada",item?.arrival_time||"","time"),
      inputField("duration_minutes","Tiempo en el lugar (min)",item?.duration_minutes||"","number"),
      inputField("drive_minutes","Manejo desde parada anterior (min)",item?.drive_minutes||"","number"),
      inputField("location","Ubicación",item?.location||""),
      inputField("maps_url","Google Maps URL",item?.maps_url||""),
      inputField("tag","Categoría",item?.tag||"CUSTOM"),
      checkField("family_friendly","Family-friendly",item?.family_friendly!==false),
      checkField("baby_friendly","Baby-friendly",!!item?.baby_friendly),
      checkField("stroller","Stroller / acceso fácil",!!item?.stroller),
      inputField("parking","Parking",item?.parking||""),
      inputField("restrooms","Baños",item?.restrooms||""),
      inputField("wear","Qué ponerse",item?.wear||""),
      textField("description","Notas",item?.description||"")
    ], async values => item ? updateRecord("events",item.id,values) : insertRecord("events",values));
  }

  async function addPacking() {
    const name = prompt("¿Qué necesitas llevar?")?.trim(); if (!name) return;
    await insertRecord("packing", {name,done:false});
  }

  function openPlaceModal(item=null) {
    openModal(item?"Editar lugar":"Añadir lugar", [
      inputField("name","Nombre",item?.name||"","text",true), inputField("category","Categoría",item?.category||"FAMILY"),
      inputField("maps_url","Google Maps URL",item?.maps_url||""), inputField("rating","Rating",item?.rating||"","number"), inputField("review_count","Cantidad de reviews",item?.review_count||"","number"),
      checkField("family_friendly","Family-friendly",item?.family_friendly!==false), checkField("baby_friendly","Baby-friendly",!!item?.baby_friendly), checkField("stroller","Stroller / acceso fácil",!!item?.stroller),
      inputField("parking","Parking",item?.parking||""), inputField("restrooms","Baños",item?.restrooms||""), textField("description","Descripción",item?.description||"")
    ], async values => item ? updateRecord("places",item.id,values) : insertRecord("places",values));
  }
  function openFoodModal(item=null) {
    openModal(item?"Editar comida":"Añadir comida", [inputField("name","Nombre",item?.name||"","text",true),inputField("category","Categoría",item?.category||"QUICK BITE"),inputField("maps_url","Google Maps URL",item?.maps_url||""),inputField("rating","Rating",item?.rating||"","number"),inputField("review_count","Reviews",item?.review_count||"","number"),textField("description","Notas",item?.description||"")], async values=>item?updateRecord("food",item.id,values):insertRecord("food",values));
  }
  function openActivityModal(item=null) {
    openModal(item?"Editar actividad":"Añadir actividad", [inputField("name","Nombre",item?.name||"","text",true),inputField("category","Categoría",item?.category||"FAMILY"),inputField("maps_url","Google Maps URL",item?.maps_url||""),inputField("duration_minutes","Duración (min)",item?.duration_minutes||"","number"),checkField("family_friendly","Family-friendly",item?.family_friendly!==false),checkField("baby_friendly","Baby-friendly",!!item?.baby_friendly),checkField("stroller","Stroller / acceso fácil",!!item?.stroller),textField("description","Descripción",item?.description||"")], async values=>item?updateRecord("activities",item.id,values):insertRecord("activities",values));
  }

  /* ---------------- RENDER ---------------- */
  function renderAll() {
    renderTripMenu(); renderHome(); renderItinerary(); renderPacking(); renderPlaces(); renderFood(); renderActivities(); renderChat(); renderMembers(); renderStatuses(); renderSettings(); renderMapMarkers(); renderWear();
    if (currentGroup) loadWeather();
  }

  function renderHome() {
    const noTrip = !currentGroup;
    $("#noTripHome")?.classList.toggle("hidden", !noTrip);
    $("#tripHomeContent")?.classList.toggle("hidden", noTrip);
    const t=currentGroup||{};
    $("#tripTitle").textContent=t.name||"Crea tu primer viaje";
    $("#destination").textContent=t.destination||"—";
    $("#tripDates").textContent=t.start_date||t.end_date?`${fmt(t.start_date)} — ${fmt(t.end_date)}`:"—";
    const days = daysUntil(t.start_date); $("#daysLeft").textContent=days===null?"—":days;
    const total=data.packing.length, done=data.packing.filter(x=>x.done).length, pct=total?Math.round(done/total*100):0;
    $("#packPct").textContent=`${pct}%`; $("#packSub").textContent=`${done} de ${total}`; $("#tripProgress").style.width=`${pct}%`;
    $("#familyCount").textContent=data.members.length;
    $("#nextEvents").innerHTML=data.events.slice().sort(sortEvents).slice(0,5).map(e=>`<div class="timeline-item"><time>${esc(e.time||"—")}</time><i class="timeline-dot"></i><div><strong>${esc(e.title)}</strong><small>${esc(e.location||e.description||"")}</small></div></div>`).join("")||`<p class="muted">No hay eventos todavía.</p>`;
    $("#weatherMeta").textContent=currentGroup?"Clima del destino":"Clima";
  }

  function renderItinerary() {
    const events=data.events.slice().sort(sortEvents); const days=["Todos",...new Set(events.map(e=>e.day||"Sin día"))];
    if(!days.includes(selectedDay)) selectedDay="Todos";
    $("#dayFilters").innerHTML=days.map(d=>`<button class="filter ${d===selectedDay?"active":""}" data-day-filter="${esc(d)}">${esc(d)}</button>`).join("");
    $$('[data-day-filter]').forEach(b=>b.addEventListener("click",()=>{selectedDay=b.dataset.dayFilter;renderItinerary()}));
    const arr=selectedDay==="Todos"?events:events.filter(e=>(e.day||"Sin día")===selectedDay);
    $("#itineraryList").innerHTML=arr.map(e=>`<article class="event-card"><div class="event-time"><span>${esc(e.day||"")}</span><strong>${esc(e.time||"Sin hora")}</strong></div><div><div class="event-meta"><span class="tag">${esc(e.tag||"CUSTOM")}</span>${e.drive_minutes?`<span class="tag">${esc(e.drive_minutes)} min drive</span>`:""}${e.duration_minutes?`<span class="tag">${esc(e.duration_minutes)} min</span>`:""}</div><h3>${esc(e.title)}</h3><p>${esc(e.location||e.description||"")}</p><div class="micro-meta">${e.departure_time?`Salida ${esc(e.departure_time)} · `:""}${e.arrival_time?`Llegada ${esc(e.arrival_time)} · `:""}${e.wear?`Qué ponerse: ${esc(e.wear)}`:""}</div></div><div class="card-actions"><button class="edit-btn" data-edit-event="${esc(e.id)}">Editar</button><button class="delete-btn" data-delete-table="events" data-delete-id="${esc(e.id)}">Eliminar</button>${e.maps_url?`<a class="edit-btn" href="${safeUrl(e.maps_url)}" target="_blank" rel="noopener">Mapa</a>`:""}</div></article>`).join("")||`<div class="empty-panel"><h3>No hay eventos</h3><p>Añade el primer evento del viaje.</p></div>`;
  }

  function renderPacking(){const total=data.packing.length,done=data.packing.filter(x=>x.done).length,pct=total?Math.round(done/total*100):0;$("#summaryPct").textContent=`${pct}%`;$(`#summaryBar`).style.width=`${pct}%`;$(`#summaryText`).textContent=`${done} / ${total}`;$("#packingList").innerHTML=data.packing.map(x=>`<label class="check ${x.done?"done":""}"><input type="checkbox" ${x.done?"checked":""} data-pack-toggle="${esc(x.id)}"><span>${esc(x.name)}</span><button type="button" class="delete-btn" data-delete-table="packing" data-delete-id="${esc(x.id)}">×</button></label>`).join("")||`<div class="empty-panel"><p>Tu lista está vacía.</p></div>`}

  function renderPlaces(){const q=$("#placeSearch")?.value.toLowerCase()||"";const arr=data.places.filter(x=>(x.name||"").toLowerCase().includes(q));$("#placesGrid").innerHTML=arr.map(x=>collectionCard(x,"places","⌖")).join("")||`<div class="empty-panel"><h3>No hay lugares</h3><p>Añade lugares o usa el itinerario.</p></div>`}
  function renderFood(){$("#foodGrid").innerHTML=data.food.map(x=>collectionCard(x,"food","♡")).join("")||`<div class="empty-panel"><p>Añade restaurantes, snacks y Quick Bites.</p></div>`}
  function renderActivities(){$("#activityGrid").innerHTML=data.activities.map(x=>collectionCard(x,"activities","✧")).join("")||`<div class="empty-panel"><p>Añade actividades.</p></div>`}
  function collectionCard(x,table,symbol){const rating=x.rating?` · ${esc(x.rating)}★` : "";const reviews=x.review_count?` · ${esc(x.review_count)} reviews`:"";return `<article class="info-card"><div class="symbol">${symbol}</div><div class="item-meta"><span class="tag">${esc(x.category||"FAMILY")}</span>${x.family_friendly?`<span class="tag">FAMILY</span>`:""}${x.baby_friendly?`<span class="tag">BABY</span>`:""}${x.stroller?`<span class="tag">STROLLER</span>`:""}</div><h3>${esc(x.name)}${rating}${reviews}</h3><p>${esc(x.description||"Sin notas todavía.")}</p><div class="card-actions"><button class="edit-btn" data-edit-table="${table}" data-edit-id="${esc(x.id)}">Editar</button><button class="delete-btn" data-delete-table="${table}" data-delete-id="${esc(x.id)}">Eliminar</button>${x.maps_url?`<a class="edit-btn" href="${safeUrl(x.maps_url)}" target="_blank" rel="noopener">Mapa</a>`:""}</div></article>`}

  function renderChat(){const mineId=currentUser?.id||"offline-user";$("#messages").innerHTML=data.messages.map(m=>{const mine=m.user_id===mineId;return `<div class="message ${mine?"me":""}"><strong>${esc(memberName(m.user_id))}</strong><br>${esc(m.body)}<small>${formatDateTime(m.created_at)}</small></div>`}).join("")||`<p class="muted">Todavía no hay mensajes.</p>`;const box=$("#messages");if(box)box.scrollTop=box.scrollHeight;$("#chatMembers").innerHTML=data.members.map(m=>memberHTML(m,false)).join("")}
  function renderMembers(){const html=data.members.map(m=>memberHTML(m,true)).join("")||`<p class="muted">No hay miembros.</p>`;$("#membersList").innerHTML=html;$("#adminMembers").innerHTML=html}
  function memberHTML(m,admin){const name=memberName(m.user_id,m), role=m.role||"adult", isOwner=m.user_id===currentGroup?.owner_id;const loc=data.locations.find(l=>l.user_id===m.user_id);return `<div class="member"><span>${esc(initials(name))}</span><div><strong>${esc(name)}</strong><small>${esc(role)}${loc?" · ubicación compartida":""}</small></div>${admin&&!isOwner&&canManageGroup()?`<button class="delete-btn" data-remove-member="${esc(m.id)}">Eliminar</button>`:""}</div>`}
  function renderStatuses(){const s=data.travel_status||{};const labels=[[
    "tsa","TSA pasado","Seguridad completada"],["boarding","Abordando","Estamos en la puerta"],["landed","Aterrizamos","Ya llegamos"],["bags","Equipaje recogido","Maletas listas"]];$("#travelStatuses").innerHTML=labels.map(([k,t,d])=>`<button class="status-card ${s[k]?"done":""}" data-status="${k}"><span>${s[k]?"✓":"○"}</span><div><strong>${t}</strong><small>${d}</small></div></button>`).join("");$$('[data-status]').forEach(b=>b.addEventListener("click",()=>toggleStatus(b.dataset.status)));$("#flightInfo").innerHTML=currentGroup?.flight_number?`Vuelo <strong>${esc(currentGroup.flight_number)}</strong>`:`No hay número de vuelo configurado.`}
  function renderSettings(){const t=currentGroup||{};$("#tripNameInput").value=t.name||"";$("#tripDestinationInput").value=t.destination||"";$("#tripStartInput").value=t.start_date||"";$("#tripEndInput").value=t.end_date||"";$("#flightNumberInput").value=t.flight_number||"";$("#inviteCode").textContent=t.invite_code||"—"}
  function renderWear(){const e=data.events.slice().sort(sortEvents)[0];let txt="";if(e?.wear)txt=e.wear;else if(/gem|mining/i.test(e?.title||""))txt="Zapatos cerrados, pantalón cómodo y una capa ligera.";else if(/beech mountain|mountain/i.test(e?.title||""))txt="Jacket ligera, pantalón largo y sneakers cómodos.";else if(/winery|church/i.test(e?.title||""))txt="Smart casual, zapatos cómodos y una capa ligera.";else txt="Para octubre: capas, pantalón cómodo, sneakers y jacket ligera accesible.";$("#wearSummary").textContent=txt}

  /* ---------------- TRIP SETTINGS / STATUS ---------------- */
  async function saveTripSettings(e){e.preventDefault();if(!currentGroup)return toast("Primero crea un viaje.");const vals={name:$("#tripNameInput").value.trim(),destination:$("#tripDestinationInput").value.trim(),start_date:$("#tripStartInput").value||null,end_date:$("#tripEndInput").value||null,flight_number:$("#flightNumberInput").value.trim()};if(!onlineMode||!supabaseClient||currentGroup.id==="offline-trip"){currentGroup={...currentGroup,...vals};groups=groups.map(g=>g.id===currentGroup.id?currentGroup:g);saveCachedData();renderAll();return toast("Viaje actualizado.")}const {data:g,error}=await supabaseClient.from("groups").update(vals).eq("id",currentGroup.id).select().single();if(error)return toast(translateError(error.message));currentGroup={...currentGroup,...g};groups=groups.map(x=>x.id===currentGroup.id?currentGroup:x);renderAll();toast("Viaje actualizado.")}
  async function toggleStatus(key){if(!currentGroup)return;const next={...(data.travel_status||{}),group_id:currentGroup.id,[key]:!(data.travel_status?.[key])};if(!onlineMode||!supabaseClient||currentGroup.id==="offline-trip"){data.travel_status=next;saveCachedData();renderStatuses();return}const {error}=await supabaseClient.from("travel_status").upsert(next,{onConflict:"group_id"});if(error)return toast(translateError(error.message));data.travel_status=next;renderStatuses()}

  /* ---------------- INVITES / MEMBERS ---------------- */
  async function removeMember(member){if(member.user_id===currentGroup?.owner_id)return toast("El owner no se puede eliminar del viaje.");if(!confirm(`¿Eliminar a ${memberName(member.user_id,member)} del viaje?`))return;if(!onlineMode||!supabaseClient||currentGroup.id==="offline-trip"){data.members=data.members.filter(x=>x.id!==member.id);saveCachedData();renderAll();return}const {error}=await supabaseClient.from("members").delete().eq("id",member.id);if(error)return toast(translateError(error.message));data.members=data.members.filter(x=>x.id!==member.id);renderAll();toast("Miembro eliminado del viaje.")}
  async function copyInviteCode(){if(!currentGroup?.invite_code)return;await copyText(currentGroup.invite_code);toast("Código copiado.")}
  async function shareInvite(){if(!currentGroup?.invite_code)return;const text=`¡Únete a nuestro viaje en Nuestra Aventura!\n\n${currentGroup.name}\n${currentGroup.destination||""}\n\nCódigo: ${currentGroup.invite_code}\n\n${SITE_URL}`;if(navigator.share){try{await navigator.share({title:"Invitación · Nuestra Aventura",text,url:SITE_URL});return}catch(e){if(e.name==="AbortError")return}}await copyText(text);toast("Invitación copiada. Puedes pegarla en WhatsApp.")}

  /* ---------------- CHAT / LOCATION ---------------- */
  async function sendMessage(e){e.preventDefault();const input=$("#chatInput"),body=input.value.trim();if(!body)return;if(!currentGroup)return toast("Primero crea un viaje.");if(!onlineMode||!supabaseClient||currentGroup.id==="offline-trip"){data.messages.push({id:crypto.randomUUID(),group_id:currentGroup.id,user_id:currentUser?.id||"offline-user",body,created_at:new Date().toISOString()});saveCachedData();input.value="";renderChat();return}const {data:m,error}=await supabaseClient.from("messages").insert({group_id:currentGroup.id,user_id:currentUser.id,body}).select().single();if(error)return toast(translateError(error.message));data.messages.push(m);input.value="";renderChat()}
  function getPosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error("Geolocation no disponible"));navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:10000})})}
  async function shareLocation(){if(!currentGroup)return toast("Primero crea un viaje.");try{const p=await getPosition();const row={group_id:currentGroup.id,user_id:currentUser?.id||"offline-user",lat:p.coords.latitude,lon:p.coords.longitude,name:"Mi ubicación",updated_at:new Date().toISOString()};if(!onlineMode||!supabaseClient||currentGroup.id==="offline-trip"){data.locations=data.locations.filter(x=>x.user_id!==row.user_id);data.locations.push({id:crypto.randomUUID(),...row});saveCachedData();renderMembers();renderMapMarkers();toast("Ubicación guardada.");return}const {error}=await supabaseClient.from("locations").upsert(row,{onConflict:"group_id,user_id"});if(error)return toast(translateError(error.message));await loadGroupData();toast("Ubicación compartida.")}catch(e){toast("No pude obtener tu ubicación. Revisa el permiso del navegador.")}}
  async function saveCar(){if(!currentGroup)return toast("Primero crea un viaje.");try{const p=await getPosition();const car={group_id:currentGroup.id,user_id:currentUser?.id||"offline-user",lat:p.coords.latitude,lon:p.coords.longitude,updated_at:new Date().toISOString()};if(!onlineMode||!supabaseClient||currentGroup.id==="offline-trip"){data.parking=car;saveCachedData();renderMapMarkers();updateCarStatus();toast("Ubicación del carro guardada.");return}const {error}=await supabaseClient.from("parking").upsert(car,{onConflict:"group_id"});if(error)return toast(translateError(error.message));data.parking=car;renderMapMarkers();updateCarStatus();toast("Ubicación del carro guardada.")}catch(e){toast("No pude obtener tu ubicación.")}}
  function findCar(){if(!data.parking)return toast("No hay una ubicación de carro guardada.");window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(data.parking.lat)},${encodeURIComponent(data.parking.lon)}&travelmode=driving`,"_blank","noopener")}
  function updateCarStatus(){if($("#carStatus"))$("#carStatus").textContent=data.parking?`Guardado ${formatDateTime(data.parking.updated_at)}`:"No hay ubicación guardada."}

  /* ---------------- MAP ---------------- */
  function initMap(){if(!window.L||!$("#map"))return;if(mapObj){mapObj.invalidateSize();renderMapMarkers();return}mapObj=L.map("map",{zoomControl:true}).setView([35.8,-80.3],7);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(mapObj);renderMapMarkers()}
  function renderMapMarkers(){if(!mapObj)return;for(const m of mapMarkers.values())m.remove();mapMarkers.clear();const points=[];data.locations.forEach(l=>{const name=memberName(l.user_id);const m=L.marker([l.lat,l.lon]).addTo(mapObj).bindPopup(`<strong>${esc(name)}</strong><br>${esc(l.name||"Ubicación")}`);mapMarkers.set(`u:${l.user_id}`,m);points.push([l.lat,l.lon])});if(data.parking){const m=L.marker([data.parking.lat,data.parking.lon]).addTo(mapObj).bindPopup("🚗 Carro");mapMarkers.set("car",m);points.push([data.parking.lat,data.parking.lon])}if(points.length)mapObj.fitBounds(points,{padding:[30,30],maxZoom:12});updateCarStatus()}

  /* ---------------- WEATHER ---------------- */
  async function loadWeather(force=false){if(!currentGroup?.destination)return;if(!force&&weatherTimer&&Date.now()-weatherTimer<600000)return;weatherTimer=Date.now();try{const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(currentGroup.destination)}&count=1&language=en&format=json`).then(r=>r.json());const r=geo.results?.[0];if(!r)throw new Error("No location");const forecast=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`).then(x=>x.json());const c=forecast.current;$("#weatherTemp").textContent=`${Math.round(c.temperature_2m)}°F`;$("#weatherDesc").textContent=weatherText(c.weather_code);$("#weatherMeta").textContent=`Viento ${Math.round(c.wind_speed_10m)} mph`;$("#weatherIcon").textContent=weatherIcon(c.weather_code);$("#weatherForecast").innerHTML=(forecast.daily?.time||[]).map((d,i)=>`<div class="forecast-day"><small>${new Date(d+"T12:00:00").toLocaleDateString("es-PR",{weekday:"short",month:"short",day:"numeric"})}</small><strong>${Math.round(forecast.daily.temperature_2m_max[i])}° / ${Math.round(forecast.daily.temperature_2m_min[i])}°</strong></div>`).join("");renderWear()}catch(e){$("#weatherDesc").textContent="Clima no disponible";$("#weatherMeta").textContent=onlineMode?"Intenta actualizar":"Sin conexión"}}
  function weatherText(code){if(code===0)return"Despejado";if([1,2,3].includes(code))return"Parcialmente nublado";if([45,48].includes(code))return"Neblina";if([51,53,55,56,57].includes(code))return"Llovizna";if([61,63,65,66,67].includes(code))return"Lluvia";if([71,73,75,77].includes(code))return"Nieve";if([80,81,82].includes(code))return"Chubascos";if([95,96,99].includes(code))return"Tormenta";return"Tiempo variable"}
  function weatherIcon(code){if(code===0)return"☀";if([1,2,3].includes(code))return"☁";if([51,53,55,61,63,65,80,81,82].includes(code))return"☂";if([71,73,75,77].includes(code))return"❄";if([95,96,99].includes(code))return"⚡";return"☼"}

  /* ---------------- NOVA ---------------- */
  async function askNOVA(e, directQuestion=null){if(e)e.preventDefault();const input=$("#aiInput");const q=(directQuestion??input.value).trim();if(!q)return;appendAI(q,true);if(input)input.value="";const answer=buildNOVAAnswer(q);setTimeout(()=>appendAI(answer,false),120)}
  function appendAI(text,me){const box=$("#aiMessages");const div=document.createElement("div");div.className=`ai-bubble ${me?"user":""}`;div.textContent=text;box.appendChild(div);box.scrollTop=box.scrollHeight}
  function buildNOVAAnswer(q){const l=q.toLowerCase();const events=data.events.slice().sort(sortEvents);const missing=data.packing.filter(x=>!x.done).map(x=>x.name);if(/equipaje|falta|llevar|packing/.test(l))return missing.length?`Faltan ${missing.length} cosas: ${missing.slice(0,10).join(", ")}${missing.length>10?"…":""}.`:`El packing está completo: 100%.`;if(/poner|vestir|ropa|jacket|zapatos/.test(l)){const e=events.find(x=>x.wear)||events[0];return e?.wear?`Para ${e.title}: ${e.wear}`:`Para octubre te conviene vestir por capas: pantalón cómodo, sneakers y una jacket ligera accesible. Para gem mining, usa zapatos cerrados.`}if(/hoy|hacemos|plan/.test(l)){const today=new Date().toISOString().slice(0,10);const todayEvents=events.filter(e=>e.date===today);return todayEvents.length?`Hoy tienes: ${todayEvents.map(e=>`${e.time||""} ${e.title}`).join(" · ")}`:events.length?`El próximo plan es ${events[0].title}${events[0].time?` a las ${events[0].time}`:""}.`:`Todavía no hay actividades programadas.`}if(/cerca|ruta|mapa|manejo|drive/.test(l)){const e=events.find(x=>x.location);return e?`En tu itinerario aparece ${e.title} en ${e.location}. Puedes abrir el mapa desde el evento.`:`Añade ubicaciones al itinerario y puedo usarlas como referencia.`}if(/miembro|familia|grupo/.test(l))return`Este viaje tiene ${data.members.length} miembro${data.members.length===1?"":"s"}. Puedes administrar personas desde “Grupo & ajustes”.`;if(/clima|frío|frio|temperatura|weather/.test(l))return`El panel de Inicio usa el clima actual y el pronóstico del destino. Para una actividad concreta, dime el nombre y puedo usar sus notas de vestimenta si las guardaste.`;return`Puedo ayudarte con ${currentGroup?.name||"tu viaje"}: itinerario, equipaje, clima, ropa, familia, mapas y actividades. Prueba “¿Qué me pongo?” o “¿Qué falta en el equipaje?”.`}

  /* ---------------- NAV / DRAWER ---------------- */
  function navigate(view){if(!view)return;$$('.view').forEach(v=>v.classList.remove("active-view"));$("#view-"+view)?.classList.add("active-view");$$('.nav-item').forEach(b=>b.classList.toggle("active",b.dataset.view===view));const names={home:"Inicio",itinerary:"Itinerario",places:"Lugares",packing:"Equipaje",food:"Comida",activities:"Actividades",map:"Mapa & familia",airport:"Viaje",chat:"Familia",assistant:"NOVA",settings:"Grupo & ajustes"};$("#pageName").textContent=names[view]||view;closeDrawer();if(view==="map")setTimeout(initMap,80)}
  function setupDrawer(){const sidebar=$("#sidebar");if(!sidebar)return;sidebar.addEventListener("touchstart",e=>{const t=e.touches[0];drawerTouch={x:t.clientX,y:t.clientY}} ,{passive:true});sidebar.addEventListener("touchend",e=>{if(!drawerTouch)return;const t=e.changedTouches[0],dx=t.clientX-drawerTouch.x,dy=t.clientY-drawerTouch.y;drawerTouch=null;if(dx<-70&&Math.abs(dx)>Math.abs(dy))closeDrawer()},{passive:true});document.addEventListener("click",e=>{if(e.target.id==="drawerOverlay")closeDrawer()});$("#sidebar").insertAdjacentHTML("afterend","<div id=\"drawerOverlay\" class=\"drawer-overlay\"></div>")}
  function openDrawer(){if(innerWidth>800)return;$("#sidebar")?.classList.add("open");$("#drawerOverlay")?.classList.add("show");document.body.style.overflow="hidden"}
  function closeDrawer(){$("#sidebar")?.classList.remove("open");$("#drawerOverlay")?.classList.remove("show");document.body.style.overflow=""}

  /* ---------------- OFFLINE CACHE ---------------- */
  function enterOffline(showToast=true){onlineMode=false;currentUser={id:"offline-user",email:"",user_metadata:{name:"Modo local"}};currentGroup=offlineSeed;groups=[offlineSeed];loadCachedDataForCurrentGroup();showAuth(false);renderAll();if(showToast)toast("Modo sin cuenta activado en este dispositivo.")}
  function cacheCurrentGroup(){if(!currentGroup)return;localStorage.setItem(STORAGE.currentGroup,currentGroup.id);saveCachedData()}
  function saveCachedData(){try{localStorage.setItem(STORAGE.offline,JSON.stringify({group:currentGroup,data}))}catch(e){console.warn("Cache:",e)}}
  function loadCachedCurrentGroup(){try{const saved=JSON.parse(localStorage.getItem(STORAGE.offline)||"null");if(saved?.group){currentGroup=saved.group;data=saved.data||emptyData();groups=[currentGroup];renderAll()}}catch(e){}}
  function loadCachedDataForCurrentGroup(){try{const saved=JSON.parse(localStorage.getItem(STORAGE.offline)||"null");if(saved?.group?.id===currentGroup?.id){data=saved.data||emptyData();return}}catch(e){}data=emptyData();renderAll()}

  /* ---------------- REALTIME ---------------- */
  function setupRealtime(){teardownRealtime();if(!supabaseClient||!currentGroup||!onlineMode)return;const gid=currentGroup.id;realtimeChannel=supabaseClient.channel(`family-hub-${gid}`).on("postgres_changes",{event:"*",schema:"public",table:"events",filter:`group_id=eq.${gid}`},loadGroupData).on("postgres_changes",{event:"*",schema:"public",table:"packing",filter:`group_id=eq.${gid}`},loadGroupData).on("postgres_changes",{event:"*",schema:"public",table:"places",filter:`group_id=eq.${gid}`},loadGroupData).on("postgres_changes",{event:"*",schema:"public",table:"food",filter:`group_id=eq.${gid}`},loadGroupData).on("postgres_changes",{event:"*",schema:"public",table:"activities",filter:`group_id=eq.${gid}`},loadGroupData).on("postgres_changes",{event:"*",schema:"public",table:"messages",filter:`group_id=eq.${gid}`},loadGroupData).on("postgres_changes",{event:"*",schema:"public",table:"locations",filter:`group_id=eq.${gid}`},loadGroupData).subscribe()}
  function teardownRealtime(){if(realtimeChannel&&supabaseClient){supabaseClient.removeChannel(realtimeChannel).catch(()=>{});realtimeChannel=null}}

  /* ---------------- HELPERS ---------------- */
  function memberName(userId, fallback){const p=data.profiles.find(x=>x.id===userId);if(p?.name)return p.name;if(fallback?.name)return fallback.name;if(userId===currentUser?.id)return currentUser.user_metadata?.name||"Yo";return "Miembro"}
  function canManageGroup(){return currentGroup?.my_role==="owner"||currentGroup?.my_role==="admin"||currentGroup?.owner_id===currentUser?.id}
  function sortEvents(a,b){return `${a.date||"9999"} ${a.time||"99:99"}`.localeCompare(`${b.date||"9999"} ${b.time||"99:99"}`)}
  function daysUntil(date){if(!date)return null;const a=new Date();a.setHours(0,0,0,0);const b=new Date(date+"T00:00:00");return Math.max(0,Math.ceil((b-a)/86400000))}
  function fmt(x){return x?new Date(x+"T12:00:00").toLocaleDateString("es-PR",{day:"numeric",month:"short"}):"—"}
  function formatDateTime(x){if(!x)return"";try{return new Intl.DateTimeFormat("es-PR",{dateStyle:"short",timeStyle:"short"}).format(new Date(x))}catch{return""}}
  function initials(n){return String(n||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
  function safeUrl(url){try{const u=new URL(url,location.href);return ["https:","http:"].includes(u.protocol)?esc(u.href):"#"}catch{return"#"}}
  function generateInviteCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="FAM-";for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s}
  async function copyText(text){try{await navigator.clipboard.writeText(text)}catch{prompt("Copia este texto:",text)}}
  function toast(message){const t=$("#toast");if(!t)return;t.textContent=message;t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),3000)}
  function setAuthMessage(msg){$("#authMsg").textContent=msg||""}
  function translateError(message){const t=String(message||"");if(/invalid login credentials/i.test(t))return"Email o contraseña incorrectos.";if(/email not confirmed/i.test(t))return"Primero confirma tu email.";if(/user already registered/i.test(t))return"Ya existe una cuenta con ese email.";if(/password should be at least/i.test(t))return"La contraseña debe tener al menos 6 caracteres.";if(/row-level security/i.test(t))return"Supabase bloqueó la acción por RLS. Ejecuta el SQL V4 completo.";if(/join_group_by_invite/i.test(t))return"Falta ejecutar la función de invitación en Supabase.";if(/duplicate key/i.test(t))return"Ese registro ya existe.";return t||"Ocurrió un error."}
  function updateConnectionUI(){const offline=!navigator.onLine||!onlineMode;$("#connectionText").textContent=offline?"Sin conexión":"Conectado";$("#connectionDot")?.parentElement.classList.toggle("offline",offline);$("#offlineBanner")?.classList.toggle("hidden",!offline)}
  function applyTheme(){if(localStorage.getItem(STORAGE.theme)==="dark")document.body.classList.add("dark")}
  function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem(STORAGE.theme,document.body.classList.contains("dark")?"dark":"light")}

})();
