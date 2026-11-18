/** Marcado del shell DOM: botones HUD, pausa, ajustes, aviso de orientación y controles táctiles. */

export const ICON = {
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V3h6v2.4H5.4V9zm12-6h6v6h-2.4V5.4H15zM3 15h2.4v3.6H9V21H3zm15.6 0H21v6h-6v-2.4h3.6z"/></svg>',
  compress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3H9v6H3V6.6h3.6zM15 3h2.4v3.6H21V9h-6zM3 15h6v6H6.6v-3.6H3zm12 0h6v2.4h-3.6V21H15z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zm7.5 0H18v16h-4.5z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 3.5 12 9.9l6.4-6.4 2.1 2.1-6.4 6.4 6.4 6.4-2.1 2.1-6.4-6.4-6.4 6.4-2.1-2.1 6.4-6.4-6.4-6.4z"/></svg>',
  dpad: '<svg class="kicon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z"/></svg>',
  arrowUp: '<svg class="kicon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 13.5 9H10v4.5H6V9H2.5z" transform="rotate(0 8 8)"/></svg>',
  arrowRight: '<svg class="kicon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 13.5 9H10v4.5H6V9H2.5z" transform="rotate(90 8 8)"/></svg>',
  arrowDown: '<svg class="kicon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 13.5 9H10v4.5H6V9H2.5z" transform="rotate(180 8 8)"/></svg>',
  arrowLeft: '<svg class="kicon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 13.5 9H10v4.5H6V9H2.5z" transform="rotate(270 8 8)"/></svg>',
}

const ARROW_ICON: Record<string, string> = { ArrowUp: ICON.arrowUp, ArrowDown: ICON.arrowDown, ArrowLeft: ICON.arrowLeft, ArrowRight: ICON.arrowRight }

/** Contenido de una tecla dibujada: las flechas como icono SVG y el resto como texto escapado. */
export function keyGlyph(label: string): string {
  return ARROW_ICON[label] ?? label.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
}

const toggleRow = (id: string, label: string) => `
  <button id="${id}" class="settings-row" role="switch" aria-checked="false" data-nav>
    <span>${label}</span><span class="switch" aria-hidden="true"><span class="switch-knob"></span></span>
  </button>`

const sliderRow = (id: string, label: string) => `
  <label class="settings-row settings-row--slider" for="${id}">
    <span>${label}</span>
    <span class="slider-wrap">
      <input id="${id}" type="range" min="0" max="100" step="5" data-nav />
      <output id="${id}-value" class="slider-value">0</output>
    </span>
  </label>`

const pad = (b: 'a' | 'b' | 'x' | 'y') => `<span class="pad-btn pad-btn--${b}">${b.toUpperCase()}</span>`
const padWide = (label: string) => `<span class="pad-btn pad-btn--wide">${label}</span>`

/** Ayudas al pie de los paneles: una versión por dispositivo; el CSS enseña la del modo de entrada actual. */
const navHints = `
  <footer class="overlay-hints overlay-hints--keyboard" aria-hidden="true">
    <span><kbd>${ICON.arrowUp}</kbd><kbd>${ICON.arrowDown}</kbd> elegir</span>
    <span><kbd>Enter</kbd> aceptar</span>
    <span><kbd>Esc</kbd> volver</span>
  </footer>
  <footer class="overlay-hints overlay-hints--gamepad" aria-hidden="true">
    <span>${padWide(ICON.dpad)} elegir</span>
    <span>${pad('a')} aceptar</span>
    <span>${pad('b')} volver</span>
  </footer>`

