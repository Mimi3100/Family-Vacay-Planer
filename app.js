/* =========================================================
   NUESTRA AVENTURA · FAMILY HUB
   APP.JS
   ========================================================= */

(() => {
  "use strict";

  /* =======================================================
     STORAGE
     ======================================================= */

  const STORAGE_CONFIG =
    "nuestra_aventura_supabase_config";

  const STORAGE_OFFLINE =
    "nuestra_aventura_offline_data";

  const STORAGE_GROUP =
    "nuestra_aventura_current_group";


  /* =======================================================
     STATE
     ======================================================= */

  let supabaseClient = null;

  let onlineMode = false;

  let currentUser = null;

  let currentGroup = null;

  let currentView = "home";

  let authListenerRegistered = false;

  let authTransitionRunning = false;


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


  /* =======================================================
     SHORTCUT
     ======================================================= */

  const $ = (id) =>
    document.getElementById(id);


  /* =======================================================
     INIT
     ======================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    init
  );


  async function init() {

    try {

      bindEvents();

    } catch (error) {

      console.error(
        "Error inicializando eventos:",
        error
      );

      return;
    }


    /*
      Intentamos primero la configuración
      incluida en config.js.
    */

    let config =
      getAppConfig();


    /*
      Si config.js no tiene una configuración válida,
      revisamos una configuración guardada anteriormente
      en este dispositivo.
    */

    if (!config.valid) {

      const savedConfig =
        readSavedConfig();

      if (savedConfig.valid) {

        window.APP_CONFIG =
          window.APP_CONFIG || {};

        window.APP_CONFIG.SUPABASE_URL =
          savedConfig.url;

        window.APP_CONFIG.SUPABASE_KEY =
          savedConfig.key;

        window.APP_CONFIG.SUPABASE_ANON_KEY =
          savedConfig.key;

        config =
          getAppConfig();
      }
    }


    /*
      Si tenemos una configuración válida,
      conectamos Supabase.
    */

    if (config.valid) {

      const connected =
        await initializeSupabase(
          config.url,
          config.key
        );


      if (connected) {

        await setupAuthListener();

        await checkExistingSession();

        return;
      }
    }


    /*
      Si no hay configuración,
      mostramos configuración/login.
    */

    showAuthOrConfig();
  }


  /* =======================================================
     CONFIG HELPERS
     ======================================================= */

  function getAppConfig() {

    const appConfig =
      window.APP_CONFIG || {};


    const url =
      String(
        appConfig.SUPABASE_URL || ""
      ).trim();


    const key =
      String(
        appConfig.SUPABASE_ANON_KEY ||
        appConfig.SUPABASE_KEY ||
        ""
      ).trim();


    const validUrl =
      /^https?:\/\/.+/i.test(url);


    return {
      url,
      key,
      valid:
        validUrl &&
        Boolean(key)
    };
  }


  function readSavedConfig() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE_CONFIG
        );


      if (!raw) {

        return {
          url: "",
          key: "",
          valid: false
        };
      }


      const parsed =
        JSON.parse(raw);


      const url =
        String(
          parsed.url || ""
        ).trim();


      const key =
        String(
          parsed.key || ""
        ).trim();


      return {
        url,
        key,
        valid:
          /^https?:\/\/.+/i.test(url) &&
          Boolean(key)
      };

    } catch (_) {

      return {
        url: "",
        key: "",
        valid: false
      };
    }
  }


  /* =======================================================
     SUPABASE
     ======================================================= */

  async function initializeSupabase(
    url,
    key
  ) {

    url =
      String(url || "").trim();

    key =
      String(key || "").trim();


    if (
      !/^https?:\/\/.+/i.test(url)
    ) {

      console.error(
        "Supabase URL inválida:",
        url
      );

      return false;
    }


    if (!key) {

      console.error(
        "Supabase key vacía."
      );

      return false;
    }


    if (
      !window.supabase ||
      typeof window.supabase.createClient !==
        "function"
    ) {

      console.error(
        "La librería de Supabase no está cargada."
      );

      return false;
    }


    try {

      supabaseClient =
        window.supabase.createClient(
          url,
          key,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storage:
                window.localStorage
            }
          }
        );


      onlineMode = true;

      updateConnectionUI();

      return true;

    } catch (error) {

      console.error(
        "Supabase initialization error:",
        error
      );

      supabaseClient = null;

      onlineMode = false;

      return false;
    }
  }


  /* =======================================================
     AUTH LISTENER
     ======================================================= */

  async function setupAuthListener() {

    if (
      authListenerRegistered ||
      !supabaseClient
    ) {
      return;
    }


    authListenerRegistered = true;


    supabaseClient.auth.onAuthStateChange(
      (event, session) => {

        /*
          No hacemos consultas Supabase directamente
          dentro del callback de autenticación.
          Dejamos que termine el evento primero.
        */

        setTimeout(
          async () => {

            try {

              if (session?.user) {

                currentUser =
                  session.user;

                /*
                  SIGNED_IN:
                  El login ya está manejando la navegación.

                  INITIAL_SESSION:
                  Si había una sesión guardada,
                  sí debemos cargar la aplicación.
                */

                if (
                  event ===
                    "INITIAL_SESSION"
                ) {

                  await handleAuthenticatedUser(
                    session.user
                  );
                }

              } else if (
                event ===
                "SIGNED_OUT"
              ) {

                currentUser = null;

                currentGroup = null;

                if (
                  !document
                    .getElementById("authScreen")
                    ?.classList.contains("hidden")
                ) {
                  return;
                }

                showAuth();
              }

            } catch (error) {

              console.error(
                "Auth state error:",
                error
              );
            }

          },
          0
        );
      }
    );
  }


  /* =======================================================
     SESSION
     ======================================================= */

  async function checkExistingSession() {

    if (!supabaseClient) {

      showAuth();

      return;
    }


    try {

      const {
        data: sessionData,
        error
      } =
        await supabaseClient.auth.getSession();


      if (error) {

        console.error(
          "getSession:",
          error
        );

        showAuth();

        return;
      }


      const session =
        sessionData?.session;


      if (session?.user) {

        currentUser =
          session.user;

        await handleAuthenticatedUser(
          session.user
        );

      } else {

        showAuth();
      }

    } catch (error) {

      console.error(
        "Session check error:",
        error
      );

      showAuth();
    }
  }


  async function handleAuthenticatedUser(
    user
  ) {

    if (
      !user ||
      authTransitionRunning
    ) {
      return;
    }


    authTransitionRunning = true;


    try {

      currentUser = user;


      /*
        El perfil es secundario.
        Si falla, no debe sacar al usuario
        de la aplicación.
      */

      try {

        await ensureProfile();

      } catch (error) {

        console.warn(
          "Profile error:",
          error
        );
      }


      /*
        Cargar grupos también es secundario.
      */

      try {

        await loadGroups();

      } catch (error) {

        console.warn(
          "Groups error:",
          error
        );

        currentGroup = null;
      }


      showApp();

    } finally {

      authTransitionRunning = false;
    }
  }


  async function ensureProfile() {

    if (
      !onlineMode ||
      !currentUser ||
      !supabaseClient
    ) {
      return;
    }


    const name =
      currentUser.user_metadata?.name ||
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split("@")[0] ||
      "Usuario";


    const {
      error
    } =
      await supabaseClient
        .from("profiles")
        .upsert(
          {
            id: currentUser.id,
            email:
              currentUser.email || "",
            name
          },
          {
            onConflict: "id"
          }
        );


    if (error) {

      console.warn(
        "Profile:",
        error.message
      );
    }
  }


  /* =======================================================
     CONFIGURATION SCREEN
     ======================================================= */

  function showAuthOrConfig() {

    hide("loadingScreen");


    const config =
      getAppConfig();


    if (config.valid) {

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


    const config =
      getAppConfig();


    if ($("setupUrl")) {

      $("setupUrl").value =
        config.url || "";
    }


    if ($("setupKey")) {

      $("setupKey").value =
        config.key || "";
    }
  }


  async function saveConfiguration() {

    const url =
      $("setupUrl")
        ?.value
        .trim() || "";


    const key =
      $("setupKey")
        ?.value
        .trim() || "";


    if ($("configError")) {

      $("configError").textContent =
        "";
    }


    if (
      !/^https?:\/\/.+/i.test(url)
    ) {

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
      await initializeSupabase(
        url,
        key
      );


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


    window.APP_CONFIG =
      window.APP_CONFIG || {};


    window.APP_CONFIG.SUPABASE_URL =
      url;


    window.APP_CONFIG.SUPABASE_KEY =
      key;


    window.APP_CONFIG.SUPABASE_ANON_KEY =
      key;


    await setupAuthListener();


    toast(
      "Supabase conectado."
    );


    showAuth();
  }


  /* =======================================================
     AUTH UI
     ======================================================= */

  function showAuth() {

    hide("loadingScreen");

    hide("configScreen");

    hide("app");

    show("authScreen");


    setAuthTab("login");


    if ($("authMessage")) {

      $("authMessage").textContent =
        "";
    }
  }


  function setAuthTab(type) {

    const login =
      type === "login";


    $("loginTab")
      ?.classList
      .toggle(
        "active",
        login
      );


    $("signupTab")
      ?.classList
      .toggle(
        "active",
        !login
      );


    $("loginForm")
      ?.classList
      .toggle(
        "hidden",
        !login
      );


    $("signupForm")
      ?.classList
      .toggle(
        "hidden",
        login
      );


    if ($("authMessage")) {

      $("authMessage").textContent =
        "";
    }
  }


  /* =======================================================
     LOGIN
     ======================================================= */

  async function login(event) {

    event.preventDefault();


    const form =
      event.currentTarget;


    const message =
      $("authMessage");


    if (message) {

      message.textContent =
        "";
    }


    if (
      !supabaseClient ||
      !onlineMode
    ) {

      if (message) {

        message.textContent =
          "La conexión con Supabase no está disponible. Recarga la aplicación.";
      }

      return;
    }


    const email =
      $("loginEmail")
        ?.value
        .trim() || "";


    const password =
      $("loginPassword")
        ?.value || "";


    if (!email) {

      if (message) {

        message.textContent =
          "Escribe tu email.";
      }

      return;
    }


    if (!password) {

      if (message) {

        message.textContent =
          "Escribe tu contraseña.";
      }

      return;
    }


    setBusy(
      form,
      true
    );


    try {

      const {
        data: result,
        error
      } =
        await supabaseClient.auth
          .signInWithPassword({
            email,
            password
          });


      if (error) {

        console.error(
          "Supabase login:",
          error
        );


        if (message) {

          message.textContent =
            translateError(
              error.message
            );
        }

        return;
      }


      if (!result?.user) {

        if (message) {

          message.textContent =
            "Supabase no devolvió un usuario válido.";
        }

        return;
      }


      /*
        El login fue exitoso.
        Guardamos el usuario inmediatamente.
      */

      currentUser =
        result.user;


      /*
        Supabase ya guarda la sesión
        porque persistSession=true.
      */


      try {

        await ensureProfile();

      } catch (error) {

        console.warn(
          "Profile after login:",
          error
        );
      }


      try {

        await loadGroups();

      } catch (error) {

        console.warn(
          "Groups after login:",
          error
        );

        currentGroup = null;
      }


      /*
        Entramos a la app.
      */

      showApp();


      /*
        Limpiamos solamente la contraseña
        después de un login exitoso.
      */

      if ($("loginPassword")) {

        $("loginPassword").value =
          "";
      }

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      if (message) {

        message.textContent =
          translateError(
            error?.message ||
            "No pude iniciar sesión."
          );
      }

    } finally {

      setBusy(
        form,
        false
      );
    }
  }


  /* =======================================================
     SIGNUP
     ======================================================= */

  async function signup(event) {

    event.preventDefault();


    const form =
      event.currentTarget;


    if (!supabaseClient) {

      $("authMessage").textContent =
        "Configura Supabase primero.";

      return;
    }


    const name =
      $("signupName")
        .value
        .trim();


    const email =
      $("signupEmail")
        .value
        .trim();


    const password =
      $("signupPassword")
        .value;


    const password2 =
      $("signupPassword2")
        .value;


    if (!name) {

      $("authMessage").textContent =
        "Escribe tu nombre.";

      return;
    }


    if (!email) {

      $("authMessage").textContent =
        "Escribe tu email.";

      return;
    }


    if (!password) {

      $("authMessage").textContent =
        "Escribe una contraseña.";

      return;
    }


    if (password !== password2) {

      $("authMessage").textContent =
        "Las contraseñas no coinciden.";

      return;
    }


    if (password.length < 6) {

      $("authMessage").textContent =
        "La contraseña debe tener al menos 6 caracteres.";

      return;
    }


    setBusy(
      form,
      true
    );


    try {

      const {
        data: result,
        error
      } =
        await supabaseClient.auth
          .signUp({
            email,
            password,
            options: {
              data: {
                name
              },
              emailRedirectTo:
                window.APP_CONFIG?.SITE_URL ||
                window.location.origin
            }
          });


      if (error) {

        $("authMessage").textContent =
          translateError(
            error.message
          );

        return;
      }


      if (result?.session) {

        currentUser =
          result.user;


        try {

          await ensureProfile();

        } catch (error) {

          console.warn(
            "Profile after signup:",
            error
          );
        }


        try {

          await loadGroups();

        } catch (error) {

          console.warn(
            "Groups after signup:",
            error
          );

          currentGroup = null;
        }


        showApp();

      } else {

        $("authMessage").textContent =
          "Cuenta creada. Revisa tu email para confirmar la cuenta y luego entra.";
      }

    } catch (error) {

      console.error(
        "SIGNUP ERROR:",
        error
      );


      $("authMessage").textContent =
        translateError(
          error?.message ||
          "No pude crear la cuenta."
        );

    } finally {

      setBusy(
        form,
        false
      );
    }
  }


  /* =======================================================
     PASSWORD RESET
     ======================================================= */

  async function forgotPassword() {

    if (!supabaseClient) {

      $("authMessage").textContent =
        "Configura Supabase primero.";

      return;
    }


    const email =
      $("loginEmail")
        .value
        .trim();


    if (!email) {

      $("authMessage").textContent =
        "Escribe tu email primero.";

      return;
    }


    try {

      const {
        error
      } =
        await supabaseClient.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo:
                window.APP_CONFIG?.SITE_URL ||
                window.location.origin
            }
          );


      $("authMessage").textContent =
        error
          ? translateError(
              error.message
            )
          : "Te envié instrucciones para cambiar tu contraseña.";

    } catch (error) {

      console.error(
        "PASSWORD RESET:",
        error
      );


      $("authMessage").textContent =
        translateError(
          error?.message ||
          "No pude enviar el email."
        );
    }
  }


  /* =======================================================
     LOGOUT
     ======================================================= */

  async function logout() {

    try {

      if (
        onlineMode &&
        supabaseClient
      ) {

        await supabaseClient.auth
          .signOut();
      }

    } catch (error) {

      console.error(
        "Logout:",
        error
      );
    }


    currentUser = null;

    currentGroup = null;

    localStorage.removeItem(
      STORAGE_GROUP
    );


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
          localStorage.getItem(
            STORAGE_OFFLINE
          ) || "{}"
        );


      data = {
        events:
          saved.events || [],

        packing:
          saved.packing || [],

        places:
          saved.places || [],

        food:
          saved.food || [],

        activities:
          saved.activities || [],

        messages:
          saved.messages || [],

        members:
          saved.members || [],

        profiles:
          saved.profiles || [],

        locations:
          saved.locations || [],

        parking:
          saved.parking || null,

        travel_status:
          saved.travel_status || null
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
        group:
          currentGroup
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


    if ($("userNameDisplay")) {

      $("userNameDisplay").textContent =
        name;
    }


    if ($("settingsUserName")) {

      $("settingsUserName").textContent =
        name;
    }


    if ($("settingsUserEmail")) {

      $("settingsUserEmail").textContent =
        currentUser?.email ||
        "Modo offline";
    }


    const avatar =
      $("userPill")
        ?.querySelector(".avatar");


    if (avatar) {

      avatar.textContent =
        name
          .charAt(0)
          .toUpperCase();
    }
  }


  function updateConnectionUI() {

    const badge =
      $("connectionBadge");


    if (!badge) return;


    const online =
      onlineMode &&
      navigator.onLine;


    badge.classList.toggle(
      "online",
      online
    );


    const label =
      badge.querySelector(
        "span:last-child"
      );


    if (label) {

      label.textContent =
        online
          ? "Conectado"
          : "Offline";
    }


    if ($("settingsConnection")) {

      $("settingsConnection")
        .textContent =
          online
            ? "Conectado a Supabase"
            : "Modo offline";
    }
  }


  /* =======================================================
     NAVIGATION
     ======================================================= */

  function navigate(view) {

    currentView =
      view;


    document
      .querySelectorAll(".view")
      .forEach(
        el => {
          el.classList.remove(
            "active"
          );
        }
      );


    const target =
      $("view-" + view);


    if (target) {

      target.classList.add(
        "active"
      );
    }


    document
      .querySelectorAll(".nav-item")
      .forEach(
        btn => {

          btn.classList.toggle(
            "active",
            btn.dataset.view ===
              view
          );
        }
      );


    const titles = {

      home: [
        "FAMILY HUB",
        "Nuestra aventura"
      ],

      itinerary: [
        "PLAN",
        "Itinerario"
      ],

      packing: [
        "PREPARACIÓN",
        "Packing"
      ],

      places: [
        "EXPLORAR",
        "Lugares"
      ],

      food: [
        "COMER",
        "Comida"
      ],

      activities: [
        "PLANES",
        "Actividades"
      ],

      messages: [
        "FAMILIA",
        "Mensajes"
      ],

      location: [
        "UBICACIÓN",
        "Ubicación & Parking"
      ],

      group: [
        "FAMILIA",
        "Mi grupo"
      ],

      settings: [
        "APP",
        "Configuración"
      ]
    };


    if ($("pageEyebrow")) {

      $("pageEyebrow")
        .textContent =
          titles[view]?.[0] ||
          "FAMILY HUB";
    }


    if ($("pageTitle")) {

      $("pageTitle")
        .textContent =
          titles[view]?.[1] ||
          "Nuestra aventura";
    }


    document
      .querySelector(".sidebar")
      ?.classList.remove(
        "open"
      );
  }


  /* =======================================================
     GROUPS
     ======================================================= */

  async function loadGroups() {

    if (
      !onlineMode ||
      !currentUser ||
      !supabaseClient
    ) {
      return;
    }


    const {
      data: groups,
      error
    } =
      await supabaseClient
        .from("groups")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    if (error) {

      console.error(
        "Groups:",
        error
      );

      return;
    }


    if (!groups?.length) {

      currentGroup = null;

      data.members = [];

      return;
    }


    const savedId =
      localStorage.getItem(
        STORAGE_GROUP
      );


    currentGroup =
      groups.find(
        g =>
          g.id === savedId
      ) ||
      groups[0];


    localStorage.setItem(
      STORAGE_GROUP,
      currentGroup.id
    );


    await loadGroupData();
  }


  async function createGroup() {

    if (!currentUser) {

      toast(
        "Primero inicia sesión."
      );

      return;
    }


    if (!onlineMode) {

      const name =
        prompt(
          "Nombre del viaje:"
        );


      if (!name) return;


      currentGroup = {

        id:
          crypto.randomUUID(),

        name,

        destination: "",

        invite_code:
          generateInviteCode()
      };


      data.members = [
        {
          id:
            crypto.randomUUID(),

          user_id:
            currentUser.id,

          role:
            "owner",

          name:
            currentUser
              .user_metadata
              ?.name ||
            "Yo"
        }
      ];


      saveOfflineData();


      toast(
        "Viaje creado."
      );


      renderAll();

      return;
    }


    const name =
      prompt(
        "Nombre del viaje:"
      );


    if (!name) return;


    const destination =
      prompt(
        "Destino:"
      ) || "";


    const invite_code =
      generateInviteCode();


    const {
      data: group,
      error
    } =
      await supabaseClient
        .from("groups")
        .insert({
          name,
          destination,
          invite_code,
          owner_id:
            currentUser.id
        })
        .select()
        .single();


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return;
    }


    const {
      error: memberError
    } =
      await supabaseClient
        .from("members")
        .insert({
          group_id:
            group.id,

          user_id:
            currentUser.id,

          role:
            "owner"
        });


    if (memberError) {

      toast(
        translateError(
          memberError.message
        )
      );

      return;
    }


    currentGroup =
      group;


    localStorage.setItem(
      STORAGE_GROUP,
      group.id
    );


    await loadGroupData();


    toast(
      "Viaje creado."
    );


    renderAll();
  }


  async function joinGroup() {

    const code =
      prompt(
        "Escribe el código de invitación:"
      )
        ?.trim()
        .toUpperCase();


    if (!code) return;


    if (!onlineMode) {

      toast(
        "Para unirte a un grupo compartido necesitas conexión."
      );

      return;
    }


    const {
      data: group,
      error
    } =
      await supabaseClient
        .from("groups")
        .select("*")
        .eq(
          "invite_code",
          code
        )
        .maybeSingle();


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return;
    }


    if (!group) {

      toast(
        "No encontré ese código."
      );

      return;
    }


    const {
      error: memberError
    } =
      await supabaseClient
        .from("members")
        .insert({
          group_id:
            group.id,

          user_id:
            currentUser.id,

          role:
            "adult"
        });


    if (memberError) {

      toast(
        translateError(
          memberError.message
        )
      );

      return;
    }


    currentGroup =
      group;


    localStorage.setItem(
      STORAGE_GROUP,
      group.id
    );


    await loadGroupData();


    toast(
      "Te uniste al grupo."
    );


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


    const gid =
      currentGroup.id;


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
    ] =
      await Promise.all([

        fetchTable(
          "events",
          gid
        ),

        fetchTable(
          "packing",
          gid
        ),

        fetchTable(
          "places",
          gid
        ),

        fetchTable(
          "food",
          gid
        ),

        fetchTable(
          "activities",
          gid
        ),

        fetchTable(
          "messages",
          gid
        ),

        fetchTable(
          "members",
          gid
        ),

        fetchTable(
          "locations",
          gid
        ),

        fetchSingle(
          "parking",
          gid
        ),

        fetchSingle(
          "travel_status",
          gid
        )
      ]);


    data.events =
      events;

    data.packing =
      packing;

    data.places =
      places;

    data.food =
      food;

    data.activities =
      activities;

    data.messages =
      messages;

    data.members =
      members;

    data.locations =
      locations;

    data.parking =
      parking;

    data.travel_status =
      status;


    await loadProfiles();


    setupRealtime();


    renderAll();
  }


  async function fetchTable(
    table,
    gid
  ) {

    const {
      data: rows,
      error
    } =
      await supabaseClient
        .from(table)
        .select("*")
        .eq(
          "group_id",
          gid
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        );


    if (error) {

      console.error(
        table,
        error
      );

      return [];
    }


    return rows || [];
  }


  async function fetchSingle(
    table,
    gid
  ) {

    const {
      data: row,
      error
    } =
      await supabaseClient
        .from(table)
        .select("*")
        .eq(
          "group_id",
          gid
        )
        .maybeSingle();


    if (error) {

      console.error(
        table,
        error
      );

      return null;
    }


    return row;
  }


  async function loadProfiles() {

    if (
      !onlineMode ||
      !data.members.length
    ) {
      return;
    }


    const ids =
      data.members
        .map(
          m =>
            m.user_id
        )
        .filter(Boolean);


    if (!ids.length) {

      data.profiles = [];

      return;
    }


    const {
      data: profiles
    } =
      await supabaseClient
        .from("profiles")
        .select("*")
        .in(
          "id",
          ids
        );


    data.profiles =
      profiles || [];
  }


  /* =======================================================
     GENERIC CRUD
     ======================================================= */

  async function insertRecord(
    table,
    values
  ) {

    if (!currentGroup) {

      toast(
        "Primero crea o selecciona un viaje."
      );

      return null;
    }


    if (!onlineMode) {

      const record = {

        id:
          crypto.randomUUID(),

        group_id:
          currentGroup.id,

        created_at:
          new Date().toISOString(),

        ...values
      };


      if (!Array.isArray(data[table])) {

        data[table] = [];
      }


      data[table].push(
        record
      );


      saveOfflineData();

      renderAll();

      return record;
    }


    const {
      data: record,
      error
    } =
      await supabaseClient
        .from(table)
        .insert({
          group_id:
            currentGroup.id,

          ...values
        })
        .select()
        .single();


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return null;
    }


    data[table].push(
      record
    );


    renderAll();


    return record;
  }


  async function updateRecord(
    table,
    id,
    values
  ) {

    if (!onlineMode) {

      const list =
        data[table];


      const index =
        list.findIndex(
          x =>
            x.id === id
        );


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


    const {
      data: record,
      error
    } =
      await supabaseClient
        .from(table)
        .update(values)
        .eq(
          "id",
          id
        )
        .select()
        .single();


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return;
    }


    const index =
      data[table].findIndex(
        x =>
          x.id === id
      );


    if (index >= 0) {

      data[table][index] =
        record;
    }


    renderAll();
  }


  async function deleteRecord(
    table,
    id
  ) {

    if (
      !confirm(
        "¿Eliminar este elemento?"
      )
    ) {
      return;
    }


    if (!onlineMode) {

      data[table] =
        data[table].filter(
          x =>
            x.id !== id
        );


      saveOfflineData();

      renderAll();

      return;
    }


    const {
      error
    } =
      await supabaseClient
        .from(table)
        .delete()
        .eq(
          "id",
          id
        );


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return;
    }


    data[table] =
      data[table].filter(
        x =>
          x.id !== id
      );


    renderAll();
  }


  /* =======================================================
     EVENTS
     ======================================================= */

  function openEventModal(
    item = null
  ) {

    openModal(
      item
        ? "Editar evento"
        : "Añadir evento",

      [
        field(
          "title",
          "Título",
          item?.title || "",
          true
        ),

        field(
          "date",
          "Fecha",
          item?.date || "",
          false,
          "date"
        ),

        field(
          "time",
          "Hora",
          item?.time || "",
          false,
          "time"
        ),

        field(
          "tag",
          "Categoría",
          item?.tag ||
            "CUSTOM"
        ),

        field(
          "description",
          "Descripción",
          item?.description ||
            "",
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
      prompt(
        "¿Qué necesitas llevar?"
      );


    if (!name) return;


    await insertRecord(
      "packing",
      {
        name,
        done: false
      }
    );
  }


  async function togglePacking(
    item
  ) {

    await updateRecord(
      "packing",
      item.id,
      {
        done:
          !item.done
      }
    );
  }


  /* =======================================================
     PLACES
     ======================================================= */

  function openPlaceModal(
    item = null
  ) {

    openModal(
      item
        ? "Editar lugar"
        : "Añadir lugar",

      [
        field(
          "name",
          "Nombre",
          item?.name || "",
          true
        ),

        field(
          "category",
          "Categoría",
          item?.category ||
            "FAMILY"
        ),

        field(
          "description",
          "Descripción",
          item?.description ||
            "",
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

  function openFoodModal(
    item = null
  ) {

    openModal(
      item
        ? "Editar comida"
        : "Añadir comida",

      [
        field(
          "name",
          "Nombre",
          item?.name || "",
          true
        ),

        field(
          "category",
          "Categoría",
          item?.category ||
            "FOOD"
        ),

        field(
          "description",
          "Descripción",
          item?.description ||
            "",
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

  function openActivityModal(
    item = null
  ) {

    openModal(
      item
        ? "Editar actividad"
        : "Añadir actividad",

      [
        field(
          "name",
          "Nombre",
          item?.name || "",
          true
        ),

        field(
          "category",
          "Categoría",
          item?.category ||
            "FAMILY"
        ),

        field(
          "description",
          "Descripción",
          item?.description ||
            "",
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

  async function sendMessage(
    event
  ) {

    event.preventDefault();


    const input =
      $("messageInput");


    const body =
      input.value.trim();


    if (!body) return;


    if (!currentGroup) {

      toast(
        "Primero crea un viaje."
      );

      return;
    }


    if (!onlineMode) {

      data.messages.push({

        id:
          crypto.randomUUID(),

        group_id:
          currentGroup.id,

        user_id:
          currentUser.id,

        body,

        created_at:
          new Date().toISOString()
      });


      saveOfflineData();


      input.value = "";


      renderMessages();


      return;
    }


    const {
      data: message,
      error
    } =
      await supabaseClient
        .from("messages")
        .insert({
          group_id:
            currentGroup.id,

          user_id:
            currentUser.id,

          body
        })
        .select()
        .single();


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return;
    }


    data.messages.push(
      message
    );


    input.value = "";


    renderMessages();
  }


  /* =======================================================
     LOCATION
     ======================================================= */

  function getCurrentPosition() {

    return new Promise(
      (
        resolve,
        reject
      ) => {

        if (
          !navigator.geolocation
        ) {

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
            enableHighAccuracy:
              true,

            timeout:
              15000,

            maximumAge:
              10000
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
        position.coords
          .latitude;


      const lon =
        position.coords
          .longitude;


      if (!currentGroup) {

        toast(
          "Primero crea un viaje."
        );

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

          id:
            crypto.randomUUID(),

          group_id:
            currentGroup.id,

          user_id:
            currentUser.id,

          lat,

          lon,

          name:
            "Mi ubicación",

          updated_at:
            new Date().toISOString()
        });


        saveOfflineData();

      } else {

        const {
          error
        } =
          await supabaseClient
            .from("locations")
            .upsert(
              {
                group_id:
                  currentGroup.id,

                user_id:
                  currentUser.id,

                lat,

                lon,

                name:
                  "Mi ubicación",

                updated_at:
                  new Date().toISOString()
              },
              {
                onConflict:
                  "group_id,user_id"
              }
            );


        if (error) {

          toast(
            translateError(
              error.message
            )
          );

          return;
        }


        await loadGroupData();
      }


      if ($("myLocationStatus")) {

        $("myLocationStatus")
          .textContent =
            `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }


      toast(
        "Ubicación guardada."
      );

    } catch (error) {

      console.error(
        "Location:",
        error
      );


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
        position.coords
          .latitude;


      const lon =
        position.coords
          .longitude;


      if (!currentGroup) {

        toast(
          "Primero crea un viaje."
        );

        return;
      }


      if (!onlineMode) {

        data.parking = {

          group_id:
            currentGroup.id,

          user_id:
            currentUser.id,

          lat,

          lon,

          updated_at:
            new Date().toISOString()
        };


        saveOfflineData();

      } else {

        const {
          error
        } =
          await supabaseClient
            .from("parking")
            .upsert(
              {
                group_id:
                  currentGroup.id,

                user_id:
                  currentUser.id,

                lat,

                lon,

                updated_at:
                  new Date().toISOString()
              },
              {
                onConflict:
                  "group_id"
              }
            );


        if (error) {

          toast(
            translateError(
              error.message
            )
          );

          return;
        }


        data.parking =
          await fetchSingle(
            "parking",
            currentGroup.id
          );
      }


      if ($("parkingStatus")) {

        $("parkingStatus")
          .textContent =
            `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }


      toast(
        "Parking guardado."
      );

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

      toast(
        "Primero crea un viaje."
      );

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

            id:
              crypto.randomUUID(),

            group_id:
              currentGroup.id,

            user_id:
              "local-" +
              crypto.randomUUID(),

            name:
              values.name,

            role:
              values.role
          });


          saveOfflineData();

          renderAll();

          closeModal();

          return;
        }


        toast(
          "Para una persona real, comparte el código del grupo para que cree su propia cuenta y se una."
        );


        closeModal();
      }
    );
  }


  async function removeMember(
    member
  ) {

    if (!onlineMode) {

      data.members =
        data.members.filter(
          m =>
            m.id !== member.id
        );


      saveOfflineData();

      renderAll();

      return;
    }


    if (
      member.user_id ===
      currentUser.id
    ) {

      const {
        error
      } =
        await supabaseClient
          .from("members")
          .delete()
          .eq(
            "id",
            member.id
          );


      if (error) {

        toast(
          translateError(
            error.message
          )
        );

        return;
      }


      data.members =
        data.members.filter(
          m =>
            m.id !== member.id
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


    const {
      error
    } =
      await supabaseClient
        .from("members")
        .delete()
        .eq(
          "id",
          member.id
        );


    if (error) {

      toast(
        translateError(
          error.message
        )
      );

      return;
    }


    data.members =
      data.members.filter(
        m =>
          m.id !== member.id
      );


    renderAll();
  }


  /* =======================================================
     MODAL
     ======================================================= */

  let modalSaveCallback =
    null;


  function openModal(
    title,
    fields,
    callback
  ) {

    $("modalTitle").textContent =
      title;


    $("modalFields").innerHTML =
      fields.join("");


    modalSaveCallback =
      callback;


    show("modal");
  }


  function closeModal() {

    hide("modal");


    $("modalFields")
      .innerHTML =
        "";


    modalSaveCallback =
      null;
  }


  function field(
    name,
    label,
    value = "",
    required = false,
    type = "text"
  ) {

    if (
      type ===
      "textarea"
    ) {

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


  async function submitModal(
    event
  ) {

    event.preventDefault();


    if (!modalSaveCallback) {
      return;
    }


    const values = {};


    $("modalFields")
      .querySelectorAll(
        "[data-field]"
      )
      .forEach(
        input => {

          values[
            input.dataset.field
          ] =
            input.value.trim();
        }
      );


    await modalSaveCallback(
      values
    );
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

    if ($("homeTripName")) {

      $("homeTripName")
        .textContent =
          currentGroup?.name ||
          "Crea tu primera aventura";
    }


    if ($("homeDestination")) {

      $("homeDestination")
        .textContent =
          currentGroup?.destination ||
          "Organiza todo en un solo lugar.";
    }


    if ($("statEvents")) {

      $("statEvents")
        .textContent =
          data.events.length;
    }


    const total =
      data.packing.length;


    const done =
      data.packing.filter(
        x =>
          x.done
      ).length;


    if ($("statPacking")) {

      $("statPacking")
        .textContent =
          `${done}/${total}`;
    }


    if ($("statPlaces")) {

      $("statPlaces")
        .textContent =
          data.places.length;
    }


    if ($("statMembers")) {

      $("statMembers")
        .textContent =
          data.members.length;
    }


    if ($("homeEvents")) {

      $("homeEvents")
        .innerHTML =
          data.events.length
            ? data.events
                .slice(0, 5)
                .map(
                  eventMiniHTML
                )
                .join("")
            : emptyHTML(
                "Todavía no hay eventos."
              );
    }


    if ($("homeMembers")) {

      $("homeMembers")
        .innerHTML =
          data.members.length
            ? data.members
                .slice(0, 6)
                .map(
                  memberHTML
                )
                .join("")
            : emptyHTML(
                "Todavía no hay personas."
              );
    }
  }


  function renderEvents() {

    if (!$("eventsList")) {
      return;
    }


    $("eventsList")
      .innerHTML =
        data.events.length
          ? data.events
              .map(
                eventHTML
              )
              .join("")
          : emptyHTML(
              "Todavía no tienes eventos. Añade el primero."
            );
  }


  function renderPacking() {

    if (
      !$("packingProgressText") ||
      !$("packingProgressBar") ||
      !$("packingList")
    ) {
      return;
    }


    const total =
      data.packing.length;


    const done =
      data.packing.filter(
        x =>
          x.done
      ).length;


    const percent =
      total
        ? Math.round(
            done /
              total *
              100
          )
        : 0;


    $("packingProgressText")
      .textContent =
        `${percent}%`;


    $("packingProgressBar")
      .style.width =
        `${percent}%`;


    $("packingList")
      .innerHTML =
        data.packing.length
          ? data.packing
              .map(
                item => `

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

            `
              )
              .join("")
          : emptyHTML(
              "Tu packing list está vacío."
            );
  }


  function renderPlaces() {

    if (!$("placesList")) {
      return;
    }


    $("placesList")
      .innerHTML =
        data.places.length
          ? data.places
              .map(
                item =>
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

    if (!$("foodList")) {
      return;
    }


    $("foodList")
      .innerHTML =
        data.food.length
          ? data.food
              .map(
                item =>
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

    if (!$("activitiesList")) {
      return;
    }


    $("activitiesList")
      .innerHTML =
        data.activities.length
          ? data.activities
              .map(
                item =>
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


    if (!list) {
      return;
    }


    list.innerHTML =
      data.messages.length
        ? data.messages
            .map(
              message => {

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
                  (
                    mine
                      ? "Yo"
                      : "Familia"
                  );


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
              }
            )
            .join("")
        : emptyHTML(
            "Todavía no hay mensajes."
          );
  }


  function renderLocations() {

    const list =
      $("locationsList");


    if (!list) {
      return;
    }


    list.innerHTML =
      data.locations.length
        ? data.locations
            .map(
              location => {

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
                      ${Number(location.lat).toFixed(5)},
                      ${Number(location.lon).toFixed(5)}
                    </p>

                    <a
                      class="btn secondary"
                      target="_blank"
                      rel="noopener"
                      href="https://www.google.com/maps?q=${encodeURIComponent(location.lat)},${encodeURIComponent(location.lon)}"
                    >
                      Abrir mapa
                    </a>

                  </div>

                `;
              }
            )
            .join("")
        : emptyHTML(
            "Nadie ha compartido ubicación."
          );
  }


  function renderGroup() {

    if (
      !$("groupInfo") ||
      !$("membersList")
    ) {
      return;
    }


    if (!currentGroup) {

      $("groupInfo")
        .innerHTML = `

          <div class="empty-state">

            <strong>
              No tienes un viaje todavía.
            </strong>

            <p>
              Crea uno desde Inicio para comenzar.
            </p>

          </div>

        `;


      $("membersList")
        .innerHTML =
          "";


      return;
    }


    $("groupInfo")
      .innerHTML = `

        <div class="eyebrow">
          VIAJE ACTUAL
        </div>

        <h2>
          ${escapeHTML(
            currentGroup.name
          )}
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


    $("membersList")
      .innerHTML =
        data.members.length
          ? data.members
              .map(
                member => `

                  <div class="item-card">

                    <div class="member-row">

                      <div class="member-avatar">
                        ${escapeHTML(
                          (
                            getMemberName(
                              member
                            )
                              .charAt(0) ||
                            "?"
                          ).toUpperCase()
                        )}
                      </div>

                      <div class="member-info">

                        <strong>
                          ${escapeHTML(
                            getMemberName(
                              member
                            )
                          )}
                        </strong>

                        <span>
                          ${escapeHTML(
                            member.role ||
                            "adult"
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

                `
              )
              .join("")
          : emptyHTML(
              "Todavía no hay miembros."
            );
  }


  /* =======================================================
     HTML HELPERS
     ======================================================= */

  function eventMiniHTML(
    event
  ) {

    return `

      <div class="member-row">

        <div class="member-avatar">
          ${event.date ? "📅" : "✈"}
        </div>

        <div class="member-info">

          <strong>
            ${escapeHTML(
              event.title
            )}
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


  function eventHTML(
    event
  ) {

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
            ${escapeHTML(
              event.tag ||
              "CUSTOM"
            )}
          </span>

        </div>

        <h3>
          ${escapeHTML(
            event.title
          )}
        </h3>

        <p>
          ${escapeHTML(
            event.description ||
            "Sin descripción."
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


  function genericCard(
    item,
    table
  ) {

    return `

      <div class="item-card">

        <div class="item-meta">

          <span class="tag">
            ${escapeHTML(
              item.category ||
              "FAMILY"
            )}
          </span>

        </div>

        <h3>
          ${escapeHTML(
            item.name
          )}
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


  function memberHTML(
    member
  ) {

    return `

      <div class="member-row">

        <div class="member-avatar">
          ${escapeHTML(
            getMemberName(
              member
            )
              .charAt(0)
              .toUpperCase()
          )}
        </div>

        <div class="member-info">

          <strong>
            ${escapeHTML(
              getMemberName(
                member
              )
            )}
          </strong>

          <span>
            ${escapeHTML(
              member.role ||
              "adult"
            )}
          </span>

        </div>

      </div>

    `;
  }


  function getMemberName(
    member
  ) {

    if (member.name) {

      return member.name;
    }


    const profile =
      data.profiles.find(
        p =>
          p.id ===
          member.user_id
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


  function emptyHTML(
    text
  ) {

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

      realtimeChannel =
        null;
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
          () =>
            loadGroupData()
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
          () =>
            loadGroupData()
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
          () =>
            loadGroupData()
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
          () =>
            loadGroupData()
        )

        .subscribe();
  }


  /* =======================================================
     EVENTS / BINDINGS
     ======================================================= */

  function bindEvents() {

    $("saveConfigBtn")
      ?.addEventListener(
        "click",
        saveConfiguration
      );


    $("useOfflineFromConfig")
      ?.addEventListener(
        "click",
        enterOffline
      );


    $("loginTab")
      ?.addEventListener(
        "click",
        () =>
          setAuthTab(
            "login"
          )
      );


    $("signupTab")
      ?.addEventListener(
        "click",
        () =>
          setAuthTab(
            "signup"
          )
      );


    $("loginForm")
      ?.addEventListener(
        "submit",
        login
      );


    $("signupForm")
      ?.addEventListener(
        "submit",
        signup
      );


    $("forgotPasswordBtn")
      ?.addEventListener(
        "click",
        forgotPassword
      );


    $("offlineBtn")
      ?.addEventListener(
        "click",
        enterOffline
      );


    $("resetConfigBtn")
      ?.addEventListener(
        "click",
        showConfig
      );


    $("logoutBtn")
      ?.addEventListener(
        "click",
        logout
      );


    $("settingsLogoutBtn")
      ?.addEventListener(
        "click",
        logout
      );


    $("settingsConfigBtn")
      ?.addEventListener(
        "click",
        showConfig
      );


    $("homeCreateTripBtn")
      ?.addEventListener(
        "click",
        createGroup
      );


    $("homeJoinTripBtn")
      ?.addEventListener(
        "click",
        joinGroup
      );


    $("addEventBtn")
      ?.addEventListener(
        "click",
        () =>
          openEventModal()
      );


    $("addPackingBtn")
      ?.addEventListener(
        "click",
        addPacking
      );


    $("addPlaceBtn")
      ?.addEventListener(
        "click",
        () =>
          openPlaceModal()
      );


    $("addFoodBtn")
      ?.addEventListener(
        "click",
        () =>
          openFoodModal()
      );


    $("addActivityBtn")
      ?.addEventListener(
        "click",
        () =>
          openActivityModal()
      );


    $("messageForm")
      ?.addEventListener(
        "submit",
        sendMessage
      );


    $("shareLocationBtn")
      ?.addEventListener(
        "click",
        shareLocation
      );


    $("saveParkingBtn")
      ?.addEventListener(
        "click",
        saveParking
      );


    $("addMemberBtn")
      ?.addEventListener(
        "click",
        openMemberModal
      );


    $("modalClose")
      ?.addEventListener(
        "click",
        closeModal
      );


    $("modalCancel")
      ?.addEventListener(
        "click",
        closeModal
      );


    $("modalBackdrop")
      ?.addEventListener(
        "click",
        closeModal
      );


    $("modalForm")
      ?.addEventListener(
        "submit",
        submitModal
      );


    $("mobileMenuBtn")
      ?.addEventListener(
        "click",
        () => {

          document
            .querySelector(
              ".sidebar"
            )
            ?.classList.toggle(
              "open"
            );
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


  async function handleDelegatedClick(
    event
  ) {

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
        deleteButton.dataset
          .deleteTable,

        deleteButton.dataset
          .deleteId
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
            toggle.dataset
              .packingToggle
        );


      if (item) {

        await togglePacking(
          item
        );
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
            editEvent.dataset
              .editEvent
        );


      if (item) {

        openEventModal(
          item
        );
      }


      return;
    }


    const editButton =
      event.target.closest(
        "[data-edit-table]"
      );


    if (editButton) {

      const table =
        editButton.dataset
          .editTable;


      const item =
        data[table]?.find(
          x =>
            x.id ===
            editButton.dataset
              .editId
        );


      if (!item) return;


      if (
        table ===
        "places"
      ) {

        openPlaceModal(
          item
        );
      }


      if (
        table ===
        "food"
      ) {

        openFoodModal(
          item
        );
      }


      if (
        table ===
        "activities"
      ) {

        openActivityModal(
          item
        );
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
            removeMemberButton
              .dataset
              .removeMember
        );


      if (member) {

        await removeMember(
          member
        );
      }
    }
  }


  /* =======================================================
     UTILITIES
     ======================================================= */

  function show(id) {

    $(id)
      ?.classList
      .remove(
        "hidden"
      );
  }


  function hide(id) {

    $(id)
      ?.classList
      .add(
        "hidden"
      );
  }


  function toast(
    message
  ) {

    const element =
      $("toast");


    if (!element) {
      return;
    }


    element.textContent =
      message;


    element.classList.add(
      "show"
    );


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


  function setBusy(
    form,
    busy
  ) {

    if (!form) {
      return;
    }


    const button =
      form.querySelector(
        "button[type=submit]"
      );


    if (!button) {
      return;
    }


    button.disabled =
      busy;


    if (busy) {

      button.dataset
        .originalText =
          button.textContent;


      button.textContent =
        "Procesando...";

    } else {

      button.textContent =
        button.dataset
          .originalText ||
        "Guardar";
    }
  }


  function generateInviteCode() {

    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    let code =
      "FAM-";


    for (
      let i = 0;
      i < 6;
      i++
    ) {

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


  function formatDateTime(
    value
  ) {

    if (!value) {
      return "";
    }


    try {

      return new Intl.DateTimeFormat(
        "es-PR",
        {
          dateStyle:
            "short",

          timeStyle:
            "short"
        }
      ).format(
        new Date(value)
      );

    } catch (_) {

      return "";
    }
  }


  function escapeHTML(
    value
  ) {

    return String(
      value ?? ""
    )

      .replaceAll(
        "&",
        "&amp;"
      )

      .replaceAll(
        "<",
        "&lt;"
      )

      .replaceAll(
        ">",
        "&gt;"
      )

      .replaceAll(
        '"',
        "&quot;"
      )

      .replaceAll(
        "'",
        "&#039;"
      );
  }


  function escapeAttr(
    value
  ) {

    return escapeHTML(
      value
    );
  }


  function translateError(
    message
  ) {

    const text =
      String(
        message || ""
      );


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


    if (
      /failed to fetch/i
        .test(text)
    ) {

      return "No pude conectar con Supabase. Verifica tu conexión a Internet.";
    }


    if (
      /network/i
        .test(text)
    ) {

      return "Hay un problema de conexión con Supabase.";
    }


    if (
      /invalid supabaseurl/i
        .test(text)
    ) {

      return "La configuración de Supabase no es válida. Revisa la Project URL.";
    }


    return text ||
      "Ocurrió un error. Intenta nuevamente.";
  }

})();
