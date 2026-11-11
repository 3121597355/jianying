import { getResume, getUi, set, commit, createDefault } from './store.js';
import { SKINS, FONTS } from './dict.js';
import {applyMotionPreference} from './motion.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildSettingsPanel() {
  const settings = getResume().setData;
  const panel = document.createElement('div');
  panel.className = 'set_box grouped-settings';
  panel.setAttribute('role','region');
  panel.setAttribute('aria-label','简历设置');
  const ranges = [
    { key: 'mm', label: '模块间距', min: 5, max: 50, step: 1, unit: 'px' },
    { key: 'lineHeight', label: '行间距', min: 1.3, max: 2.2, step: .05, unit: '' },
    { key: 'pp', label: '页面边距', min: 10, max: 80, step: 1, unit: 'px' },
  ];
  panel.innerHTML = `<div class="settings-panel-heading"><strong>简历设置</strong><button type="button" data-close-settings aria-label="关闭简历设置" title="关闭简历设置">×</button></div>
    <div class="settings-tabs" role="tablist" aria-label="简历设置类别">
      ${[['layout', '排版'], ['text', '文字'], ['color', '配色'], ['heading', '标题']].map(([key, label]) => `<button type="button" role="tab" id="settings-tab-${key}" data-settings-tab="${key}" aria-controls="settings-section-${key}">${label}</button>`).join('')}
    </div>
    <section class="settings-section" id="settings-section-layout" role="tabpanel" aria-labelledby="settings-tab-layout" data-settings-section="layout">
      ${ranges.map(range => `<div class="settings-range"><label for="setting-${range.key}">${range.label}</label><output for="setting-${range.key}" data-setting-value="${range.key}">${settings[range.key]}${range.unit}</output><input id="setting-${range.key}" type="range" data-setting="${range.key}" min="${range.min}" max="${range.max}" step="${range.step}" value="${settings[range.key]}"><button type="button" data-setting-reset="${range.key}" aria-label="重置${range.label}">重置</button></div>`).join('')}
      <label class="settings-field" for="setting-motion"><span>界面动效</span><select id="setting-motion"><option value="system">跟随系统</option><option value="soft">柔和动效</option><option value="reduce">关闭动效</option></select></label>
    </section>
    <section class="settings-section" id="settings-section-text" role="tabpanel" aria-labelledby="settings-tab-text" data-settings-section="text" hidden>
      <label class="settings-field" for="setting-font"><span>正文字体</span><select id="setting-font" data-setting="font">${FONTS.map(font => `<option value="${font.value}"${font.value === Number(settings.font) ? ' selected' : ''}>${esc(font.label)}</option>`).join('')}</select></label>
      <label class="settings-field" for="setting-fontSize"><span>正文字号</span><select id="setting-fontSize" data-setting="fontSize">${Array.from({ length: 9 }, (_, index) => index + 10).map(size => `<option value="${size}"${size === Number(settings.fontSize) ? ' selected' : ''}>${size}px</option>`).join('')}</select></label>
    </section>
    <section class="settings-section" id="settings-section-color" role="tabpanel" aria-labelledby="settings-tab-color" data-settings-section="color" hidden>
      <span class="settings-caption">简历配色</span><div class="settings-swatches">${SKINS.map(color => `<button type="button" data-setting-skin="${color}" aria-label="使用${color}配色" style="background:${color}"></button>`).join('')}</div>
      <label class="settings-field" for="setting-skin"><span>自选颜色</span><input id="setting-skin" data-setting="skin" type="color" value="${esc(settings.skin)}"></label>
    </section>
    <section class="settings-section" id="settings-section-heading" role="tabpanel" aria-labelledby="settings-tab-heading" data-settings-section="heading" hidden>
      <label class="settings-field" for="setting-title"><span>简历标题</span><input id="setting-title" data-setting="title" maxlength="80" value="${esc(settings.title)}"></label>
      <label class="settings-field" for="setting-slogan"><span>副标题</span><input id="setting-slogan" data-setting="slogan" maxlength="200" value="${esc(settings.slogan)}"></label>
    </section>
    <p class="settings-note">修改实时显示在简历上，并自动保存</p><button type="button" class="save-personal-template">保存为自定义模板</button>`;

  const tabs = [...panel.querySelectorAll('[data-settings-tab]')];
  function selectTab(key, save = true) {
    const active = tabs.find(tab => tab.dataset.settingsTab === key) || tabs[0];
    tabs.forEach(tab => { const selected = tab === active; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    panel.querySelectorAll('[data-settings-section]').forEach(section => { section.hidden = section.dataset.settingsSection !== active.dataset.settingsTab; });
    if (save) { getUi().settingsTab = active.dataset.settingsTab; commit(); }
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => selectTab(tab.dataset.settingsTab);
    tab.onkeydown = event => {
      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const target = offset ? tabs[(index + offset + tabs.length) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : null;
      if (target) { event.preventDefault(); selectTab(target.dataset.settingsTab); target.focus(); }
    };
  });
  selectTab(getUi().settingsTab, false);
  const motion=panel.querySelector('#setting-motion');
  motion.value=getUi().motionMode||'system';
  motion.onchange=()=>{getUi().motionMode=motion.value;applyMotionPreference(motion.value);commit();};

  const paintColor = () => {
    const color = getResume().setData.skin.toLowerCase();
    panel.querySelectorAll('[data-setting-skin]').forEach(button => { const active = button.dataset.settingSkin.toLowerCase() === color; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    panel.querySelector('#setting-skin').value = color;
  };
  const applySetting = (key, value) => {
    set(resume => { resume.setData[key] = ['mm', 'lineHeight', 'pp', 'font', 'fontSize'].includes(key) ? Number(value) : value; });
    const output = panel.querySelector(`[data-setting-value="${key}"]`);
    const range = ranges.find(range => range.key === key);
    if (output) output.textContent = `${key === 'lineHeight' ? Number(value).toFixed(2) : value}${range.unit}`;
    if (key === 'skin') paintColor();
  };
  panel.querySelectorAll('[data-setting]').forEach(input => input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => applySetting(input.dataset.setting, input.value)));
  panel.querySelectorAll('[data-setting-reset]').forEach(button => button.onclick = () => { const key = button.dataset.settingReset; const value = createDefault().setData[key]; panel.querySelector(`[data-setting="${key}"]`).value = value; applySetting(key, value); });
  panel.querySelectorAll('[data-setting-skin]').forEach(button => button.onclick = () => applySetting('skin', button.dataset.settingSkin));
  paintColor();
  panel.querySelector('.save-personal-template').onclick=()=>document.dispatchEvent(new CustomEvent('qm-save-personal-template'));
  return panel;
}
