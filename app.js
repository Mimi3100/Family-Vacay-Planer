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

  const STORAGE_AUTH =
    "nuestra_aventura_auth";

  /* =======================================================
     BUILT-IN SUPABASE CONFIG

     These are publishable client credentials.
     NEVER put a service_role key here.
     ======================================================= */

  const BUILTIN_CONFIG = {
    SUPABASE_URL:
      "https://zolwiqjlboiqlwmjcnyc.supabase.co",

    SUPABASE_KEY:
      "sb_publishable_yAqisND70WXvo2o-Sk5Lvg_-8oIDLKq",

    SITE_URL:
      "https://mimi3100.github.io/Family-Vacay-Planer/"
  };

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

  let authTransitionPromise = null;

  let realtimeChannel = null;

  /*
    Mobile menu touch state.
  */

  let mobileMenuTouchStartX = 0;

  let mobileMenuTouchStartY = 0;

  let mobileMenuTouchCurrentX = 0;

  let mobileMenuTouchCurrentY = 0;

  let mobileMenuTouchActive = false;

  let mobileMenuPreviousBodyOverflow = "";

  let mobileMenuPreviousBodyTouchAction = "";

  let mobileMenuInitialized = false;

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

      /*
        Inicializamos el menú después de que
        todos los elementos del DOM estén disponibles.
      */

      initializeMobileMenu();
    } catch (error) {
      console.error(
        "Error inicializando eventos:",
        error
      );
    }

    /*
      Primero buscamos una configuración válida.
      Soportamos tanto nombres nuevos como antiguos
      para evitar problemas con config.js viejo.
    */

    let config = getAppConfig();

    /*
      Si existe una configuración válida guardada
      localmente, la usamos.
    */

    if (!config.valid) {
      const savedConfig =
        readSavedConfig();

      if (savedConfig.valid) {
        config = savedConfig;

        setNormalizedAppConfig(
          savedConfig.url,
          savedConfig.key
        );
      }
    }

    /*
      Si todavía no tenemos una configuración válida,
      usamos la configuración incorporada.

      Esto evita que un config.js viejo con:
      "pega aqui tu project url"
      rompa la aplicación.
    */

    if (!config.valid) {
      config = {
        url:
          BUILTIN_CONFIG.SUPABASE_URL,

        key:
          BUILTIN_CONFIG.SUPABASE_KEY,

        siteUrl:
          BUILTIN_CONFIG.SITE_URL,

        valid: true
      };

      setNormalizedAppConfig(
        config.url,
        config.key
      );
    }

    /*
      Inicializamos Supabase.
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

    showAuthOrConfig();
  }

  /* =======================================================
     CONFIG HELPERS
     ======================================================= */

  function getAppConfig() {
    const appConfig =
      window.APP_CONFIG || {};

    /*
      Aceptamos diferentes nombres porque
      versiones anteriores del proyecto podían
      utilizar lowercase.
    */

    const url = String(
      appConfig.SUPABASE_URL ||
      appConfig.supabase_url ||
      ""
    ).trim();

    const key = String(
      appConfig.SUPABASE_ANON_KEY ||
      appConfig.SUPABASE_KEY ||
      appConfig.supabase_anon_key ||
      appConfig.supabase_key ||
      ""
    ).trim();

    const siteUrl = String(
      appConfig.SITE_URL ||
      appConfig.site_url ||
      BUILTIN_CONFIG.SITE_URL ||
      window.location.origin
    ).trim();

    const validUrl =
      /^https?:\/\/.+/i.test(url);

    /*
      Detectamos placeholders viejos.
    */

    const isPlaceholder =
      /pega\s*aqui/i.test(url) ||
      /pega\s*aqui/i.test(key) ||
      /project\s*url/i.test(url);

    return {
      url,
      key,
      siteUrl,
      valid:
        validUrl &&
        Boolean(key) &&
        !isPlaceholder
    };
  }

  function setNormalizedAppConfig(
    url,
    key
  ) {
    window.APP_CONFIG =
      window.APP_CONFIG || {};

    window.APP_CONFIG.SUPABASE_URL =
      url;

    window.APP_CONFIG.SUPABASE_KEY =
      key;

    window.APP_CONFIG.SUPABASE_ANON_KEY =
      key;

    window.APP_CONFIG.SITE_URL =
      BUILTIN_CONFIG.SITE_URL;
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

      const url = String(
        parsed.url ||
        parsed.SUPABASE_URL ||
        parsed.supabase_url ||
        ""
      ).trim();

      const key = String(
        parsed.key ||
        parsed.SUPABASE_KEY ||
        parsed.SUPABASE_ANON_KEY ||
        parsed.supabase_anon_key ||
        ""
      ).trim();

      const valid =
        /^https?:\/\/.+/i.test(url) &&
        Boolean(key) &&
        !/pega\s*aqui/i.test(url) &&
        !/pega\s*aqui/i.test(key);

      return {
        url,
        key,
        valid
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
      /pega\s*aqui/i.test(url) ||
      /pega\s*aqui/i.test(key)
    ) {
      console.error(
        "Supabase todavía contiene placeholders."
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
                window.localStorage,
              storageKey:
                STORAGE_AUTH,
              flowType:
                "pkce"
            }
          }
        );

      onlineMode = true;

      setNormalizedAppConfig(
        url,
        key
      );

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
          Nunca hacemos operaciones pesadas directamente
          dentro de onAuthStateChange.
        */

        setTimeout(
          async () => {
            try {
              if (session?.user) {
                currentUser =
                  session.user;

                /*
                  INITIAL_SESSION:
                  cargar una sesión que ya existía.

                  SIGNED_IN:
                  también manejamos login,
                  pero mediante el mismo controlador
                  protegido contra duplicados.
                */

                if (
                  event ===
                    "INITIAL_SESSION" ||
                  event ===
                    "SIGNED_IN"
                ) {
                  await handleAuthenticatedUser(
                    session.user
                  );
                }

                return;
              }

              if (
                event ===
                "SIGNED_OUT"
              ) {
                currentUser = null;

                currentGroup = null;

                data.members = [];

                closeMobileMenu();

                if (realtimeChannel) {
                  try {
                    await supabaseClient
                      .removeChannel(
                        realtimeChannel
                      );
                  } catch (_) {}

                  realtimeChannel = null;
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
    if (!user) {
      return;
    }

    /*
      Si otra transición ya está ocurriendo,
      esperamos a que termine.
    */

    if (authTransitionRunning) {
      if (authTransitionPromise) {
        try {
          await authTransitionPromise;
        } catch (_) {}
      }

      return;
    }

    authTransitionRunning = true;

    authTransitionPromise =
      (async () => {
        try {
          currentUser = user;

          /*
            El perfil es secundario.
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
            Cargar grupos.
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
          authTransitionPromise = null;
        }
      })();

    await authTransitionPromise;
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
            id:
              currentUser.id,

            email:
              currentUser.email || "",

            name
          },
          {
            onConflict:
              "id"
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
    closeMobileMenu();

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

    setNormalizedAppConfig(
      url,
      key
    );

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
    closeMobileMenu();

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

        if ($("loginEmail")) {
          $("loginEmail").value =
            email;
        }

        if ($("loginPassword")) {
          $("loginPassword").value =
            password;
        }

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

      currentUser =
        result.user;

      await handleAuthenticatedUser(
        result.user
      );

      if ($("loginPassword")) {
        $("loginPassword").value =
          "";
      }
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      if ($("loginEmail")) {
        $("loginEmail").value =
          email;
      }

      if ($("loginPassword")) {
        $("loginPassword").value =
          password;
      }

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
        ?.value
        .trim() || "";

    const email =
      $("signupEmail")
        ?.value
        .trim() || "";

    const password =
      $("signupPassword")
        ?.value || "";

    const password2 =
      $("signupPassword2")
        ?.value || "";

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
                BUILTIN_CONFIG.SITE_URL ||
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

      if (result?.session && result?.user) {
        currentUser =
          result.user;

        await handleAuthenticatedUser(
          result.user
        );
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
        ?.value
        .trim() || "";

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
                BUILTIN_CONFIG.SITE_URL ||
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
    closeMobileMenu();

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

    showAuth();
  }

  /* =======================================================
     OFFLINE
     ======================================================= */

  function enterOffline() {
    closeMobileMenu();

    onlineMode = false;

    supabaseClient = null;

    currentUser = {
      id:
        "offline-user",

      email:
        "offline@local",

      user_metadata: {
        name:
          "Modo Offline"
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
    closeMobileMenu();

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

    /*
      Siempre cerramos el menú al navegar.
      Esto evita que el drawer quede abierto
      encima de la nueva pantalla.
    */

    closeMobileMenu();

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
  }

  /* =======================================================
     MOBILE MENU
     ======================================================= */

  function getMobileSidebar() {
    return document.querySelector(
      ".sidebar"
    );
  }

  function createMobileMenuOverlay() {
    if (
      document.querySelector(
        ".mobile-menu-overlay"
      )
    ) {
      return;
    }

    const overlay =
      document.createElement(
        "div"
      );

    overlay.className =
      "mobile-menu-overlay";

    Object.assign(
      overlay.style,
      {
        position:
          "fixed",

        inset:
          "0",

        zIndex:
          "998",

        background:
          "rgba(20, 15, 30, 0.30)",

        opacity:
          "0",

        visibility:
          "hidden",

        pointerEvents:
          "none",

        transition:
          "opacity 0.25s ease, visibility 0.25s ease",

        WebkitTapHighlightColor:
          "transparent"
      }
    );

    overlay.addEventListener(
      "click",
      event => {
        event.preventDefault();

        event.stopPropagation();

        closeMobileMenu();
      }
    );

    document.body.appendChild(
      overlay
    );

    const sidebar =
      getMobileSidebar();

    if (sidebar) {
      /*
        El sidebar debe estar por encima
        del overlay.
      */

      sidebar.style.zIndex =
        "999";
    }
  }

  function updateMobileMenuOverlay() {
    const sidebar =
      getMobileSidebar();

    const overlay =
      document.querySelector(
        ".mobile-menu-overlay"
      );

    if (
      !sidebar ||
      !overlay
    ) {
      return;
    }

    const open =
      sidebar.classList.contains(
        "open"
      );

    overlay.style.opacity =
      open
        ? "1"
        : "0";

    overlay.style.visibility =
      open
        ? "visible"
        : "hidden";

    overlay.style.pointerEvents =
      open
        ? "auto"
        : "none";
  }

  function openMobileMenu() {
    const sidebar =
      getMobileSidebar();

    if (!sidebar) {
      return;
    }

    createMobileMenuOverlay();

    /*
      Guardamos los valores originales para
      restaurarlos al cerrar.
    */

    if (
      !document.body.classList.contains(
        "mobile-menu-open"
      )
    ) {
      mobileMenuPreviousBodyOverflow =
        document.body.style.overflow;

      mobileMenuPreviousBodyTouchAction =
        document.body.style.touchAction;
    }

    /*
      Evita que la página de atrás
      haga scroll mientras el menú está abierto.
    */

    document.body.style.overflow =
      "hidden";

    document.body.style.touchAction =
      "pan-y";

    document.body.classList.add(
      "mobile-menu-open"
    );

    /*
      Quitamos cualquier transformación
      residual de un swipe anterior.
    */

    sidebar.style.transform =
      "";

    sidebar.style.transition =
      "";

    sidebar.classList.add(
      "open"
    );

    updateMobileMenuOverlay();
  }

  function closeMobileMenu() {
    const sidebar =
      getMobileSidebar();

    if (sidebar) {
      sidebar.classList.remove(
        "open"
      );

      /*
        Limpiamos cualquier transformación
        que haya quedado del swipe.
      */

      sidebar.style.transform =
        "";

      sidebar.style.transition =
        "";
    }

    document.body.classList.remove(
      "mobile-menu-open"
    );

    /*
      Restauramos el scroll normal.
    */

    document.body.style.overflow =
      mobileMenuPreviousBodyOverflow;

    document.body.style.touchAction =
      mobileMenuPreviousBodyTouchAction;

    const overlay =
      document.querySelector(
        ".mobile-menu-overlay"
      );

    if (overlay) {
      overlay.style.opacity =
        "0";

      overlay.style.visibility =
        "hidden";

      overlay.style.pointerEvents =
        "none";
    }

    mobileMenuTouchActive =
      false;

    mobileMenuTouchStartX =
      0;

    mobileMenuTouchStartY =
      0;

    mobileMenuTouchCurrentX =
      0;

    mobileMenuTouchCurrentY =
      0;
  }

  function toggleMobileMenu() {
    const sidebar =
      getMobileSidebar();

    if (!sidebar) {
      return;
    }

    if (
      sidebar.classList.contains(
        "open"
      )
    ) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  function setupMobileMenuTouch() {
    const sidebar =
      getMobileSidebar();

    if (
      !sidebar ||
      sidebar.dataset.mobileTouchReady ===
        "true"
    ) {
      return;
    }

    sidebar.dataset.mobileTouchReady =
      "true";

    /*
      TOUCH START
    */

    sidebar.addEventListener(
      "touchstart",
      event => {
        if (
          !sidebar.classList.contains(
            "open"
          )
        ) {
          return;
        }

        const touch =
          event.touches?.[0];

        if (!touch) {
          return;
        }

        mobileMenuTouchStartX =
          touch.clientX;

        mobileMenuTouchStartY =
          touch.clientY;

        mobileMenuTouchCurrentX =
          touch.clientX;

        mobileMenuTouchCurrentY =
          touch.clientY;

        mobileMenuTouchActive =
          true;

        /*
          Durante el gesto quitamos
          temporalmente la transición.
        */

        sidebar.style.transition =
          "none";
      },
      {
        passive:
          true
      }
    );

    /*
      TOUCH MOVE
    */

    sidebar.addEventListener(
      "touchmove",
      event => {
        if (
          !mobileMenuTouchActive ||
          !sidebar.classList.contains(
            "open"
          )
        ) {
          return;
        }

        const touch =
          event.touches?.[0];

        if (!touch) {
          return;
        }

        mobileMenuTouchCurrentX =
          touch.clientX;

        mobileMenuTouchCurrentY =
          touch.clientY;

        const deltaX =
          mobileMenuTouchCurrentX -
          mobileMenuTouchStartX;

        const deltaY =
          mobileMenuTouchCurrentY -
          mobileMenuTouchStartY;

        /*
          Solo consideramos swipe horizontal
          si el movimiento horizontal es mayor
          que el vertical.

          Además, solo permitimos swipe
          hacia la izquierda.
        */

        if (
          Math.abs(deltaX) <=
          Math.abs(deltaY)
        ) {
          return;
        }

        if (deltaX >= 0) {
          return;
        }

        const width =
          Math.max(
            sidebar.offsetWidth,
            1
          );

        const amount =
          Math.min(
            Math.abs(deltaX),
            width
          );

        sidebar.style.transform =
          `translateX(-${amount}px)`;

        const overlay =
          document.querySelector(
            ".mobile-menu-overlay"
          );

        if (overlay) {
          const opacity =
            Math.max(
              0,
              1 -
                amount /
                  width
            );

          overlay.style.opacity =
            String(
              opacity
            );
        }
      },
      {
        passive:
          true
      }
    );

    /*
      TOUCH END
    */

    sidebar.addEventListener(
      "touchend",
      () => {
        if (
          !mobileMenuTouchActive
        ) {
          return;
        }

        mobileMenuTouchActive =
          false;

        const deltaX =
          mobileMenuTouchCurrentX -
          mobileMenuTouchStartX;

        const deltaY =
          mobileMenuTouchCurrentY -
          mobileMenuTouchStartY;

        sidebar.style.transition =
          "";

        /*
          Si se deslizó suficientemente
          hacia la izquierda, cerramos.
        */

        if (
          deltaX < -70 &&
          Math.abs(deltaX) >
            Math.abs(deltaY)
        ) {
          closeMobileMenu();

          return;
        }

        /*
          Si el swipe no fue suficiente,
          regresamos el menú a su posición.
        */

        sidebar.style.transform =
          "";

        updateMobileMenuOverlay();
      },
      {
        passive:
          true
      }
    );

    /*
      TOUCH CANCEL
    */

    sidebar.addEventListener(
      "touchcancel",
      () => {
        mobileMenuTouchActive =
          false;

        sidebar.style.transition =
          "";

        sidebar.style.transform =
          "";

        updateMobileMenuOverlay();
      },
      {
        passive:
          true
      }
    );
  }

  function initializeMobileMenu() {
    if (
      mobileMenuInitialized
    ) {
      return;
    }

    mobileMenuInitialized =
      true;

    createMobileMenuOverlay();

    setupMobileMenuTouch();

    updateMobileMenuOverlay();

    /*
      ESCAPE
    */

    document.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Escape"
        ) {
          const sidebar =
            getMobileSidebar();

          if (
            sidebar?.classList.contains(
              "open"
            )
          ) {
            closeMobileMenu();
          }
        }
      }
    );

    /*
      Si la ventana cambia de tamaño,
      eliminamos cualquier estado extraño
      del drawer.
    */

    window.addEventListener(
      "resize",
      () => {
        const sidebar =
          getMobileSidebar();

        if (!sidebar) {
          return;
        }

        /*
          Si el navegador vuelve a desktop,
          no queremos dejar el overlay bloqueando
          la página.
        */

        if (
          !window.matchMedia(
            "(max-width: 900px)"
          ).matches
        ) {
          closeMobileMenu();
        }
      }
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

    const name =
      prompt(
        "Nombre del viaje:"
      );

    if (!name) return;

    if (!onlineMode) {
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
      if (
        /duplicate/i.test(
          memberError.message
        )
      ) {
        toast(
          "Ya perteneces a este grupo."
        );
      } else {
        toast(
          translateError(
            memberError.message
          )
        );
      }

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

  /* =======================================================
     INVITE FAMILY
     ======================================================= */

  async function inviteFamily() {
    if (!currentGroup) {
      toast(
        "Primero crea o selecciona un viaje."
      );

      return;
    }

    const code =
      currentGroup.invite_code ||
      "";

    if (!code) {
      toast(
        "Este viaje no tiene código de invitación."
      );

      return;
    }

    const destination =
      currentGroup.destination
        ? ` · ${currentGroup.destination}`
        : "";

    const message =
      `¡Únete a nuestro viaje en Nuestra Aventura! ✈️\n\n` +
      `${currentGroup.name}${destination}\n\n` +
      `Código de invitación: ${code}\n\n` +
      `Abre la app:\n${BUILTIN_CONFIG.SITE_URL}\n\n` +
      `Crea tu cuenta y usa el código para unirte al grupo.`;

    if (
      navigator.share &&
      typeof navigator.share ===
        "function"
    ) {
      try {
        await navigator.share({
          title:
            "Nuestra Aventura · Invitación",

          text:
            message,

          url:
            BUILTIN_CONFIG.SITE_URL
        });

        return;
      } catch (error) {
        if (
          error?.name ===
          "AbortError"
        ) {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(
        message
      );

      toast(
        "Invitación copiada. Ahora puedes pegarla en WhatsApp."
      );

      return;
    } catch (_) {}

    prompt(
      "Copia esta invitación:",
      message
    );
  }

  async function copyInviteCode() {
    if (!currentGroup?.invite_code) {
      toast(
        "No hay código de invitación."
      );

      return;
    }

    const code =
      currentGroup.invite_code;

    try {
      await navigator.clipboard.writeText(
        code
      );

      toast(
        `Código ${code} copiado.`
      );

      return;
    } catch (_) {}

    prompt(
      "Copia este código:",
      code
    );
  }

  /* =======================================================
     GROUP DATA
     ======================================================= */

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

    if (!Array.isArray(data[table])) {
      data[table] = [];
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
      input?.value.trim() || "";

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

    /*
      En una cuenta online, las personas reales
      deben crear su propia cuenta y unirse mediante
      el código.

      Ya no presentamos un formulario que parece
      crear una cuenta inexistente.
    */

    openInviteModal();
  }

  function openInviteModal() {
    const code =
      currentGroup?.invite_code ||
      "";

    openModal(
      "Invitar a la familia",

      [
        `
          <div class="modal-field">

            <label>
              Código de invitación
            </label>

            <div style="
              display:flex;
              gap:10px;
              align-items:center;
            ">

              <input
                value="${escapeAttr(code)}"
                readonly
                style="
                  flex:1;
                  font-weight:700;
                  letter-spacing:1px;
                "
              />

              <button
                type="button"
                class="btn secondary"
                data-copy-invite
              >
                Copiar
              </button>

            </div>

          </div>

          <div class="modal-field">

            <p style="
              margin:0;
              line-height:1.6;
            ">
              Comparte este código con tu familia.
              Cada persona crea su propia cuenta,
              entra a la app y selecciona
              <strong>Join Trip</strong>.
            </p>

          </div>

          <div class="modal-field">

            <button
              type="button"
              class="btn primary"
              data-share-invite
              style="width:100%;"
            >
              ✦ Share Invite
            </button>

          </div>
        `
      ],

      async () => {
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
    if (!$("modalTitle") ||
        !$("modalFields")) {
      toast(
        "No se encontró el componente de ventana."
      );

      return;
    }

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

    if ($("modalFields")) {
      $("modalFields")
        .innerHTML =
          "";
    }

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

    /*
      Los botones especiales de Invite Family
      no deben intentar guardar el modal.
    */

    if (
      event.submitter?.dataset
        ?.shareInvite ||
      event.submitter?.dataset
        ?.copyInvite
    ) {
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

    const code =
      currentGroup.invite_code ||
      "LOCAL";

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
          <strong>
            ${escapeHTML(code)}
          </strong>
        </div>

        <div
          class="group-actions"
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            margin-top:16px;
          "
        >

          <button
            type="button"
            class="btn secondary"
            data-copy-invite
          >
            Copy Code
          </button>

          <button
            type="button"
            class="btn primary"
            data-share-invite
          >
            ✦ Invite Family
          </button>

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

                      ${
                        member.user_id !==
                        currentGroup.owner_id
                          ? `
                            <button
                              class="delete-btn"
                              data-remove-member="${member.id}"
                            >
                              Eliminar
                            </button>
                          `
                          : `
                            <span class="tag">
                              OWNER
                            </span>
                          `
                      }

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
      try {
        supabaseClient
          .removeChannel(
            realtimeChannel
          );
      } catch (_) {}

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

    /*
      ======================================================
      MOBILE MENU

      Antes:
      sidebar.classList.toggle("open")

      Ahora:
      usamos el controlador completo del drawer.
      ======================================================
    */

    $("mobileMenuBtn")
      ?.addEventListener(
        "click",
        event => {
          event.preventDefault();

          event.stopPropagation();

          toggleMobileMenu();
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
    /*
      El botón del menú se maneja directamente
      en bindEvents(), así que no hacemos nada
      especial aquí con él.
    */

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

    const shareButton =
      event.target.closest(
        "[data-share-invite]"
      );

    if (shareButton) {
      await inviteFamily();

      return;
    }

    const copyButton =
      event.target.closest(
        "[data-copy-invite]"
      );

    if (copyButton) {
      await copyInviteCode();

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
      if (
        !button.dataset
          .originalText
      ) {
        button.dataset
          .originalText =
            button.textContent;
      }

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

    if (
      /invalid.*url/i
        .test(text)
    ) {
      return "La dirección de Supabase no es válida.";
    }

    return (
      text ||
      "Ocurrió un error. Intenta nuevamente."
    );
  }

})();
