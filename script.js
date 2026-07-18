// FIREBASE
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const eventsCol = db.collection("events");
function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function toStr(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}
let cal;
let selDate = toStr(new Date());
let fbConnected = false;
// BAŞLANGIÇ
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-date').value = selDate;
    document.getElementById('end-date').value   = selDate;
    document.getElementById('current-date').innerText =
        new Date().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    const calEl = document.getElementById('calendar');

    cal = new FullCalendar.Calendar(calEl, {
        initialView:    'dayGridMonth',
        locale:         'tr',
        height:         '100%',
        headerToolbar:  { left: 'prev,next myToday', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        eventTimeFormat:{ hour:'2-digit', minute:'2-digit', hour12:false },
        displayEventEnd: true,
        selectable:     true,
        selectMirror:   false,
        unselectAuto:   false,
        nowIndicator:   true,

        customButtons: {
            myToday: {
                text: 'Bugün',
                click() {
                    cal.today();
                    const s = toStr(new Date());
                    selDate = s;
                    document.getElementById('start-date').value = s;
                    document.getElementById('end-date').value   = s;
                    setTimeout(() => {
                        document.querySelectorAll('.fc-daygrid-day').forEach(e => e.classList.remove('fc-day-selected'));
                        document.querySelector('.fc-day-today')?.classList.add('fc-day-selected');
                    }, 60);
                    document.getElementById('selected-day-label').innerText =
                        '📅 ' + new Date().toLocaleDateString('tr-TR',{ weekday:'long', day:'numeric', month:'long' });
                    refreshList();
                }
            }
        },

        select(info) {
            const start = info.startStr.split('T')[0];
            const fcEnd = parseDate(info.endStr.split('T')[0]);
            fcEnd.setDate(fcEnd.getDate() - 1);
            const end = toStr(fcEnd);
            const single = start === end;

            document.querySelectorAll('.fc-daygrid-day').forEach(e => e.classList.remove('fc-day-selected'));
            let cur = parseDate(start);
            while (cur <= parseDate(end)) {
                document.querySelector(`[data-date="${toStr(cur)}"]`)?.classList.add('fc-day-selected');
                cur.setDate(cur.getDate() + 1);
            }

            selDate = start;
            document.getElementById('start-date').value = start;
            document.getElementById('end-date').value   = end;

            const lbl = document.getElementById('selected-day-label');
            if (single) {
                document.getElementById('all-day-checkbox').checked = false;
                toggleTimeInputs();
                lbl.innerText = '📅 ' + parseDate(start).toLocaleDateString('tr-TR',{ weekday:'long', day:'numeric', month:'long' });
            } else {
                document.getElementById('all-day-checkbox').checked = true;
                toggleTimeInputs();
                lbl.innerText = '📅 ' +
                    parseDate(start).toLocaleDateString('tr-TR',{ day:'numeric', month:'long' }) +
                    ' — ' +
                    parseDate(end).toLocaleDateString('tr-TR',{ day:'numeric', month:'long' });
            }
            refreshList();
        },

        dateClick(info) {
            document.querySelectorAll('.fc-daygrid-day').forEach(e => e.classList.remove('fc-day-selected'));
            info.dayEl.classList.add('fc-day-selected');
            selDate = info.dateStr;
            document.getElementById('start-date').value = info.dateStr;
            document.getElementById('end-date').value   = info.dateStr;
            document.getElementById('all-day-checkbox').checked = false;
            toggleTimeInputs();
            document.getElementById('selected-day-label').innerText =
                '📅 ' + parseDate(info.dateStr).toLocaleDateString('tr-TR',{ weekday:'long', day:'numeric', month:'long' });
            refreshList();
        },

        eventClick(info) {
            if (!confirm('Bu etkinliği silmek istiyor musunuz?')) return;
            const fid = info.event.extendedProps.firebaseId;
            info.event.remove();
            saveLoc();
            if (fid) delFB(fid);
            refreshList();
        },

        events: JSON.parse(localStorage.getItem('aj_events') || '[]')
    });

    cal.render();

    calEl.addEventListener('wheel', e => {
        e.preventDefault();
        e.deltaY > 0 ? cal.next() : cal.prev();
    }, { passive: false });

    setTimeout(() => {
        document.querySelector('.fc-day-today')?.classList.add('fc-day-selected');
        document.getElementById('selected-day-label').innerText =
            '📅 ' + new Date().toLocaleDateString('tr-TR',{ weekday:'long', day:'numeric', month:'long' });
    }, 120);

    refreshList();
    setupPanels();
    setTheme(localStorage.getItem('aj_theme') || 'ocean');
    connectFB();
});
// FIREBASE
function connectFB() {
    setStatus('connecting');
    try {
        eventsCol.orderBy('createdAt', 'desc').onSnapshot(snap => {
            fbConnected = true;
            setStatus('connected');

            cal.getEvents().forEach(e => e.remove());
            snap.forEach(doc => {
                const d = doc.data();
                cal.addEvent({
                    title:    d.title,
                    start:    d.start,
                    end:      d.end || null,
                    allDay:   d.allDay,
                    className:'cat-' + d.category,
                    extendedProps: { category: d.category, firebaseId: doc.id, source: 'firebase' }
                });
            });
            saveLoc();
            refreshList();
        }, err => {
            console.warn('FB snapshot hata:', err);
            fbConnected = false;
            setStatus('error');
            loadLoc();
        });
    } catch (e) {
        console.warn('FB bağlantı hata:', e);
        fbConnected = false;
        setStatus('error');
        loadLoc();
    }
}

