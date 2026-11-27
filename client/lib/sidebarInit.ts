export const SIDEBAR_STORAGE_KEY = "candido:sidebar";

/** Runs in <head> before first paint, so a collapsed sidebar never flashes open on reload. */
export const sidebarInitScript = `try{if(localStorage.getItem("${SIDEBAR_STORAGE_KEY}")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
