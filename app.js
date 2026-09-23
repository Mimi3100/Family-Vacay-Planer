/* =========================================================
   NUESTRA AVENTURA · FAMILY HUB
   APP.JS
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_CONFIG = "nuestra_aventura_supabase_config";
  const STORAGE_OFFLINE = "nuestra_aventura_offline_data";
  const STORAGE_GROUP = "nuestra_aventura_current_group";

  let supabaseClient = null;
  let onlineMode = false;
  let currentUser = null;
  let currentGroup = null;
  let currentView = "home";

  let data = {
    events: [],
    packing: [],
    places: [],
    food: [],
    activities: [],
    messages: [],
    members: [],
    profiles: [],
    locations: [],
    parking: null,
    travel_status: null
  };

  let realtimeChannel = null;

  const $ = (id) => document.getElementById(id);

  /* =======================================================
     INIT
     ======================================================= */

  document.addEventListener("DOMContentLoaded", init);

  async function init() {

    bindEvents();

    const savedConfig = localStorage.getItem(STORAGE_CONFIG);

    if (
      savedConfig &&
      window.APP_CONFIG &&
      !window.APP_CONFIG.SUPABASE_URL
    ) {
      try {
        const parsed = JSON.parse(savedConfig);

        window.APP_CONFIG.SUPABASE_URL = parsed.url;
        window.APP_CONFIG.SUPABASE_KEY = parsed.key;
      } catch (_) {}
    }

    if (
      window.APP_CONFIG?.SUPABASE_URL &&
      window.APP_CONFIG?.SUPABASE_KEY
    ) {
      const connected = await initializeSupabase(
        window.APP_CONFIG.SUPABASE_URL,
        window.APP_CONFIG.SUPABASE_KEY
      );

      if (connected) {
        await checkExistingSession();
        return;
      }
    }

    showAuthOrConfig();
  }

  /* =======================================================
     SUPABASE
     ======================================================= */

  async function initializeSupabase(url, key) {

    url = String(url || "").trim();
    key = String(key || "").trim();

    if (!/^https?:\/\/.+/i.test(url)) {
      return false;
    }

    if (!key) {
      return false;
    }

    try {

      supabaseClient = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      onlineMode = true;

      updateConnectionUI();

      return true;

    } catch (error) {

      console.error(error);

      supabaseClient = null;
      onlineMode = false;

      return false;
    }
  }

  async function checkExistingSession() {

    try {

      const {
        data: sessionData
      } = await supabaseClient.auth.getSession();

      if (sessionData?.session?.user) {

        currentUser = sessionData.session.user;

        await ensureProfile();

        await loadGroups();

        showApp();

      } else {

        showAuth();

      }

    } catch (error) {

      console.error(error);

      showAuth();
    }

    supabaseClient?.auth.onAuthStateChange(
      async (_event, session) => {

        if (session?.user) {

          currentUser = session.user;

          await ensureProfile();
          await loadGroups();

          showApp();

        } else {

          currentUser = null;
        }
      }
    );
  }

  async function ensureProfile() {

    if (!onlineMode || !currentUser) return;

    const name =
      currentUser.user_metadata?.name ||
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split("@")[0] ||
      "Usuario";

    const { error } = await supabaseClient
      .from("profiles")
      .upsert(
        {
          id: currentUser.id,
          email: currentUser.email || "",
          name
        },
        {
          onConflict: "id"
        }
      );

    if (error) {
      console.warn("Profile:", error.message);
    }
  }

  /* =======================================================
     CONFIGURATION
     ======================================================= */

  function showAuthOrConfig() {

    hide("loadingScreen");

    const configExists =
      window.APP_CONFIG?.SUPABASE_URL &&
      window.APP_CONFIG?.SUPABASE_KEY;

    if (configExists) {

      showAuth();

    } else {

      showConfig();
    }
  }

  function showConfig() {

    hide("loadingScreen");
    hide("authScreen");
    hide("app");

    show("configScreen");

    $("setupUrl").value =
      window.APP_CONFIG?.SUPABASE_URL || "";

    $("setupKey").value =
      window.APP_CONFIG?.SUPABASE_KEY || "";
  }

  async function saveConfiguration() {

    const url = $("setupUrl").value.trim();
    const key = $("setupKey").value.trim();

    $("configError").textContent = "";

    if (!/^https?:\/\/.+/i.test(url)) {

      $("configError").textContent =
        "La Project URL debe comenzar con https://";

      return;
    }

    if (!key) {

      $("configError").textContent =
        "Pega la Publishable/Anon Key.";

      return;
    }

    const connected =
      await initializeSupabase(url, key);

    if (!connected) {

      $("configError").textContent =
        "No pude inicializar Supabase. Verifica la URL y la key.";

      return;
    }

    localStorage.setItem(
      STORAGE_CONFIG,
      JSON.stringify({
        url,
        key
      })
    );

    window.APP_CONFIG.SUPABASE_URL = url;
    window.APP_CONFIG.SUPABASE_KEY = key;

    toast("Supabase conectado.");

    showAuth();
  }

  /* =======================================================
     AUTH
     ======================================================= */

  function showAuth() {

    hide("loadingScreen");
    hide("configScreen");
    hide("app");

    show("authScreen");

    setAuthTab("login");

    $("authMessage").textContent = "";
  }

  function setAuthTab(type) {

    const login = type === "login";

    $("loginTab").classList.toggle("active", login);
    $("signupTab").classList.toggle("active", !login);

    $("loginForm").classList.toggle("hidden", !login);
    $("signupForm").classList.toggle("hidden", login);

    $("authMessage").textContent = "";
  }

  async function login(event) {

    event.preventDefault();

    if (!supabaseClient) {

      $("authMessage").textContent =
        "Configura Supabase primero.";

      return;
    }

    const email =
      $("loginEmail").value.trim();

    const password =
      $("loginPassword").value;

    setBusy(event.target, true);

    const { data: result, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    setBusy(event.target, false);

    if (error) {

      $("authMessage").textContent =
        translateError(error.message);

      return;
    }

    currentUser = result.user;

    await ensureProfile();
    await loadGroups();

    showApp();
  }

  async function signup(event) {

    event.preventDefault();

    if (!supabaseClient) {

      $("authMessage").textContent =
        "Configura Supabase primero.";

      return;
    }

    const name =
      $("signupName").value.trim();

    const email =
      $("signupEmail").value.trim();

    const password =
      $("signupPassword").value;

    const password2 =
      $("signupPassword2").value;

    if (password !== password2) {

      $("authMessage").textContent =
        "Las contraseñas no coinciden.";

      return;
    }

    setBusy(event.target, true);

    const {
      data: result,
      error
    } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name
        },
        emailRedirectTo:
          window.APP_CONFIG.SITE_URL
      }
    });

    setBusy(event.target, false);

    if (error) {

      $("authMessage").textContent =
        translateError(error.message);

      return;
    }

    if (result.session) {

      currentUser = result.user;

      await ensureProfile();
      await loadGroups();

      showApp();

    } else {

      $("authMessage").textContent =
        "Cuenta creada. Revisa tu email para confirmar la cuenta y luego entra.";
    }
  }

  async function forgotPassword() {

    if (!supabaseClient) return;

    const email =
      $("loginEmail").value.trim();

    if (!email) {

      $("authMessage").textContent =
        "Escribe tu email primero.";

      return;
    }

    const { error } =
      await supabaseClient.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            window.APP_CONFIG.SITE_URL
        }
      );

    $("authMessage").textContent =
      error
        ? translateError(error.message)
        : "Te envié instrucciones para cambiar tu contraseña.";
  }

  async function logout() {

    if (onlineMode && supabaseClient) {

      await supabaseClient.auth.signOut();
    }

    currentUser = null;
    currentGroup = null;

    localStorage.removeItem(STORAGE_GROUP);

    showAuth();
  }

  /* =======================================================
     OFFLINE
     ======================================================= */

  function enterOffline() {

    onlineMode = false;
    supabaseClient = null;
    currentUser = {
      id: "offline-user",
      email: "offline@local",
      user_metadata: {
        name: "Modo Offline"
      }
    };

    loadOfflineData();

    showApp();
  }

  function loadOfflineData() {

    try {

      const saved =
        JSON.parse(
          localStorage.getItem(STORAGE_OFFLINE) || "{}"
        );

      data = {
        events: saved.events || [],
        packing: saved.packing || [],
        places: saved.places || [],
        food: saved.food || [],
        activities: saved.activities || [],
        messages: saved.messages || [],
        members: saved.members || [],
        profiles: saved.profiles || [],
        locations: saved.locations || [],
        parking: saved.parking || null,
        travel_status: saved.travel_status || null
      };

      currentGroup =
        saved.group || null;

    } catch (_) {

      data = {
        events: [],
        packing: [],
        places: [],
        food: [],
        activities: [],
        messages: [],
        members: [],
        profiles: [],
        locations: [],
        parking: null,
        travel_status: null
      };
    }
  }

  function saveOfflineData() {

    if (onlineMode) return;

    localStorage.setItem(
      STORAGE_OFFLINE,
      JSON.stringify({
        ...data,
        group: currentGroup
      })
    );
  }

  /* =======================================================
     APP
     ======================================================= */

  function showApp() {

    hide("loadingScreen");
    hide("configScreen");
    hide("authScreen");

    show("app");

    updateUserUI();
    updateConnectionUI();

    navigate("home");

    renderAll();
  }

  function updateUserUI() {

    const name =
      currentUser?.user_metadata?.name ||
      currentUser?.user_metadata?.full_name ||
      currentUser?.email?.split("@")[0] ||
      "Invitada";

    $("userNameDisplay").textContent = name;

    $("settingsUserName").textContent = name;

    $("settingsUserEmail").textContent =
      currentUser?.email || "Modo offline";

    $("userPill").querySelector(".avatar").textContent =
      name.charAt(0).toUpperCase();
  }

  function updateConnectionUI() {

    const badge = $("connectionBadge");

    if (!badge) return;

    const online =
      onlineMode &&
      navigator.onLine;

    badge.classList.toggle(
      "online",
      online
    );

    badge.querySelector("span:last-child").textContent =
      online
        ? "Conectado"
        : "Offline";

    if ($("settingsConnection")) {

      $("settingsConnection").textContent =
        online
          ? "Conectado a Supabase"
          : "Modo offline";
    }
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  function navigate(view) {

    currentView = view;

    document
      .querySelectorAll(".view")
      .forEach(el => {
        el.classList.remove("active");
      });

    const target =
      $("view-" + view);

    if (target) {
      target.classList.add("active");
    }

    document
      .querySelectorAll(".nav-item")
      .forEach(btn => {

        btn.classList.toggle(
          "active",
          btn.dataset.view === view
        );

      });

    const titles = {
      home: ["FAMILY HUB", "Nuestra aventura"],
      itinerary: ["PLAN", "Itinerario"],
      packing: ["PREPARACIÓN", "Packing"],
      places: ["EXPLORAR", "Lugares"],
      food: ["COMER", "Comida"],
      activities: ["PLANES", "Actividades"],
      messages: ["FAMILIA", "Mensajes"],
      location: ["UBICACIÓN", "Ubicación & Parking"],
      group: ["FAMILIA", "Mi grupo"],
      settings: ["APP", "Configuración"]
    };

    $("pageEyebrow").textContent =
      titles[view]?.[0] || "FAMILY HUB";

    $("pageTitle").textContent =
      titles[view]?.[1] || "Nuestra aventura";

    document
      .querySelector(".sidebar")
      ?.classList.remove("open");
  }

  /* =======================================================
     GROUPS
     ======================================================= */

  async function loadGroups() {

    if (!onlineMode || !currentUser) {
      return;
    }

    const { data: groups, error } =
      await supabaseClient
        .from("groups")
        .select("*")
        .order("created_at", {
          ascending: false
        });

    if (error) {

      console.error(error);

      return;
    }

    if (!groups?.length) {

      currentGroup = null;

      return;
    }

    const savedId =
      localStorage.getItem(STORAGE_GROUP);

    currentGroup =
      groups.find(g => g.id === savedId) ||
      groups[0];

    localStorage.setItem(
      STORAGE_GROUP,
      currentGroup.id
    );

    await loadGroupData();
  }

  async function createGroup() {

    if (!onlineMode) {

      const name =
        prompt("Nombre del viaje:");

      if (!name) return;

      currentGroup = {
        id: crypto.randomUUID(),
        name,
        destination: "",
        invite_code:
          generateInviteCode()
      };

      data.members = [{
        id: crypto.randomUUID(),
        user_id: currentUser.id,
        role: "owner",
        name:
          currentUser.user_metadata?.name ||
          "Yo"
      }];

      saveOfflineData();

      toast("Viaje creado.");

      renderAll();

      return;
    }

    const name =
      prompt("Nombre del viaje:");

    if (!name) return;

    const destination =
      prompt("Destino:") || "";

    const invite_code =
      generateInviteCode();

    const { data: group, error } =
      await supabaseClient
        .from("groups")
        .insert({
          name,
          destination,
          invite_code,
          owner_id: currentUser.id
        })
        .select()
        .single();

    if (error) {

      toast(translateError(error.message));

      return;
    }

    const { error: memberError } =
      await supabaseClient
        .from("members")
        .insert({
          group_id: group.id,
          user_id: currentUser.id,
          role: "owner"
        });

    if (memberError) {

      toast(translateError(memberError.message));

      return;
    }

    currentGroup = group;

    localStorage.setItem(
      STORAGE_GROUP,
      group.id
    );

    await loadGroupData();

    toast("Viaje creado.");

    renderAll();
  }

  async function joinGroup() {

    const code =
      prompt(
        "Escribe el código de invitación:"
      )?.trim().toUpperCase();

    if (!code) return;

    if (!onlineMode) {

      toast(
        "Para unirte a un grupo compartido necesitas conexión."
      );

      return;
    }

    /*
      NOTA:
      La policy actual de tu SQL no permite a un usuario
      nuevo buscar grupos por invite_code.

      El SQL patch que aparece después de estos archivos
      habilita esta función de forma segura.
    */

    const { data: group, error } =
      await supabaseClient
        .from("groups")
        .select("*")
        .eq("invite_code", code)
        .maybeSingle();

    if (error) {

      toast(translateError(error.message));

      return;
    }

    if (!group) {

      toast("No encontré ese código.");

      return;
    }

    const { error: memberError } =
      await supabaseClient
        .from("members")
        .insert({
          group_id: group.id,
          user_id: currentUser.id,
          role: "adult"
        });

    if (memberError) {

      toast(translateError(memberError.message));

      return;
    }

    currentGroup = group;

    localStorage.setItem(
      STORAGE_GROUP,
      group.id
    );

    await loadGroupData();

    toast("Te uniste al grupo.");

    renderAll();
  }

  async function loadGroupData() {

    if (!currentGroup) {

      renderAll();

      return;
    }

    if (!onlineMode) {

      saveOfflineData();

      renderAll();

      return;
    }

    const gid = currentGroup.id;

    const [
      events,
      packing,
      places,
      food,
      activities,
      messages,
      members,
      locations,
      parking,
      status
    ] = await Promise.all([

      fetchTable("events", gid),
      fetchTable("packing", gid),
      fetchTable("places", gid),
      fetchTable("food", gid),
      fetchTable("activities", gid),
      fetchTable("messages", gid),
      fetchTable("members", gid),
      fetchTable("locations", gid),
      fetchSingle("parking", gid),
      fetchSingle("travel_status", gid)

    ]);

    data.events = events;
    data.packing = packing;
    data.places = places;
    data.food = food;
    data.activities = activities;
    data.messages = messages;
    data.members = members;
    data.locations = locations;
    data.parking = parking;
    data.travel_status = status;

    await loadProfiles();

    setupRealtime();

    renderAll();
  }

  async function fetchTable(table, gid) {

    const { data: rows, error } =
      await supabaseClient
        .from(table)
        .select("*")
        .eq("group_id", gid)
        .order("created_at", {
          ascending: true
        });

    if (error) {

      console.error(table, error);

      return [];
    }

    return rows || [];
  }

  async function fetchSingle(table, gid) {

    const { data: row, error } =
      await supabaseClient
        .from(table)
        .select("*")
        .eq("group_id", gid)
        .maybeSingle();

    if (error) {

      console.error(table, error);

      return null;
    }

    return row;
  }

  async function loadProfiles() {

    if (!onlineMode || !data.members.length) {

      return;
    }

    const ids =
      data.members
        .map(m => m.user_id)
        .filter(Boolean);

    const { data: profiles } =
      await supabaseClient
        .from("profiles")
        .select("*")
        .in("id", ids);

    data.profiles = profiles || [];
  }

  /* =======================================================
     GENERIC CRUD
     ======================================================= */

  async function insertRecord(
    table,
    values
  ) {

    if (!currentGroup) {

      toast("Primero crea o selecciona un viaje.");

      return null;
    }

    if (!onlineMode) {

      const record = {
        id: crypto.randomUUID(),
        group_id: currentGroup.id,
        created_at:
          new Date().toISOString(),
        ...values
      };

      data[table].push(record);

      saveOfflineData();

      renderAll();

      return record;
    }

    const { data: record, error } =
      await supabaseClient
        .from(table)
        .insert({
          group_id: currentGroup.id,
          ...values
        })
        .select()
        .single();

    if (error) {

      toast(translateError(error.message));

      return null;
    }

    data[table].push(record);

    renderAll();

    return record;
  }

  async function updateRecord(
    table,
    id,
    values
  ) {

    if (!onlineMode) {

      const list = data[table];

      const index =
        list.findIndex(x => x.id === id);

      if (index >= 0) {

        list[index] = {
          ...list[index],
          ...values
        };

        saveOfflineData();

        renderAll();
      }

      return;
    }

    const { data: record, error } =
      await supabaseClient
        .from(table)
        .update(values)
        .eq("id", id)
        .select()
        .single();

    if (error) {

      toast(translateError(error.message));

      return;
    }

    const index =
      data[table].findIndex(
        x => x.id === id
      );

    if (index >= 0) {

      data[table][index] = record;
    }

    renderAll();
  }

  async function deleteRecord(
    table,
    id
  ) {

    if (!confirm("¿Eliminar este elemento?")) {
      return;
    }

    if (!onlineMode) {

      data[table] =
        data[table].filter(
          x => x.id !== id
        );

      saveOfflineData();

      renderAll();

      return;
    }

    const { error } =
      await supabaseClient
        .from(table)
        .delete()
        .eq("id", id);

    if (error) {

      toast(translateError(error.message));

      return;
    }

    data[table] =
      data[table].filter(
        x => x.id !== id
      );

    renderAll();
  }

  /* =======================================================
     EVENTS
     ======================================================= */

  function openEventModal(item = null) {

    openModal(
      item ? "Editar evento" : "Añadir evento",
      [
        field("title", "Título", item?.title || "", true),
        field("date", "Fecha", item?.date || "", false, "date"),
        field("time", "Hora", item?.time || "", false, "time"),
        field("tag", "Categoría", item?.tag || "CUSTOM"),
        field(
          "description",
          "Descripción",
          item?.description || "",
          false,
          "textarea"
        )
      ],
      async values => {

        if (item) {

          await updateRecord(
            "events",
            item.id,
            values
          );

        } else {

          await insertRecord(
            "events",
            values
          );
        }

        closeModal();
      }
    );
  }

  /* =======================================================
     PACKING
     ======================================================= */

  async function addPacking() {

    const name =
      prompt("¿Qué necesitas llevar?");

    if (!name) return;

    await insertRecord(
      "packing",
      {
        name,
        done: false
      }
    );
  }

  async function togglePacking(item) {

    await updateRecord(
      "packing",
      item.id,
      {
        done: !item.done
      }
    );
  }

  /* =======================================================
     PLACES
     ======================================================= */

  function openPlaceModal(item = null) {

    openModal(
      item ? "Editar lugar" : "Añadir lugar",
      [
        field("name", "Nombre", item?.name || "", true),
        field("category", "Categoría", item?.category || "FAMILY"),
        field(
          "description",
          "Descripción",
          item?.description || "",
          false,
          "textarea"
        )
      ],
      async values => {

        if (item) {

          await updateRecord(
            "places",
            item.id,
            values
          );

        } else {

          await insertRecord(
            "places",
            values
          );
        }

        closeModal();
      }
    );
  }

  /* =======================================================
     FOOD
     ======================================================= */

  function openFoodModal(item = null) {

    openModal(
      item ? "Editar comida" : "Añadir comida",
      [
        field("name", "Nombre", item?.name || "", true),
        field("category", "Categoría", item?.category || "FOOD"),
        field(
          "description",
          "Descripción",
          item?.description || "",
          false,
          "textarea"
        )
      ],
      async values => {

        if (item) {

          await updateRecord(
            "food",
            item.id,
            values
          );

        } else {

          await insertRecord(
            "food",
            values
          );
        }

        closeModal();
      }
    );
  }

  /* =======================================================
     ACTIVITIES
     ======================================================= */

  function openActivityModal(item = null) {

    openModal(
      item ? "Editar actividad" : "Añadir actividad",
      [
        field("name", "Nombre", item?.name || "", true),
        field("category", "Categoría", item?.category || "FAMILY"),
        field(
          "description",
          "Descripción",
          item?.description || "",
          false,
          "textarea"
        )
      ],
      async values => {

        if (item) {

          await updateRecord(
            "activities",
            item.id,
            values
          );

        } else {

          await insertRecord(
            "activities",
            values
          );
        }

        closeModal();
      }
    );
  }

  /* =======================================================
     MESSAGES
     ======================================================= */

  async function sendMessage(event) {

    event.preventDefault();

    const input = $("messageInput");

    const body =
      input.value.trim();

    if (!body) return;

    if (!currentGroup) {

      toast("Primero crea un viaje.");

      return;
    }

    if (!onlineMode) {

      data.messages.push({
        id: crypto.randomUUID(),
        group_id: currentGroup.id,
        user_id: currentUser.id,
        body,
        created_at:
          new Date().toISOString()
      });

      saveOfflineData();

      input.value = "";

      renderMessages();

      return;
    }

    const { data: message, error } =
      await supabaseClient
        .from("messages")
        .insert({
          group_id: currentGroup.id,
          user_id: currentUser.id,
          body
        })
        .select()
        .single();

    if (error) {

      toast(translateError(error.message));

      return;
    }

    data.messages.push(message);

    input.value = "";

    renderMessages();
  }

  /* =======================================================
     LOCATION
     ======================================================= */

  function getCurrentPosition() {

    return new Promise(
      (resolve, reject) => {

        if (!navigator.geolocation) {

          reject(
            new Error(
              "Este navegador no permite ubicación."
            )
          );

          return;
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000
          }
        );
      }
    );
  }

  async function shareLocation() {

    try {

      const position =
        await getCurrentPosition();

      const lat =
        position.coords.latitude;

      const lon =
        position.coords.longitude;

      if (!currentGroup) {

        toast("Primero crea un viaje.");

        return;
      }

      if (!onlineMode) {

        data.locations =
          data.locations.filter(
            x =>
              x.user_id !==
              currentUser.id
          );

        data.locations.push({
          id: crypto.randomUUID(),
          group_id: currentGroup.id,
          user_id: currentUser.id,
          lat,
          lon,
          name: "Mi ubicación",
          updated_at:
            new Date().toISOString()
        });

        saveOfflineData();

      } else {

        const { error } =
          await supabaseClient
            .from("locations")
            .upsert(
              {
                group_id: currentGroup.id,
                user_id: currentUser.id,
                lat,
                lon,
                name: "Mi ubicación",
                updated_at:
                  new Date().toISOString()
              },
              {
                onConflict:
                  "group_id,user_id"
              }
            );

        if (error) {

          toast(translateError(error.message));

          return;
        }

        await loadGroupData();
      }

      $("myLocationStatus").textContent =
        `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

      toast("Ubicación guardada.");

    } catch (error) {

      toast(
        "No pude obtener tu ubicación. Revisa el permiso del navegador."
      );
    }
  }

  async function saveParking() {

    try {

      const position =
        await getCurrentPosition();

      const lat =
        position.coords.latitude;

      const lon =
        position.coords.longitude;

      if (!currentGroup) {

        toast("Primero crea un viaje.");

        return;
      }

      if (!onlineMode) {

        data.parking = {
          group_id: currentGroup.id,
          user_id: currentUser.id,
          lat,
          lon,
          updated_at:
            new Date().toISOString()
        };

        saveOfflineData();

      } else {

        const { error } =
          await supabaseClient
            .from("parking")
            .upsert(
              {
                group_id: currentGroup.id,
                user_id: currentUser.id,
                lat,
                lon,
                updated_at:
                  new Date().toISOString()
              },
              {
                onConflict: "group_id"
              }
            );

        if (error) {

          toast(translateError(error.message));

          return;
        }

        data.parking =
          await fetchSingle(
            "parking",
            currentGroup.id
          );
      }

      $("parkingStatus").textContent =
        `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

      toast("Parking guardado.");

    } catch (_) {

      toast(
        "No pude obtener tu ubicación."
      );
    }
  }

  /* =======================================================
     MEMBERS
     ======================================================= */

  function openMemberModal() {

    if (!currentGroup) {

      toast("Primero crea un viaje.");

      return;
    }

    openModal(
      "Añadir persona",
      [
        field(
          "name",
          "Nombre",
          "",
          true
        ),
        field(
          "role",
          "Rol",
          "adult"
        )
      ],
      async values => {

        if (!onlineMode) {

          data.members.push({
            id: crypto.randomUUID(),
            group_id: currentGroup.id,
            user_id:
              "local-" +
              crypto.randomUUID(),
            name: values.name,
            role: values.role
          });

          saveOfflineData();

          renderAll();

          closeModal();

          return;
        }

        /*
          En el sistema autenticado de Supabase,
          una persona compartida necesita crear su propia
          cuenta y entrar mediante el código del grupo.
        */

        toast(
          "Para una persona real, comparte el código del grupo para que cree su propia cuenta y se una."
        );

        closeModal();
      }
    );
  }

  async function removeMember(member) {

    if (!onlineMode) {

      data.members =
        data.members.filter(
          m => m.id !== member.id
        );

      saveOfflineData();

      renderAll();

      return;
    }

    if (
      member.user_id ===
      currentUser.id
    ) {

      await supabaseClient
        .from("members")
        .delete()
        .eq("id", member.id);

      data.members =
        data.members.filter(
          m => m.id !== member.id
        );

      renderAll();

      return;
    }

    if (
      !confirm(
        "¿Eliminar esta persona del grupo?"
      )
    ) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("members")
        .delete()
        .eq("id", member.id);

    if (error) {

      toast(translateError(error.message));

      return;
    }

    data.members =
      data.members.filter(
        m => m.id !== member.id
      );

    renderAll();
  }

  /* =======================================================
     MODAL
     ======================================================= */

  let modalSaveCallback = null;

  function openModal(
    title,
    fields,
    callback
  ) {

    $("modalTitle").textContent =
      title;

    $("modalFields").innerHTML =
      fields.join("");

    modalSaveCallback = callback;

    show("modal");
  }

  function closeModal() {

    hide("modal");

    $("modalFields").innerHTML = "";

    modalSaveCallback = null;
  }

  function field(
    name,
    label,
    value = "",
    required = false,
    type = "text"
  ) {

    if (type === "textarea") {

      return `
        <div class="modal-field">
          <label for="modal-${escapeAttr(name)}">
            ${escapeHTML(label)}
          </label>

          <textarea
            id="modal-${escapeAttr(name)}"
            data-field="${escapeAttr(name)}"
            rows="4"
          >${escapeHTML(value)}</textarea>
        </div>
      `;
    }

    return `
      <div class="modal-field">

        <label for="modal-${escapeAttr(name)}">
          ${escapeHTML(label)}
        </label>

        <input
          id="modal-${escapeAttr(name)}"
          data-field="${escapeAttr(name)}"
          type="${escapeAttr(type)}"
          value="${escapeAttr(value)}"
          ${required ? "required" : ""}
        />

      </div>
    `;
  }

  async function submitModal(event) {

    event.preventDefault();

    if (!modalSaveCallback) return;

    const values = {};

    $("modalFields")
      .querySelectorAll("[data-field]")
      .forEach(input => {

        values[input.dataset.field] =
          input.value.trim();
      });

    await modalSaveCallback(values);
  }

  /* =======================================================
     RENDER
     ======================================================= */

  function renderAll() {

    updateHome();
    renderEvents();
    renderPacking();
    renderPlaces();
    renderFood();
    renderActivities();
    renderMessages();
    renderLocations();
    renderGroup();
  }

  function updateHome() {

    $("homeTripName").textContent =
      currentGroup?.name ||
      "Crea tu primera aventura";

    $("homeDestination").textContent =
      currentGroup?.destination ||
      "Organiza todo en un solo lugar.";

    $("statEvents").textContent =
      data.events.length;

    const total =
      data.packing.length;

    const done =
      data.packing.filter(
        x => x.done
      ).length;

    $("statPacking").textContent =
      `${done}/${total}`;

    $("statPlaces").textContent =
      data.places.length;

    $("statMembers").textContent =
      data.members.length;

    $("homeEvents").innerHTML =
      data.events.length
        ? data.events
            .slice(0, 5)
            .map(eventMiniHTML)
            .join("")
        : emptyHTML(
            "Todavía no hay eventos."
          );

    $("homeMembers").innerHTML =
      data.members.length
        ? data.members
            .slice(0, 6)
            .map(memberHTML)
            .join("")
        : emptyHTML(
            "Todavía no hay personas."
          );
  }

  function renderEvents() {

    $("eventsList").innerHTML =
      data.events.length
        ? data.events
            .map(eventHTML)
            .join("")
        : emptyHTML(
            "Todavía no tienes eventos. Añade el primero."
          );
  }

  function renderPacking() {

    const total =
      data.packing.length;

    const done =
      data.packing.filter(
        x => x.done
      ).length;

    const percent =
      total
        ? Math.round(
            done / total * 100
          )
        : 0;

    $("packingProgressText").textContent =
      `${percent}%`;

    $("packingProgressBar").style.width =
      `${percent}%`;

    $("packingList").innerHTML =
      data.packing.length
        ? data.packing
            .map(item => `
              <div class="check-item ${item.done ? "done" : ""}">

                <div class="check-main">

                  <input
                    type="checkbox"
                    ${item.done ? "checked" : ""}
                    data-packing-toggle="${item.id}"
                  />

                  <span class="check-name">
                    ${escapeHTML(item.name)}
                  </span>

                </div>

                <div class="card-actions">

                  <button
                    class="delete-btn"
                    data-delete-table="packing"
                    data-delete-id="${item.id}"
                  >
                    Eliminar
                  </button>

                </div>

              </div>
            `)
            .join("")
        : emptyHTML(
            "Tu packing list está vacío."
          );
  }

  function renderPlaces() {

    $("placesList").innerHTML =
      data.places.length
        ? data.places
            .map(item =>
              genericCard(
                item,
                "places"
              )
            )
            .join("")
        : emptyHTML(
            "Añade lugares que quieran visitar."
          );
  }

  function renderFood() {

    $("foodList").innerHTML =
      data.food.length
        ? data.food
            .map(item =>
              genericCard(
                item,
                "food"
              )
            )
            .join("")
        : emptyHTML(
            "Añade restaurantes o comidas."
          );
  }

  function renderActivities() {

    $("activitiesList").innerHTML =
      data.activities.length
        ? data.activities
            .map(item =>
              genericCard(
                item,
                "activities"
              )
            )
            .join("")
        : emptyHTML(
            "Añade actividades para el viaje."
          );
  }

  function renderMessages() {

    const list =
      $("messagesList");

    list.innerHTML =
      data.messages.length
        ? data.messages
            .map(message => {

              const mine =
                message.user_id ===
                currentUser?.id;

              const profile =
                data.profiles.find(
                  p =>
                    p.id ===
                    message.user_id
                );

              const name =
                profile?.name ||
                (mine ? "Yo" : "Familia");

              return `
                <div class="message ${mine ? "mine" : ""}">

                  <div class="message-author">
                    ${escapeHTML(name)}
                  </div>

                  <div class="message-body">
                    ${escapeHTML(message.body)}
                  </div>

                  <div class="message-time">
                    ${formatDateTime(
                      message.created_at
                    )}
                  </div>

                </div>
              `;
            })
            .join("")
        : emptyHTML(
            "Todavía no hay mensajes."
          );
  }

  function renderLocations() {

    $("locationsList").innerHTML =
      data.locations.length
        ? data.locations
            .map(location => {

              const profile =
                data.profiles.find(
                  p =>
                    p.id ===
                    location.user_id
                );

              const name =
                profile?.name ||
                (
                  location.user_id ===
                  currentUser?.id
                    ? "Yo"
                    : "Familia"
                );

              return `
                <div class="item-card">

                  <div class="eyebrow">
                    UBICACIÓN
                  </div>

                  <h3>
                    ${escapeHTML(name)}
                  </h3>

                  <p>
                    ${location.lat.toFixed(5)},
                    ${location.lon.toFixed(5)}
                  </p>

                  <a
                    class="btn secondary"
                    target="_blank"
                    rel="noopener"
                    href="https://www.google.com/maps?q=${location.lat},${location.lon}"
                  >
                    Abrir mapa
                  </a>

                </div>
              `;
            })
            .join("")
        : emptyHTML(
            "Nadie ha compartido ubicación."
          );
  }

  function renderGroup() {

    if (!currentGroup) {

      $("groupInfo").innerHTML = `
        <div class="empty-state">
          <strong>No tienes un viaje todavía.</strong>
          <p>
            Crea uno desde Inicio para comenzar.
          </p>
        </div>
      `;

      $("membersList").innerHTML = "";

      return;
    }

    $("groupInfo").innerHTML = `
      <div class="eyebrow">
        VIAJE ACTUAL
      </div>

      <h2>
        ${escapeHTML(currentGroup.name)}
      </h2>

      <p>
        ${escapeHTML(
          currentGroup.destination ||
          "Sin destino"
        )}
      </p>

      <div class="group-code">
        Código:
        ${escapeHTML(
          currentGroup.invite_code ||
          "LOCAL"
        )}
      </div>
    `;

    $("membersList").innerHTML =
      data.members.length
        ? data.members
            .map(member => `
              <div class="item-card">

                <div class="member-row">

                  <div class="member-avatar">
                    ${escapeHTML(
                      (
                        getMemberName(member)
                          .charAt(0) || "?"
                      ).toUpperCase()
                    )}
                  </div>

                  <div class="member-info">

                    <strong>
                      ${escapeHTML(
                        getMemberName(member)
                      )}
                    </strong>

                    <span>
                      ${escapeHTML(
                        member.role || "adult"
                      )}
                    </span>

                  </div>

                  <button
                    class="delete-btn"
                    data-remove-member="${member.id}"
                  >
                    Eliminar
                  </button>

                </div>

              </div>
            `)
            .join("")
        : emptyHTML(
            "Todavía no hay miembros."
          );
  }

  /* =======================================================
     HTML HELPERS
     ======================================================= */

  function eventMiniHTML(event) {

    return `
      <div class="member-row">

        <div class="member-avatar">
          ${event.date ? "📅" : "✈"}
        </div>

        <div class="member-info">

          <strong>
            ${escapeHTML(event.title)}
          </strong>

          <span>
            ${escapeHTML(
              event.date ||
              event.time ||
              ""
            )}
          </span>

        </div>

      </div>
    `;
  }

  function eventHTML(event) {

    return `
      <div class="item-card">

        <div class="item-meta">

          ${
            event.date
              ? `<span class="tag">
                   ${escapeHTML(event.date)}
                 </span>`
              : ""
          }

          ${
            event.time
              ? `<span class="tag">
                   ${escapeHTML(event.time)}
                 </span>`
              : ""
          }

          <span class="tag">
            ${escapeHTML(event.tag || "CUSTOM")}
          </span>

        </div>

        <h3>
          ${escapeHTML(event.title)}
        </h3>

        <p>
          ${escapeHTML(
            event.description || "Sin descripción."
          )}
        </p>

        <div class="card-actions">

          <button
            class="edit-btn"
            data-edit-event="${event.id}"
          >
            Editar
          </button>

          <button
            class="delete-btn"
            data-delete-table="events"
            data-delete-id="${event.id}"
          >
            Eliminar
          </button>

        </div>

      </div>
    `;
  }

  function genericCard(item, table) {

    return `
      <div class="item-card">

        <div class="item-meta">
          <span class="tag">
            ${escapeHTML(
              item.category || "FAMILY"
            )}
          </span>
        </div>

        <h3>
          ${escapeHTML(item.name)}
        </h3>

        <p>
          ${escapeHTML(
            item.description ||
            "Sin descripción."
          )}
        </p>

        <div class="card-actions">

          <button
            class="edit-btn"
            data-edit-table="${table}"
            data-edit-id="${item.id}"
          >
            Editar
          </button>

          <button
            class="delete-btn"
            data-delete-table="${table}"
            data-delete-id="${item.id}"
          >
            Eliminar
          </button>

        </div>

      </div>
    `;
  }

  function memberHTML(member) {

    return `
      <div class="member-row">

        <div class="member-avatar">
          ${escapeHTML(
            getMemberName(member)
              .charAt(0)
              .toUpperCase()
          )}
        </div>

        <div class="member-info">

          <strong>
            ${escapeHTML(
              getMemberName(member)
            )}
          </strong>

          <span>
            ${escapeHTML(
              member.role || "adult"
            )}
          </span>

        </div>

      </div>
    `;
  }

  function getMemberName(member) {

    if (member.name) {
      return member.name;
    }

    const profile =
      data.profiles.find(
        p =>
          p.id === member.user_id
      );

    return (
      profile?.name ||
      (
        member.user_id ===
        currentUser?.id
          ? "Yo"
          : "Miembro"
      )
    );
  }

  function emptyHTML(text) {

    return `
      <div class="empty-state">
        ${escapeHTML(text)}
      </div>
    `;
  }

  /* =======================================================
     REALTIME
     ======================================================= */

  function setupRealtime() {

    if (
      !onlineMode ||
      !currentGroup ||
      !supabaseClient
    ) {
      return;
    }

    if (realtimeChannel) {

      supabaseClient
        .removeChannel(
          realtimeChannel
        );
    }

    realtimeChannel =
      supabaseClient
        .channel(
          "family-hub-" +
          currentGroup.id
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "events",
            filter:
              `group_id=eq.${currentGroup.id}`
          },
          () => loadGroupData()
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "packing",
            filter:
              `group_id=eq.${currentGroup.id}`
          },
          () => loadGroupData()
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter:
              `group_id=eq.${currentGroup.id}`
          },
          () => loadGroupData()
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "locations",
            filter:
              `group_id=eq.${currentGroup.id}`
          },
          () => loadGroupData()
        )
        .subscribe();
  }

  /* =======================================================
     EVENTS / BINDINGS
     ======================================================= */

  function bindEvents() {

    $("saveConfigBtn")
      .addEventListener(
        "click",
        saveConfiguration
      );

    $("useOfflineFromConfig")
      .addEventListener(
        "click",
        enterOffline
      );

    $("loginTab")
      .addEventListener(
        "click",
        () => setAuthTab("login")
      );

    $("signupTab")
      .addEventListener(
        "click",
        () => setAuthTab("signup")
      );

    $("loginForm")
      .addEventListener(
        "submit",
        login
      );

    $("signupForm")
      .addEventListener(
        "submit",
        signup
      );

    $("forgotPasswordBtn")
      .addEventListener(
        "click",
        forgotPassword
      );

    $("offlineBtn")
      .addEventListener(
        "click",
        enterOffline
      );

    $("resetConfigBtn")
      .addEventListener(
        "click",
        showConfig
      );

    $("logoutBtn")
      .addEventListener(
        "click",
        logout
      );

    $("settingsLogoutBtn")
      .addEventListener(
        "click",
        logout
      );

    $("settingsConfigBtn")
      .addEventListener(
        "click",
        showConfig
      );

    $("homeCreateTripBtn")
      .addEventListener(
        "click",
        createGroup
      );

    $("homeJoinTripBtn")
      .addEventListener(
        "click",
        joinGroup
      );

    $("addEventBtn")
      .addEventListener(
        "click",
        () => openEventModal()
      );

    $("addPackingBtn")
      .addEventListener(
        "click",
        addPacking
      );

    $("addPlaceBtn")
      .addEventListener(
        "click",
        () => openPlaceModal()
      );

    $("addFoodBtn")
      .addEventListener(
        "click",
        () => openFoodModal()
      );

    $("addActivityBtn")
      .addEventListener(
        "click",
        () => openActivityModal()
      );

    $("messageForm")
      .addEventListener(
        "submit",
        sendMessage
      );

    $("shareLocationBtn")
      .addEventListener(
        "click",
        shareLocation
      );

    $("saveParkingBtn")
      .addEventListener(
        "click",
        saveParking
      );

    $("addMemberBtn")
      .addEventListener(
        "click",
        openMemberModal
      );

    $("modalClose")
      .addEventListener(
        "click",
        closeModal
      );

    $("modalCancel")
      .addEventListener(
        "click",
        closeModal
      );

    $("modalBackdrop")
      .addEventListener(
        "click",
        closeModal
      );

    $("modalForm")
      .addEventListener(
        "submit",
        submitModal
      );

    $("mobileMenuBtn")
      .addEventListener(
        "click",
        () => {
          document
            .querySelector(".sidebar")
            ?.classList.toggle("open");
        }
      );

    document.addEventListener(
      "click",
      handleDelegatedClick
    );

    window.addEventListener(
      "online",
      updateConnectionUI
    );

    window.addEventListener(
      "offline",
      updateConnectionUI
    );
  }

  async function handleDelegatedClick(event) {

    const nav =
      event.target.closest(
        ".nav-item"
      );

    if (nav) {

      navigate(
        nav.dataset.view
      );

      return;
    }

    const link =
      event.target.closest(
        "[data-view-link]"
      );

    if (link) {

      navigate(
        link.dataset.viewLink
      );

      return;
    }

    const deleteButton =
      event.target.closest(
        "[data-delete-table]"
      );

    if (deleteButton) {

      await deleteRecord(
        deleteButton.dataset.deleteTable,
        deleteButton.dataset.deleteId
      );

      return;
    }

    const toggle =
      event.target.closest(
        "[data-packing-toggle]"
      );

    if (toggle) {

      const item =
        data.packing.find(
          x =>
            x.id ===
            toggle.dataset.packingToggle
        );

      if (item) {

        await togglePacking(item);
      }

      return;
    }

    const editEvent =
      event.target.closest(
        "[data-edit-event]"
      );

    if (editEvent) {

      const item =
        data.events.find(
          x =>
            x.id ===
            editEvent.dataset.editEvent
        );

      if (item) {

        openEventModal(item);
      }

      return;
    }

    const editButton =
      event.target.closest(
        "[data-edit-table]"
      );

    if (editButton) {

      const table =
        editButton.dataset.editTable;

      const item =
        data[table].find(
          x =>
            x.id ===
            editButton.dataset.editId
        );

      if (!item) return;

      if (table === "places") {
        openPlaceModal(item);
      }

      if (table === "food") {
        openFoodModal(item);
      }

      if (table === "activities") {
        openActivityModal(item);
      }

      return;
    }

    const removeMemberButton =
      event.target.closest(
        "[data-remove-member]"
      );

    if (removeMemberButton) {

      const member =
        data.members.find(
          m =>
            m.id ===
            removeMemberButton.dataset.removeMember
        );

      if (member) {

        await removeMember(member);
      }
    }
  }

  /* =======================================================
     UTILITIES
     ======================================================= */

  function show(id) {
    $(id)?.classList.remove("hidden");
  }

  function hide(id) {
    $(id)?.classList.add("hidden");
  }

  function toast(message) {

    const element =
      $("toast");

    element.textContent =
      message;

    element.classList.add("show");

    clearTimeout(
      element._timeout
    );

    element._timeout =
      setTimeout(
        () => {
          element.classList.remove(
            "show"
          );
        },
        3200
      );
  }

  function setBusy(form, busy) {

    const button =
      form.querySelector(
        "button[type=submit]"
      );

    if (!button) return;

    button.disabled = busy;

    if (busy) {

      button.dataset.originalText =
        button.textContent;

      button.textContent =
        "Procesando...";

    } else {

      button.textContent =
        button.dataset.originalText ||
        "Guardar";
    }
  }

  function generateInviteCode() {

    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "FAM-";

    for (let i = 0; i < 6; i++) {

      code +=
        chars[
          Math.floor(
            Math.random() *
            chars.length
          )
        ];
    }

    return code;
  }

  function formatDateTime(value) {

    if (!value) return "";

    try {

      return new Intl.DateTimeFormat(
        "es-PR",
        {
          dateStyle: "short",
          timeStyle: "short"
        }
      ).format(
        new Date(value)
      );

    } catch (_) {

      return "";
    }
  }

  function escapeHTML(value) {

    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {

    return escapeHTML(value);
  }

  function translateError(message) {

    const text =
      String(message || "");

    if (
      /invalid login credentials/i
        .test(text)
    ) {
      return "Email o contraseña incorrectos.";
    }

    if (
      /email not confirmed/i
        .test(text)
    ) {
      return "Primero confirma tu email.";
    }

    if (
      /user already registered/i
        .test(text)
    ) {
      return "Ya existe una cuenta con ese email.";
    }

    if (
      /password should be at least/i
        .test(text)
    ) {
      return "La contraseña debe tener al menos 6 caracteres.";
    }

    if (
      /duplicate key/i
        .test(text)
    ) {
      return "Ese elemento ya existe.";
    }

    if (
      /row-level security/i
        .test(text)
    ) {
      return "Supabase bloqueó esta acción por las reglas de seguridad (RLS).";
    }

    return text;
  }

})();