async function saveFB(data) {
    try {
        const ref = await eventsCol.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        return ref.id;
    } catch (e) { console.warn(e); return null; }
}

async function delFB(id) {
    try { await eventsCol.doc(id).delete(); } catch(e) { console.warn(e); }
}

async function clearFB() {
    const snap = await eventsCol.get();
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
}
function saveLoc() {
    localStorage.setItem('aj_events', JSON.stringify(
        cal.getEvents().map(e => ({
            title: e.title, start: e.startStr, end: e.endStr,
            allDay: e.allDay, category: e.extendedProps.category,
            firebaseId: e.extendedProps.firebaseId || null
        }))
    ));
}

function loadLoc() {
    const saved = JSON.parse(localStorage.getItem('aj_events') || '[]');
    cal.getEvents().forEach(e => e.remove());
    saved.forEach(ev => cal.addEvent({
        title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay,
        className: 'cat-' + ev.category,
        extendedProps: { category: ev.category, firebaseId: ev.firebaseId, source: 'local' }
    }));
    refreshList();
}
// ETKİNLİK
async function addTodo() {
    const title = document.getElementById('todo-input').value.trim();
    const cat   = document.getElementById('event-category').value;
    const sDate = document.getElementById('start-date').value;
    const eDate = document.getElementById('end-date').value;
    const allDay = document.getElementById('all-day-checkbox').checked;

    if (!title) { alert('Başlık girin!'); return; }
    if (!sDate)  { alert('Tarih seçin!'); return; }

    let ev = { title, category: cat };

    if (allDay || sDate !== eDate) {
        // Tüm gün veya çok günlü → allDay
        ev.allDay = true;
        ev.start  = sDate;
        const ed  = parseDate(eDate || sDate);
        ed.setDate(ed.getDate() + 1); // FullCalendar end exclusive
        ev.end    = toStr(ed);
    } else {
        // Aynı gün saatli
        ev.allDay = false;
        ev.start  = sDate + 'T' + document.getElementById('start-time').value + ':00';
        ev.end    = eDate + 'T' + document.getElementById('end-time').value   + ':00';
    }

    if (fbConnected) {
        await saveFB(ev); // onSnapshot otomatik ekleyecek
    } else {
        cal.addEvent({
            ...ev, className: 'cat-' + cat,
            extendedProps: { category: cat, firebaseId: null, source: 'local' }
        });
        saveLoc();
        refreshList();
    }

    document.getElementById('todo-input').value = '';
}
// SOL LİSTE
function refreshList() {
    const ul = document.getElementById('todo-list');
    ul.innerHTML = '';

    cal.getEvents().filter(e => {
        const s = e.startStr.split('T')[0];
        let end;
        if (e.allDay && e.endStr) {
            const d = parseDate(e.endStr.split('T')[0]);
            d.setDate(d.getDate() - 1);
            end = toStr(d);
        } else {
            end = (e.endStr || e.startStr).split('T')[0];
        }
        return selDate >= s && selDate <= end;
    }).forEach(e => {
        const li = document.createElement('li');
        li.style.borderLeftColor = `var(--${e.extendedProps.category}-color)`;
        const fid = e.extendedProps.firebaseId;
        const time = e.allDay ? 'Tüm Gün'
            : e.start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
            + ' - '
            + e.end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

        li.innerHTML = `
            <div><small>${time}</small><br><b>${e.title}</b></div>
            <i class="fas fa-trash" style="color:red;cursor:pointer"
               onclick="removeEv('${fid || e.title}',${!!fid})"></i>`;
        ul.appendChild(li);
    });
}

