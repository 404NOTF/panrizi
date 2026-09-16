(() => {
  'use strict';
  const KEY = 'panrizi.events.v1';
  const CATEGORIES = ['生活', '节假日', '工作', '纪念日', '旅行', '其他'];
  const COLORS = ['peach', 'lavender', 'sage', 'butter', 'sky'];
  const REPEATS = ['none', 'yearly', 'monthly'];
  const ICONS = {生活:'☀', 节假日:'✿', 工作:'✎', 纪念日:'♥', 旅行:'✈', 其他:'✳'};
  const HOLIDAYS = [
    {key:'new-year',name:'元旦',kind:'fixed',month:1,day:1,icon:'✦'},
    {key:'spring',name:'春节',kind:'lunar',month:'正月',day:1,icon:'🧧'},
    {key:'qingming',name:'清明节',kind:'solar',icon:'🌿'},
    {key:'labor',name:'劳动节',kind:'fixed',month:5,day:1,icon:'☀'},
    {key:'dragon',name:'端午节',kind:'lunar',month:'五月',day:5,icon:'🍃'},
    {key:'mid-autumn',name:'中秋节',kind:'lunar',month:'八月',day:15,icon:'🌙'},
    {key:'national',name:'国庆节',kind:'fixed',month:10,day:1,icon:'✳'}
  ];
  const lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese',
    {month:'long',day:'numeric',timeZone:'Asia/Shanghai'});
  const holidayDates = new Map();
  const $ = (id) => document.getElementById(id);
  const eventDialog = $('eventDialog');
  const settingsDialog = $('settingsDialog');
  const holidayDialog = $('holidayDialog');
  let events = load();
  let filter = 'all';
  let lastToday = todayISO();

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
  function todayISO() { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function parts(s) { return s.split('-').map(Number); }
  function ordinal(s) { const [y,m,d] = parts(s); return Math.floor(Date.UTC(y,m-1,d) / 86400000); }
  function validDate(s) {
    if (typeof s !== 'string' || !/^(19|20|21)\d\d-\d\d-\d\d$/.test(s)) return false;
    const [y,m,d] = parts(s);
    return m >= 1 && m <= 12 && d >= 1 && d <= new Date(y,m,0).getDate();
  }
  function holidayDate(key, year) {
    const cacheKey = `${key}-${year}`;
    if (holidayDates.has(cacheKey)) return holidayDates.get(cacheKey);
    const holiday = HOLIDAYS.find(h => h.key === key);
    if (!holiday) return null;
    let date;
    if (holiday.kind === 'fixed') date = iso(year, holiday.month, holiday.day);
    else if (holiday.kind === 'solar') {
      // 21 世纪清明交节日的常用计算式。
      let day = Math.floor((year % 100) * 0.2422 + 4.81) - Math.floor((year % 100) / 4);
      date = iso(year, 4, day);
    } else if (key === 'spring' && year === 2027) {
      // 香港天文台 2027 年公历与农历对照表：2 月 6 日正月初一。
      date = '2027-02-06';
    } else {
      // 在公历年内寻找非闰月的对应农历日；当地时区不影响节日本身。
      for (let day = Date.UTC(year, 0, 1); day < Date.UTC(year + 1, 0, 1); day += 86400000) {
        const dateParts = lunarFormatter.formatToParts(new Date(day + 12 * 3600000));
        if (dateParts.find(p => p.type === 'month')?.value === holiday.month &&
            Number(dateParts.find(p => p.type === 'day')?.value) === holiday.day) {
          date = new Date(day).toISOString().slice(0,10);
          break;
        }
      }
    }
    holidayDates.set(cacheKey, date || null);
    return date || null;
  }
  function nextHolidayDate(key, today) {
    const year = parts(today)[0];
    for (let y = year; y <= year + 2; y++) {
      const date = holidayDate(key, y);
      if (date && date >= today) return date;
    }
    return null;
  }
  function normalized(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (!title || title.length > 60 || !validDate(value.date)) return null;
    return {
      id: typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.id) ? value.id : crypto.randomUUID(),
      title, date:value.date,
      category:CATEGORIES.includes(value.category) ? value.category : '其他',
      repeat:REPEATS.includes(value.repeat) ? value.repeat : 'none',
      color:COLORS.includes(value.color) ? value.color : 'peach',
      pinned:value.pinned === true,
      ...(HOLIDAYS.some(h => h.key === value.holidayKey) ? {holidayKey:value.holidayKey} : {})
    };
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data.slice(0,5000).map(normalized).filter(Boolean) : [];
    } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(events)); return true; }
    catch { alert('浏览器没能保存数据。请检查存储空间或隐私设置，并先导出备份。'); return false; }
  }
  function occurrence(item, today) {
    if (item.holidayKey) return nextHolidayDate(item.holidayKey, today) || item.date;
    if (item.repeat === 'none') return item.date;
    const [originalYear, month, day] = parts(item.date);
    const [year, currentMonth] = parts(today);
    if (year < originalYear) return item.date;
    const inMonth = (y,m) => iso(y,m,Math.min(day,new Date(y,m,0).getDate()));
    if (item.repeat === 'yearly') {
      const candidate = inMonth(year,month);
      return candidate >= today ? candidate : inMonth(year+1,month);
    }
    const candidate = inMonth(year,currentMonth);
    if (candidate >= today) return candidate;
    return currentMonth === 12 ? inMonth(year+1,1) : inMonth(year,currentMonth+1);
  }
  function enriched(item, today) {
    const target = occurrence(item,today);
    return {...item, target, days:ordinal(target)-ordinal(today)};
  }
  function sortedItems(today) {
    return events.map(e => enriched(e,today)).sort((a,b) =>
      Number(b.pinned)-Number(a.pinned) ||
      Number(a.days < 0)-Number(b.days < 0) ||
      (a.days < 0 ? b.days-a.days : a.days-b.days) ||
      a.title.localeCompare(b.title,'zh-CN'));
  }
  function shortDate(s) { const [y,m,d]=parts(s); return `${y}年${m}月${d}日`; }
  function make(tag, cls, content) {
    const el = document.createElement(tag);
    if (cls) el.className=cls;
    if (content != null) el.textContent=content;
    return el;
  }
  function renderHero(items) {
    const root=$('hero'); root.replaceChildren();
    const upcoming=items.filter(x=>x.days>=0);
    const first=upcoming[0];
    const card=make('div',`hero-card${first ? ' '+first.color : ' empty'}`);
    if (!first) {
      card.append(make('span','hero-label','从今天开始，期待点什么吧 ✳'));
      const bottom=make('div','');
      bottom.append(make('h2','hero-title','你的第一个倒计日'),make('p','','旅行、放假、生日……哪个先来？'));
      const button=make('button','','＋ 添加日子'); button.type='button'; button.addEventListener('click',()=>openForm());
      bottom.append(button); card.append(bottom);
    } else {
      const top=make('div','hero-top');
      top.append(make('span','hero-label',first.days===0?'就是今天 ✦':first.pinned?'置顶的期待 ✦':'下一个值得期待的日子'),make('span','hero-decor','✳'));
      const bottom=make('div','hero-bottom'); const titleBox=make('div','');
      titleBox.append(make('h2','hero-title',first.title),make('span','hero-date',shortDate(first.target)));
      const number=make('div','hero-number'); number.append(make('strong','',first.days),make('span','',first.days===0?'天！':'天'));
      bottom.append(titleBox,number); card.append(top,bottom);
    }
    root.append(card);
  }
  function renderList(items) {
    const list=$('eventList'); list.replaceChildren();
    const shown=items.filter(e => filter==='all' ||
      (filter==='upcoming' && e.days>=0) ||
      (filter==='past' && e.days<0) ||
      (filter==='recurring' && e.repeat!=='none') ||
      (filter==='holiday' && e.category==='节假日'));
    if (!shown.length) {
      list.append(make('p','empty-list',events.length?'这里还没有符合条件的日子。':'还没有日子呢，点“新增”写下第一个吧。'));
      return;
    }
    const fragment=document.createDocumentFragment();
    shown.forEach(e => {
      const button=make('button','event-card'); button.type='button'; button.setAttribute('aria-label',`编辑${e.title}`);
      const icon=make('span',`event-icon ${e.color}`,ICONS[e.category]); icon.setAttribute('aria-hidden','true');
      const main=make('span','event-main'); main.append(make('span','event-name',`${e.pinned?'✦ ':''}${e.title}`));
      const recurring=e.holidayKey?' · 按节日日期更新':e.repeat==='yearly'?' · 每年':e.repeat==='monthly'?' · 每月':'';
      main.append(make('span','event-meta',`${e.category} · ${shortDate(e.target)}${recurring}`));
      const days=make('span','event-days');
      days.append(make('strong','',Math.abs(e.days)),make('small','',e.days===0?'就是今天':e.days>0?'天后':'天前'));
      button.append(icon,main,days); button.addEventListener('click',()=>openForm(e.id)); fragment.append(button);
    });
    list.append(fragment);
  }
  function upcomingHolidays(today) {
    return HOLIDAYS.map(h => ({...h,date:nextHolidayDate(h.key,today)}))
      .filter(h => h.date).sort((a,b) => a.date.localeCompare(b.date));
  }
  function renderHolidayPreview(today) {
    const preview = $('holidayPreview'); preview.replaceChildren();
    upcomingHolidays(today).slice(0,2).forEach(h => {
      const tile = make('button','holiday-tile'); tile.type = 'button';
      const heading = make('span','holiday-tile-heading');
      heading.append(make('span','holiday-tile-icon',h.icon),make('span','holiday-tile-name',h.name));
      const days = ordinal(h.date) - ordinal(today);
      tile.append(heading,make('span','holiday-tile-date',shortDate(h.date)),
        make('span','holiday-tile-days',days === 0 ? '就是今天' : `还有 ${days} 天`));
      tile.addEventListener('click',()=>openHolidayPicker()); preview.append(tile);
    });
  }
  function renderHolidayPicker(today) {
    const picker = $('holidayPicker'); picker.replaceChildren();
    HOLIDAYS.forEach(h => {
      const date = nextHolidayDate(h.key,today);
      const added = events.some(e => e.holidayKey === h.key);
      const button = make('button','holiday-option'); button.type = 'button'; button.disabled = added || !date;
      const icon = make('span','holiday-option-icon',h.icon);
      const detail = make('span','holiday-option-detail');
      detail.append(make('strong','',h.name),make('small','',date ? shortDate(date) : '暂无日期'));
      button.append(icon,detail,make('span','holiday-option-action',added ? '已加入 ✓' : '＋ 加入'));
      button.addEventListener('click',()=>addHolidayPresets([h.key])); picker.append(button);
    });
    $('addAllHolidays').disabled = HOLIDAYS.every(h => events.some(e => e.holidayKey === h.key));
    $('addAllHolidays').textContent = $('addAllHolidays').disabled ? '都已经加入啦 ✓' : '把这些节日都加入 ↗';
  }
  function openHolidayPicker() { renderHolidayPicker(todayISO()); holidayDialog.showModal(); }
  function addHolidayPresets(keys) {
    const old = events;
    const today = todayISO();
    const added = keys.filter(key => HOLIDAYS.some(h => h.key === key) &&
      !events.some(e => e.holidayKey === key)).map(key => {
        const holiday = HOLIDAYS.find(h => h.key === key);
        return normalized({id:crypto.randomUUID(),title:holiday.name,date:nextHolidayDate(key,today),
          category:'节假日',repeat:'yearly',color:'butter',pinned:false,holidayKey:key});
      }).filter(Boolean);
    if (!added.length) return;
    events = [...old,...added];
    if (!save()) { events = old; return; }
    render(); renderHolidayPicker(today);
  }
  function render() {
    const today=todayISO(); lastToday=today;
    $('todayLabel').textContent=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
    $('countLabel').textContent=events.length;
    const items=sortedItems(today); renderHero(items); renderHolidayPreview(today); renderList(items);
  }
  function openForm(id) {
    const item=events.find(e=>e.id===id);
    $('eventForm').reset(); $('eventId').value=item?.id || '';
    $('formTitle').textContent=item?'编辑这个日子':'加一个日子';
    $('eventTitle').value=item?.title || '';
    $('eventDate').value=item?.holidayKey ? occurrence(item,todayISO()) : item?.date || todayISO();
    $('eventDate').disabled=Boolean(item?.holidayKey);
    $('eventCategory').value=item?.category || '生活';
    $('eventRepeat').value=item?.repeat || 'none';
    $('eventRepeat').disabled=Boolean(item?.holidayKey);
    $('presetNote').classList.toggle('hidden',!item?.holidayKey);
    document.querySelector(`input[name="color"][value="${item?.color || 'peach'}"]`).checked=true;
    $('eventPinned').checked=item?.pinned || false;
    $('deleteButton').classList.toggle('hidden',!item);
    eventDialog.showModal();
  }
  $('eventForm').addEventListener('submit',e=>{
    e.preventDefault();
    const title=$('eventTitle').value.trim(); const date=$('eventDate').value;
    if (!title || title.length>60 || !validDate(date)) { alert('请填写有效的标题和日期。'); return; }
    const id=$('eventId').value || crypto.randomUUID();
    const original=events.find(x=>x.id===id);
    const item=normalized({id,title,date,category:$('eventCategory').value,repeat:$('eventRepeat').value,
      color:document.querySelector('input[name="color"]:checked').value,pinned:$('eventPinned').checked,
      holidayKey:original?.holidayKey});
    const old=events; events=old.some(x=>x.id===id)?old.map(x=>x.id===id?item:x):[...old,item];
    if (!save()) { events=old; return; }
    eventDialog.close(); render();
  });
  $('deleteButton').addEventListener('click',()=>{
    const id=$('eventId').value; const item=events.find(x=>x.id===id);
    if (!item || !confirm(`确定删除“${item.title}”吗？`)) return;
    const old=events; events=events.filter(x=>x.id!==id);
    if (!save()) { events=old; return; }
    eventDialog.close(); render();
  });
  $('addButton').addEventListener('click',()=>openForm());
  $('addInline').addEventListener('click',()=>openForm());
  $('chooseHolidays').addEventListener('click',openHolidayPicker);
  $('addHolidayCustom').addEventListener('click',()=>{openForm();$('eventCategory').value='节假日';});
  $('addAllHolidays').addEventListener('click',()=>addHolidayPresets(HOLIDAYS.map(h=>h.key)));
  $('settingsButton').addEventListener('click',()=>settingsDialog.showModal());
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  [eventDialog,settingsDialog,holidayDialog].forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{
    filter=b.dataset.filter;
    document.querySelectorAll('.filter').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
    render();
  }));
  $('exportButton').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({app:'panrizi',version:1,exportedAt:new Date().toISOString(),events},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const link=make('a'); link.href=url; link.download=`盼日子备份-${todayISO()}.json`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  $('importButton').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async e=>{
    const file=e.target.files[0]; e.target.value=''; if(!file)return;
    if(file.size>2_000_000){alert('备份文件太大了（最多 2 MB）。');return;}
    try {
      const input=JSON.parse(await file.text());
      if(input?.app!=='panrizi' || input.version!==1 || !Array.isArray(input.events) || input.events.length>5000)throw Error();
      const incoming=input.events.map(normalized);
      if(incoming.some(x=>!x))throw Error();
      const known=new Set(events.map(x=>x.id));const added=[];
      for(const item of incoming){if(!known.has(item.id)){known.add(item.id);added.push(item);}}
      if(!added.length){alert('备份中没有需要新增的日子。');return;}
      const old=events; events=[...events,...added];
      if(!save()){events=old;return;}
      settingsDialog.close();render();alert(`已导入 ${added.length} 个日子。`);
    } catch {alert('没有成功读取备份。请选择由这个 App 导出的 JSON 文件。');}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && todayISO()!==lastToday)render();});
  setInterval(()=>{if(!document.hidden && todayISO()!==lastToday)render();},60000);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();
})();
