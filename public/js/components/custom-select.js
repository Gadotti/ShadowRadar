const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHEVRON    = `<svg class="custom-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

/**
 * Initialises a custom styled dropdown inside `wrapper` (.custom-select-wrapper).
 * Supports single and multi-select modes.
 *
 * @param {HTMLElement} wrapper
 * @param {{
 *   options:      {value:string, label:string}[],
 *   value?:       string,
 *   values?:      string[],
 *   multiple?:    boolean,
 *   placeholder?: string,
 *   onChange?:    (v: string|string[]) => void,
 * }} config
 * @returns {{ getValue, setValue, getValues, setValues, setOptions, reset, destroy }}
 */
export function initCustomSelect(wrapper, config) {
  let options   = [...config.options];
  const { multiple = false, placeholder = '—', onChange } = config;

  let singleVal = config.value  ?? '';
  let multiVals = config.values ? [...config.values] : [];

  wrapper.innerHTML = `
    <button class="custom-select-trigger" type="button">
      <span class="custom-select-label"></span>
      ${CHEVRON}
    </button>
    <div class="custom-select-dropdown"></div>
  `;

  const trigger  = wrapper.querySelector('.custom-select-trigger');
  const labelEl  = wrapper.querySelector('.custom-select-label');
  const dropdown = wrapper.querySelector('.custom-select-dropdown');

  function syncLabel() {
    if (multiple) {
      if (!multiVals.length)       { labelEl.textContent = placeholder; return; }
      if (multiVals.length === 1)  { labelEl.textContent = options.find(o => o.value === multiVals[0])?.label ?? placeholder; return; }
      labelEl.textContent = `${multiVals.length} selecionados`;
    } else {
      labelEl.textContent = options.find(o => o.value === singleVal)?.label ?? placeholder;
    }
  }

  function buildDropdown() {
    dropdown.innerHTML = options.map(opt => {
      const sel = multiple ? multiVals.includes(opt.value) : opt.value === singleVal;
      return `<button class="custom-select-option${sel ? ' selected' : ''}" type="button" data-value="${opt.value}">
        <span class="custom-select-option-icon">${CHECK_ICON}</span>
        <span>${opt.label}</span>
      </button>`;
    }).join('');

    dropdown.querySelectorAll('.custom-select-option').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const v = btn.dataset.value;
        if (multiple) {
          multiVals = multiVals.includes(v) ? multiVals.filter(x => x !== v) : [...multiVals, v];
          syncLabel();
          buildDropdown();
          onChange?.(multiVals);
        } else {
          singleVal = v;
          syncLabel();
          close();
          buildDropdown();
          onChange?.(singleVal);
        }
      });
    });
  }

  function open()  { buildDropdown(); dropdown.classList.add('open'); trigger.classList.add('open'); }
  function close() { dropdown.classList.remove('open'); trigger.classList.remove('open'); }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.contains('open') ? close() : open();
  });

  function onDocClick(e) {
    if (!wrapper.isConnected) return;
    if (!wrapper.contains(e.target)) close();
  }
  document.addEventListener('click', onDocClick);

  syncLabel();

  return {
    getValue:   ()    => singleVal,
    setValue:   v     => { singleVal = v; syncLabel(); if (dropdown.classList.contains('open')) buildDropdown(); },
    getValues:  ()    => [...multiVals],
    setValues:  vs    => { multiVals = [...vs]; syncLabel(); if (dropdown.classList.contains('open')) buildDropdown(); },
    setOptions: opts  => { options = [...opts]; syncLabel(); if (dropdown.classList.contains('open')) buildDropdown(); },
    reset:      ()    => { if (multiple) { multiVals = []; } else { singleVal = config.value ?? ''; } syncLabel(); if (dropdown.classList.contains('open')) buildDropdown(); },
    destroy:    ()    => document.removeEventListener('click', onDocClick),
  };
}