function removeEv(id, isFid) {
    const ev = isFid
        ? cal.getEvents().find(e => e.extendedProps.firebaseId === id)
        : cal.getEvents().find(e => e.title === id);
    if (!ev) return;
    const fid = ev.extendedProps.firebaseId;
    ev.remove();
    saveLoc();
    if (fid) delFB(fid);
    refreshList();
}
// PANEL KONTROL
function setupPanels() {
    const sBtn  = document.getElementById('settings-toggle');
    const sPanel= document.getElementById('settings-panel');
    const aBtn  = document.getElementById('admin-toggle');
    const aModal= document.getElementById('admin-modal');
    const closeM= document.querySelector('.close-modal');

    sBtn.onclick  = e => { e.stopPropagation(); sPanel.classList.toggle('active'); };
    aBtn.onclick  = ()=> { aModal.style.display='block'; loadAdminTable(); };
    closeM.onclick= ()=> aModal.style.display='none';

    document.addEventListener('click', e => {
        if (!sPanel.contains(e.target) && e.target !== sBtn) sPanel.classList.remove('active');
        if (e.target === aModal) aModal.style.display = 'none';
    });
}

function toggleTimeInputs() {
    document.getElementById('time-inputs')
        .classList.toggle('disabled', document.getElementById('all-day-checkbox').checked);
}

function setTheme(t) {
    document.body.className = 'theme-' + t;
    localStorage.setItem('aj_theme', t);
    document.getElementById('settings-panel').classList.remove('active');
}

// ADMİN
const CAT = { event:'🎉 Etkinlik', urgent:'🔥 Önemli', holiday:'🏖️ Tatil', work:'💼 İş' };

function loadAdminTable() {
    const evs = cal.getEvents();
    document.getElementById('total-events-count').innerText = evs.length;
    document.getElementById('all-events-body').innerHTML = evs.map(e => {
        const fid = e.extendedProps.firebaseId;
        let endTxt = '';
        if (e.endStr) {
            if (e.allDay) {
                const d = parseDate(e.endStr.split('T')[0]);
                d.setDate(d.getDate() - 1);
                endTxt = ' → ' + toStr(d);
            } else {
                endTxt = ' → ' + e.endStr.split('T')[0];
            }
        }
        const src = e.extendedProps.source === 'firebase'
            ? '<span style="color:green">☁️ Firebase</span>'
            : '<span style="color:gray">💾 Yerel</span>';
        return `<tr>
            <td>${e.title}</td>
            <td>${e.startStr.split('T')[0]}${endTxt}</td>
            <td>${CAT[e.extendedProps.category] || e.extendedProps.category}</td>
            <td>${src}</td>
            <td><button onclick="removeEv('${fid||e.title}',${!!fid});loadAdminTable()">Sil</button></td>
        </tr>`;
    }).join('');
}

function exportData() {
    const data = cal.getEvents().map(e => ({
        title: e.title, start: e.startStr, end: e.endStr,
        allDay: e.allDay, category: e.extendedProps.category,
        firebaseId: e.extendedProps.firebaseId
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download = 'ajanda_yedek.json';
    a.click();
}

async function clearAllData() {
    if (!confirm('Tüm veriler silinsin mi?')) return;
    try {
        if (fbConnected) await clearFB();
        localStorage.clear();
        location.reload();
    } catch(e) { alert('Hata: ' + e.message); }
}

function setStatus(s) {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;
    const map = {
        connecting: { c:'orange', t:"Bağlanılıyor..." },
        connected:  { c:'green',  t:"☁️ Veri tabanına bağlı" },
        error:      { c:'red',    t:"⚠️ Veri tabanına bağlı değil" }
    };
    dot.style.background = map[s].c;
    text.innerText = map[s].t;
}