export function shellHtml(opts: { isTouch: boolean, fullscreen: boolean }) {
  const { isTouch, fullscreen } = opts
  return `
  <div id="game-shell" class="${isTouch ? 'is-touch' : 'is-desktop'}">
    <div id="game-host"></div>

    <div class="hud-cluster">
      ${fullscreen ? `<button id="btn-fullscreen-quick" class="hud-btn hud-btn--menu" aria-label="Pantalla completa" title="Pantalla completa (F)">${ICON.expand}</button>` : ''}
      <button id="btn-settings" class="hud-btn hud-btn--menu" aria-label="Ajustes" title="Ajustes (Esc)">${ICON.gear}</button>
      <button id="btn-pause" class="hud-btn hud-btn--match" aria-label="Pausa" title="Pausa (Esc)">${ICON.pause}</button>
    </div>

    <div id="pause-menu" class="overlay overlay--pause" hidden tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div class="overlay-card pause-card">
        <header class="pause-head">
          <span id="pause-kicker" class="pause-kicker"></span>
          <h2 id="pause-title" class="pause-title">PAUSA</h2>
          <div class="pause-score" aria-label="Marcador">
            <span class="pause-side" id="pause-side-left" hidden><img class="pause-crest" alt="" hidden><span class="pause-name"></span></span>
            <span class="pause-score-team pause-score-team--blue" id="pause-left">0</span>
            <span class="pause-score-sep">–</span>
            <span class="pause-score-team pause-score-team--red" id="pause-right">0</span>
            <span class="pause-side" id="pause-side-right" hidden><img class="pause-crest" alt="" hidden><span class="pause-name"></span></span>
          </div>
        </header>
        <nav class="pause-list" data-view="main" aria-label="Menú de pausa">
          <button class="menu-item" data-act="resume" data-nav>Continuar</button>
          <button class="menu-item" data-act="restart" data-nav>Reiniciar partido</button>
          <button class="menu-item" data-act="settings" data-nav>Ajustes</button>
          <button class="menu-item" data-act="controls" data-nav>Controles</button>
          <button class="menu-item menu-item--danger" data-act="quit" data-nav>Salir al menú</button>
        </nav>
        <div class="pause-confirm" data-view="confirm" hidden>
          <p id="pause-confirm-text" class="pause-confirm-text"></p>
          <div class="pause-confirm-row" data-nav-row>
            <button class="menu-item menu-item--danger" data-act="confirm-yes" data-nav>Sí</button>
            <button class="menu-item" data-act="confirm-no" data-nav>No</button>
          </div>
        </div>
        ${navHints}
      </div>
    </div>

    <div id="settings-panel" class="overlay" hidden tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="overlay-card settings-card">
        <header class="settings-header">
          <span id="settings-title" class="settings-title">AJUSTES</span>
          <button id="btn-settings-close" class="settings-close" aria-label="Cerrar" data-nav>${ICON.close}</button>
        </header>

        <div class="settings-tabs" role="tablist" aria-label="Secciones de ajustes">
          <button class="settings-tab" role="tab" id="tab-general" aria-controls="pane-general" data-tab="general" data-nav>General</button>
          <button class="settings-tab" role="tab" id="tab-audio" aria-controls="pane-audio" data-tab="audio" data-nav>Audio</button>
          <button class="settings-tab" role="tab" id="tab-controls" aria-controls="pane-controls" data-tab="controls" data-nav>Controles</button>
        </div>

        <div class="settings-body">
          <section class="settings-pane" id="pane-general" role="tabpanel" aria-labelledby="tab-general" data-pane="general">
            ${fullscreen ? `
            <h3 class="settings-section-title">PANTALLA</h3>
            ${toggleRow('btn-fullscreen', 'Pantalla completa')}` : ''}
            <h3 class="settings-section-title">PARTIDO</h3>
            <button id="half-length" class="settings-row settings-row--stepper" data-nav>
              <span>Duración de cada parte</span>
              <span class="stepper" aria-hidden="true">
                <span class="stepper-arrow" data-step="-1">${ICON.arrowLeft}</span>
                <span id="half-length-value" class="stepper-value"></span>
                <span class="stepper-arrow" data-step="1">${ICON.arrowRight}</span>
              </span>
            </button>
            <p id="half-length-note" class="settings-note">Dos partes de 25:00 en el marcador, como en el reglamento; el reloj corre acelerado.</p>
            ${toggleRow('btn-role-labels', 'Etiquetas de rol sobre los jugadores')}
            <h3 class="settings-section-title">GRÁFICOS</h3>
            <button id="quality" class="settings-row settings-row--stepper" data-nav>
              <span>Calidad gráfica</span>
              <span class="stepper" aria-hidden="true">
                <span class="stepper-arrow" data-step="-1">${ICON.arrowLeft}</span>
                <span id="quality-value" class="stepper-value"></span>
                <span class="stepper-arrow" data-step="1">${ICON.arrowRight}</span>
              </span>
            </button>
            <p id="quality-note" class="settings-note"></p>
          </section>

          <section class="settings-pane" id="pane-audio" role="tabpanel" aria-labelledby="tab-audio" data-pane="audio" hidden>
            <h3 class="settings-section-title">VOLUMEN</h3>
            ${sliderRow('vol-master', 'General')}
            ${sliderRow('vol-sfx', 'Efectos')}
            ${sliderRow('vol-crowd', 'Público')}
            <h3 class="settings-section-title">VOZ</h3>
            ${toggleRow('btn-announcer', 'Locutor (arcade)')}
          </section>

          <section class="settings-pane settings-pane--controls" id="pane-controls" role="tabpanel" aria-labelledby="tab-controls" data-pane="controls" hidden>
            ${isTouch ? `
            <div class="touch-section">
            <h3 class="settings-section-title">TÁCTIL</h3>
            <dl class="settings-controls">
              <div><dt><kbd>Joystick</kbd></dt><dd>Mover</dd></div>
              <div><dt><kbd>A</kbd></dt><dd>Disparar · Robar</dd></div>
              <div><dt><kbd>B</kbd></dt><dd>Pasar · Cambiar jugador</dd></div>
              <div><dt><kbd>S</kbd></dt><dd>Sprint / turbo</dd></div>
              <div><dt><kbd>S</kbd>+<kbd>A</kbd></dt><dd>Tiro turbo · Carga (arcade)</dd></div>
            </dl>
            </div>` : ''}
            <div class="pad-section">
            <h3 class="settings-section-title">MANDO</h3>
            <dl class="settings-controls settings-controls--pad">
              <div><dt>${padWide('Stick')} ${padWide(ICON.dpad)}</dt><dd>Mover</dd></div>
              <div><dt>${padWide('RT')} ${padWide('RB')}</dt><dd>Sprint / turbo</dd></div>
              <div><dt>${pad('x')} ${pad('b')}</dt><dd>Disparar · Robar</dd></div>
              <div><dt>${padWide('RT')}+${pad('x')}</dt><dd>Tiro turbo · Carga (arcade)</dd></div>
              <div><dt>${pad('a')}</dt><dd>Pasar · Cambiar jugador</dd></div>
              <div><dt>${padWide('Start')}</dt><dd>Pausa</dd></div>
            </dl>
            <p class="settings-note settings-note--pad">Mandos compatibles con el navegador (Xbox, PlayStation y la mayoría de USB/Bluetooth). Los botones del mando son fijos.</p>
            </div>
            <div class="keyboard-section">
            <h3 class="settings-section-title">TECLADO</h3>
            <p class="settings-note">Elige una casilla y pulsa la tecla nueva. <kbd>Supr</kbd> la deja vacía; <kbd>Esc</kbd> cancela.</p>
            <div id="bindings-table" class="bindings-table" role="group" aria-label="Asignación de teclas"></div>
            <p id="bindings-msg" class="bindings-msg" role="status" aria-live="polite"></p>
            <dl class="settings-controls settings-controls--fixed">
              <div><dt><kbd>Shift</kbd>+<kbd>Tiro</kbd></dt><dd>Tiro turbo · Carga (arcade)</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>Pausa</dd></div>
              ${fullscreen ? '<div><dt><kbd>F</kbd></dt><dd>Pantalla completa</dd></div>' : ''}
            </dl>
            <button id="btn-bindings-reset" class="menu-item menu-item--small" data-nav>Restablecer teclas</button>
            </div>
          </section>
        </div>
        ${navHints}
      </div>
    </div>

    <div id="rotate-overlay" role="alertdialog" aria-labelledby="rotate-title" aria-describedby="rotate-text">
      <div class="rotate-rink" aria-hidden="true"></div>
      <div class="rotate-content">
        <svg class="rotate-phone" viewBox="0 0 140 140" aria-hidden="true">
          <path class="rotate-arrow" d="M26 52a46 46 0 0 1 66-32" />
          <path class="rotate-arrow-head" d="M86 10l12 10-15 6z" />
          <g class="rotate-device">
            <rect x="46" y="26" width="48" height="88" rx="9" class="device-body" />
            <rect x="51" y="35" width="38" height="70" rx="3" class="device-screen" />
            <line x1="51" y1="70" x2="89" y2="70" class="device-line" />
            <circle cx="70" cy="70" r="8" class="device-circle" />
            <circle cx="70" cy="52" r="3.4" class="device-ball" />
          </g>
        </svg>
        <h2 id="rotate-title" class="rotate-title">GIRA EL MÓVIL</h2>
        <p id="rotate-text" class="rotate-text">Rink Hockey se juega en horizontal</p>
      </div>
    </div>

    <div id="mobile-controls" aria-hidden="true">
      <div id="left-zone"></div>
      <div id="right-buttons">
        <button id="btn-shoot" class="touch-btn">A</button>
        <button id="btn-pass" class="touch-btn">B</button>
        <button id="btn-sprint" class="touch-btn">S</button>
      </div>
    </div>
  </div>
`
}
