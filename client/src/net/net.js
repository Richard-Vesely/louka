// ============================================================ spojení se hrou
// Všechny změny světa a inventáře jdou přes net.act({ t: 'akce', ... }).
// Offline (net/local.js) hra běží přímo v prohlížeči; online je na druhé straně server.
// Co se vrací (události), zpracuje net/events.js.

/**
 * Naplní se při startu hry (main.js).
 * @type {{mode:string, act:(msg:object)=>void, tick:(dt:number, realDt:number)=>void, game:any}}
 */
export const net = {
  mode: 'none',
  act() {},
  tick() {},
  game: null,
};
