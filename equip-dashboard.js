// =====================================================================
// Sport Circle — แดชบอร์ดบริหารสนามและอุปกรณ์ฝั่งแอดมิน (6 แท็บ + ส่งออก PDF / DOCX)
// =====================================================================
(function () {
    'use strict';

    const ED = {
        tab: 1, facs: [], allFacs: [], eq: [], bookings: [], todayBookings: [],
        rentalsPeriod: [], rentalsOpen: [], incidentsPeriod: [], incidentsOpen: [],
        shift: null, lastShift: null, win: { rentals: [], incidents: [], bookings: [] },
        M: null, cash: null, folios: [], period: { start: '', end: '', label: '' },
        missing: false, loading: false, charts: {}, channel: null, lastLoad: 0
    };
    const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const INC_KIND = { damaged: 'ชำรุด', lost: 'สูญหาย', fee: 'ค่าปรับ' };
    const INC_ST = { damaged: ['รอส่งซ่อม', 'amber'], repairing: ['อยู่ระหว่างซ่อม', 'blue'], repaired: ['ซ่อมเสร็จ', 'green'], written_off: ['ตัดจำหน่าย', 'gray'], closed: ['ปิดรายการ', 'gray'] };

    function el(id) { return document.getElementById(id); }
    function v(id) { const n = el(id); return n ? n.value : ''; }
    function num(x) { return Number(x || 0); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function money(n) { return '฿' + num(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
    function pad(n) { return String(n).padStart(2, '0'); }
    function pad4(n) { return String(n).padStart(4, '0'); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function digits(s) { return String(s || '').replace(/[^0-9]/g, ''); }
    function parseAddons(a) { if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = []; } } return Array.isArray(a) ? a : []; }
    function maskPhone(p) { const d = digits(p); return d.length >= 9 ? (d.slice(0, 3) + '-' + d.slice(3, 6) + '-XXXX') : (p && p !== '-' ? p : '-'); }
    function fmtDT(iso) { if (!iso) return '-'; const d = new Date(iso); return d.getDate() + ' ' + MONTHS_S[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function fmtD(s) { if (!s) return '-'; const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s); return d.getDate() + ' ' + MONTHS_S[d.getMonth()] + ' ' + (d.getFullYear() + 543); }
    function hash4(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return pad4(h % 10000); }
    function facName(id) { const f = ED.allFacs.find(function (x) { return String(x.id) === String(id); }); return (f && f.name) || '-'; }
    function okBill(b) { const st = String(b.payment_status || '').toLowerCase(); return st === 'approved' || st === 'completed'; }
    function isoStart(s) { return new Date(s + 'T00:00:00').toISOString(); }
    function isoEnd(s) { return new Date(s + 'T23:59:59.999').toISOString(); }
    function searchText() { const n = el('dashSearchInput'); return ((n && n.value) || '').trim().toLowerCase(); }
    function inView() { return typeof currentView !== 'undefined' && currentView === 'dashboard'; }
    function thresholdOf(e) { return e.low_stock_threshold == null ? 3 : num(e.low_stock_threshold); }
    function setText(id, t) { const n = el(id); if (n) n.textContent = t; }
    function tabTitle(t, hint, btn) { return '<div class="ed-pane-head"><div><h3>' + t + '</h3>' + (hint ? '<p>' + hint + '</p>' : '') + '</div>' + (btn || '') + '</div>'; }
    function emptyRow(cols, msg) { return '<tr><td colspan="' + cols + '" class="ed-empty">' + (msg || 'ไม่พบข้อมูล') + '</td></tr>'; }
    function field(label, inner) { return '<label class="ed-f"><span>' + label + '</span>' + inner + '</label>'; }
    function facOptions(sel) { return ED.facs.map(function (f) { return '<option value="' + esc(f.id) + '"' + (String(f.id) === String(sel) ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join(''); }
    function matches(q) { if (!q) return true; for (let i = 1; i < arguments.length; i++) { if (String(arguments[i] || '').toLowerCase().indexOf(q) !== -1) return true; } return false; }

    function toast(msg, ok) {
        let t = el('edToast');
        if (!t) { t = document.createElement('div'); t.id = 'edToast'; document.body.appendChild(t); }
        t.textContent = msg; t.className = 'ed-toast show ' + (ok === false ? 'err' : 'ok');
        clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'ed-toast'; }, 3200);
    }
    function isMissingTable(err) {
        if (!err) return false;
        const m = String(err.message || '').toLowerCase();
        return err.code === '42P01' || err.code === 'PGRST205' || m.indexOf('does not exist') !== -1 || m.indexOf('schema cache') !== -1 || m.indexOf('could not find the table') !== -1;
    }

    function getPeriod() {
        const type = v('dashReportPeriodType') || 'monthly', now = new Date();
        const yearSel = v('dashReportYear') || String(now.getFullYear());
        const monthSel = v('dashReportMonth') || pad(now.getMonth() + 1);
        let start = '', end = '', label = '';
        if (type === 'daily') { start = end = v('dashRealtimeDate') || ymd(now); label = 'วันที่ ' + fmtD(start); }
        else if (type === 'monthly') { const last = new Date(Number(yearSel), Number(monthSel), 0).getDate(); start = yearSel + '-' + monthSel + '-01'; end = yearSel + '-' + monthSel + '-' + pad(last); label = MONTHS[Number(monthSel) - 1] + ' ' + (Number(yearSel) + 543); }
        else if (type === 'yearly') { start = yearSel + '-01-01'; end = yearSel + '-12-31'; label = 'ปี ' + (Number(yearSel) + 543); }
        else if (type === 'custom') { start = v('dashFilterStartDate'); end = v('dashFilterEndDate'); label = (start || end) ? ((start ? fmtD(start) : 'เริ่มต้น') + ' - ' + (end ? fmtD(end) : 'ปัจจุบัน')) : 'ทั้งหมด'; }
        else { label = 'ข้อมูลทั้งหมด'; }
        return { type: type, start: start, end: end, label: label };
    }

    async function loadAll() {
        try {
            if (typeof FACILITIES !== 'undefined' && (!FACILITIES || !FACILITIES.length) && typeof fetchFacilities === 'function') await fetchFacilities('all');
            ED.allFacs = typeof getMyManagedFacilities === 'function' ? getMyManagedFacilities() : [];
            const sel = el('dashFilterFacility');
            if (sel) {
                const cur = sel.value || 'all';
                sel.innerHTML = '<option value="all">รวมทุกสนามในการดูแล</option>' + ED.allFacs.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + (f.sport ? ' (' + esc(f.sport) + ')' : '') + '</option>'; }).join('');
                sel.value = ED.allFacs.some(function (f) { return String(f.id) === cur; }) ? cur : 'all';
            }
            const fid = sel ? sel.value : 'all';
            ED.facs = fid === 'all' ? ED.allFacs : ED.allFacs.filter(function (f) { return String(f.id) === String(fid); });
            const ids = ED.facs.map(function (f) { return String(f.id); });
            const p = ED.period = getPeriod();
            ED.missing = false;
            if (!ids.length) { ED.eq = []; ED.bookings = []; ED.todayBookings = []; ED.rentalsPeriod = []; ED.rentalsOpen = []; ED.incidentsPeriod = []; ED.incidentsOpen = []; ED.shift = ED.lastShift = null; ED.win = { rentals: [], incidents: [], bookings: [] }; return; }

            const sb = supabaseClient, today = ymd(new Date());
            let qEq = sb.from('equipment').select('*').in('facility_id', ids).order('created_at', { ascending: false });
            let qBk = sb.from('bookings').select('*').in('facility_id', ids).limit(5000);
            let qR = sb.from('equipment_rentals').select('*').in('facility_id', ids).order('rented_at', { ascending: false }).limit(3000);
            let qI = sb.from('equipment_incidents').select('*').in('facility_id', ids).order('created_at', { ascending: false }).limit(3000);
            if (p.start) { qBk = qBk.gte('date', p.start); qR = qR.gte('rented_at', isoStart(p.start)); qI = qI.gte('created_at', isoStart(p.start)); }
            if (p.end) { qBk = qBk.lte('date', p.end); qR = qR.lte('rented_at', isoEnd(p.end)); qI = qI.lte('created_at', isoEnd(p.end)); }
            const ownerKey = String((currentUser && currentUser.id) || '');
            const res = await Promise.all([
                qEq, qBk, sb.from('bookings').select('*').in('facility_id', ids).eq('date', today), qR,
                sb.from('equipment_rentals').select('*').in('facility_id', ids).eq('status', 'renting'),
                qI, sb.from('equipment_incidents').select('*').in('facility_id', ids).in('status', ['damaged', 'repairing']),
                sb.from('cash_shifts').select('*').eq('owner_key', ownerKey).order('opened_at', { ascending: false }).limit(5)
            ]);
            [res[3], res[4], res[5], res[6], res[7]].forEach(function (r) { if (r.error && isMissingTable(r.error)) ED.missing = true; });
            ED.eq = res[0].data || []; ED.bookings = res[1].data || []; ED.todayBookings = res[2].data || [];
            ED.rentalsPeriod = res[3].data || []; ED.rentalsOpen = res[4].data || [];
            ED.incidentsPeriod = res[5].data || []; ED.incidentsOpen = res[6].data || [];
            const shifts = res[7].data || [];
            ED.shift = shifts.find(function (s) { return s.status === 'open'; }) || null;
            ED.lastShift = shifts.find(function (s) { return s.status === 'closed'; }) || null;

            const ws = ED.shift ? new Date(ED.shift.opened_at).toISOString() : isoStart(today);
            ED.win = { rentals: [], incidents: [], bookings: [] };
            if (!ED.missing) {
                const wRes = await Promise.all([
                    sb.from('equipment_rentals').select('*').in('facility_id', ids).or('rented_at.gte.' + ws + ',returned_at.gte.' + ws),
                    sb.from('equipment_incidents').select('*').in('facility_id', ids).gte('created_at', ws)
                ]);
                ED.win.rentals = wRes[0].data || []; ED.win.incidents = wRes[1].data || [];
            }
            const wB = await sb.from('bookings').select('*').in('facility_id', ids).gte('created_at', ws);
            ED.win.bookings = wB.data || []; ED.winStart = ws; ED.lastLoad = Date.now();
        } catch (e) { console.error('[dash]', e); toast('โหลดข้อมูลไม่สำเร็จ: ' + (e.message || e), false); }
    }

    function compute() {
        const now = new Date(), hm = pad(now.getHours()) + ':' + pad(now.getMinutes()), todayYmd = ymd(now);
        const M = {
            bookingRent: 0, bookingSale: 0, counterRent: 0, counterSale: 0, fines: 0, repairCost: 0,
            items: {}, bills: [], bookingRentRows: [], activeBookingRent: {},
            facStats: [], sportRev: { football: 0, badminton: 0, basketball: 0, futsal: 0, volleyball: 0 },
            totalApprovedHours: 0, totalCancelCount: 0, totalBookingRev: 0
        };
        function addItem(name, type, qty, rev) { const k = name + '|' + type; const it = M.items[k] || (M.items[k] = { name: name, type: type, qty: 0, rev: 0 }); it.qty += qty; it.rev += rev; }

        const facStatMap = {};
        M.facStats = ED.facs.map(function (f) { const o = { id: String(f.id), name: f.name || '-', sport: f.sport || '-', approvedCount: 0, cancelCount: 0, revenue: 0 }; facStatMap[o.id] = o; return o; });
        ED.bookings.forEach(function (b) {
            const st = String(b.payment_status || '').toLowerCase(), price = num(b.total_price), fid = String(b.facility_id), fs = facStatMap[fid];
            if (st === 'rejected') { M.totalCancelCount++; if (fs) fs.cancelCount++; }
            else if (st === 'approved' || st === 'completed') {
                M.totalApprovedHours++; M.totalBookingRev += price;
                if (fs) { fs.approvedCount++; fs.revenue += price; }
                const fac = ED.allFacs.find(function (f) { return String(f.id) === fid; });
                const sp = String((fac && fac.sport) || '').toLowerCase();
                if (M.sportRev[sp] !== undefined) M.sportRev[sp] += price; else if (sp) M.sportRev[sp] = (M.sportRev[sp] || 0) + price;
            }
        });

        M.bills = (typeof groupBookingsIntoBills === 'function' ? groupBookingsIntoBills(ED.bookings) : []).filter(okBill);
        M.bills.forEach(function (b) {
            let sum = 0;
            parseAddons(b.addons).forEach(function (a) {
                const q = num(a.qty), rev = q * num(a.price); if (q <= 0) return; sum += rev;
                if (a.type === 'เช่า') M.bookingRent += rev; else M.bookingSale += rev;
                addItem(a.name || '-', a.type === 'เช่า' ? 'เช่า' : 'ซื้อ', q, rev);
            });
            b.addonSum = sum; b.court = Math.max(0, num(b.total_price) - sum);
        });
        ED.rentalsPeriod.forEach(function (r) { if (r.kind === 'rent') M.counterRent += num(r.amount); else M.counterSale += num(r.amount); addItem(r.equipment_name || '-', r.kind === 'rent' ? 'เช่า' : 'ซื้อ', num(r.qty), num(r.amount)); });
        ED.incidentsPeriod.forEach(function (i) { M.fines += num(i.fine_amount); M.repairCost += num(i.repair_cost); });
        M.rentRev = M.bookingRent + M.counterRent; M.saleRev = M.bookingSale + M.counterSale; M.netRev = M.rentRev + M.saleRev;

        const allRentBills = M.bills.slice();
        (typeof groupBookingsIntoBills === 'function' ? groupBookingsIntoBills(ED.todayBookings) : []).forEach(function (tb) {
            if (!allRentBills.some(function (x) { return x.groupId === tb.groupId; }) && okBill(tb)) allRentBills.push(tb);
        });
        allRentBills.forEach(function (b) {
            const addons = parseAddons(b.addons).filter(function (a) { return a.type === 'เช่า' && num(a.qty) > 0; }); if (!addons.length) return;
            const first = b.slots[0] ? b.slots[0].start : '', last = b.slots.length ? b.slots[b.slots.length - 1].end : '', isToday = b.date === todayYmd;
            const active = isToday && b.slots.some(function (s) { return s.start <= hm && hm < s.end; });
            const upcoming = isToday && !active && b.slots.some(function (s) { return s.start > hm; });
            const stLower = String(b.payment_status || '').toLowerCase();
            const state = active ? 'active' : (upcoming ? 'upcoming' : (!isToday ? (stLower === 'pending' ? 'pending' : 'period') : 'done'));
            addons.forEach(function (a) {
                M.bookingRentRows.push({ bill: b, a: a, range: (b.date !== todayYmd ? b.date + ' ' : '') + first + ' - ' + last, state: state });
                if (active) M.activeBookingRent[String(a.id)] = (M.activeBookingRent[String(a.id)] || 0) + num(a.qty);
            });
        });
        M.activeBookingQty = Object.values(M.activeBookingRent).reduce(function (s, x) { return s + x; }, 0);
        M.counterOpenQty = ED.rentalsOpen.reduce(function (s, r) { return s + num(r.qty); }, 0);
        M.overdue = ED.rentalsOpen.filter(function (r) { return r.due_at && new Date(r.due_at) < now; });
        M.depositHeld = ED.rentalsOpen.reduce(function (s, r) { return s + num(r.deposit); }, 0);
        M.rentedNow = M.counterOpenQty + M.activeBookingQty;
        M.brokenQty = ED.incidentsOpen.reduce(function (s, i) { return s + num(i.qty); }, 0);
        M.waitRepairQty = ED.incidentsOpen.filter(function (i) { return i.status === 'damaged'; }).reduce(function (s, i) { return s + num(i.qty); }, 0);
        M.stockSum = ED.eq.reduce(function (s, e) { return s + num(e.stock); }, 0);
        M.ready = ED.eq.reduce(function (s, e) { return s + Math.max(0, num(e.stock) - (e.type === 'เช่า' ? num(M.activeBookingRent[String(e.id)]) : 0)); }, 0);
        M.total = M.ready + M.rentedNow + M.brokenQty;
        M.low = ED.eq.filter(function (e) { return num(e.stock) <= thresholdOf(e); });
        M.topItems = Object.values(M.items).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
        ED.M = M; ED.cash = computeCash(); ED.folios = buildFolios();
    }

    function computeCash() {
        const ws = ED.winStart ? new Date(ED.winStart) : new Date(ymd(new Date()) + 'T00:00:00');
        let cash = 0, transfer = 0, cashRent = 0, cashWalkin = 0, cashFine = 0, refunds = 0;
        ED.win.rentals.forEach(function (r) {
            const m = r.payment_method === 'transfer' ? 'transfer' : 'cash';
            if (new Date(r.rented_at) >= ws) { const val = num(r.amount) + num(r.deposit); if (m === 'cash') { cash += val; cashRent += val; } else transfer += val; }
            if (r.returned_at && new Date(r.returned_at) >= ws) { const rf = num(r.deposit_refunded); if (m === 'cash') { cash -= rf; refunds += rf; } else transfer -= rf; }
        });
        ED.win.incidents.forEach(function (i) { const val = num(i.fine_collected); if (!val) return; if (i.fine_method === 'transfer') transfer += val; else { cash += val; cashFine += val; } });
        ED.win.bookings.forEach(function (b) {
            const st = String(b.payment_status || '').toLowerCase(); if (st === 'rejected') return;
            if (b.slip_url === 'walk-in') { cash += num(b.total_price); cashWalkin += num(b.total_price); }
            else if (st === 'approved' || st === 'completed') transfer += num(b.total_price);
        });
        const fl = ED.shift ? num(ED.shift.float_amount) : 0;
        return { float: fl, received: cash, expected: fl + cash, transfer: transfer, cashRent: cashRent, cashWalkin: cashWalkin, cashFine: cashFine, refunds: refunds, start: ws };
    }

    function buildFolios() {
        const M = ED.M, map = new Map();
        function keyOf(p, n, d) { return (digits(p) || String(n || '').trim() || '-') + '|' + d; }
        function get(k, n, p, d) { if (!map.has(k)) map.set(k, { key: k, name: n || '-', phone: p || '-', date: d, facs: new Set(), court: 0, equip: 0, fines: 0, held: 0, refunded: 0, items: [], slots: [] }); return map.get(k); }
        M.bills.forEach(function (b) {
            const f = get(keyOf(b.customer_phone, b.customer_name, b.date), b.customer_name, b.customer_phone, b.date);
            f.facs.add(facName(b.facility_id)); f.court += b.court; f.equip += b.addonSum;
            f.slots.push((b.slots[0] ? b.slots[0].start : '') + '-' + (b.slots.length ? b.slots[b.slots.length - 1].end : ''));
            parseAddons(b.addons).forEach(function (a) { if (num(a.qty) > 0) f.items.push({ name: a.name + ' (' + a.type + ') x' + num(a.qty), amount: num(a.qty) * num(a.price) }); });
        });
        const rentalKey = {};
        ED.rentalsPeriod.forEach(function (r) {
            const d = ymd(new Date(r.rented_at)), k = keyOf(r.customer_phone, r.customer_name, d); rentalKey[r.id] = k;
            const f = get(k, r.customer_name, r.customer_phone, d);
            f.facs.add(facName(r.facility_id)); f.equip += num(r.amount); f.refunded += num(r.deposit_refunded);
            if (r.status === 'renting') f.held += num(r.deposit);
            f.items.push({ name: (r.equipment_name || '-') + ' (' + (r.kind === 'rent' ? 'เช่า' : 'ซื้อ') + ') x' + num(r.qty), amount: num(r.amount) });
        });
        ED.incidentsPeriod.forEach(function (i) {
            if (!num(i.fine_amount)) return;
            const k = (i.rental_id && rentalKey[i.rental_id]) || keyOf(i.customer_phone, i.customer_name, ymd(new Date(i.created_at)));
            const f = get(k, i.customer_name, i.customer_phone, k.split('|').pop());
            f.facs.add(facName(i.facility_id)); f.fines += num(i.fine_amount);
            f.items.push({ name: ('ค่าปรับ: ' + (i.equipment_name || '')).trim(), amount: num(i.fine_amount) });
        });
        return Array.from(map.values()).map(function (f) {
            f.no = 'FOL-' + f.date.slice(2, 4) + f.date.slice(5, 7) + f.date.slice(8, 10) + '-' + hash4(f.key);
            f.net = f.court + f.equip + f.fines + f.held; return f;
        }).sort(function (a, b) { return b.date.localeCompare(a.date) || a.no.localeCompare(b.no); });
    }

    function renderClock() { const s = el('dashDateSubtitle'); if (!s) return; const d = new Date(); s.textContent = 'วันที่ ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543) + ' | เวลา ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' น.'; }
    function renderBanner() { const b = el('edBanner'); if (!b) return; b.style.display = ED.missing ? 'block' : 'none'; if (ED.missing) b.innerHTML = '⚠️ ยังไม่ได้รันไฟล์ <b>supabase_equipment.sql</b> ใน Supabase'; }
    function renderKPIs() {
        const M = ED.M; if (!M) return;
        setText('edK1Val', money(M.netRev)); setText('edK1a', 'ค่าเช่า: ' + money(M.rentRev)); setText('edK1b', 'ซื้อขาด: ' + money(M.saleRev));
        setText('edK2Val', M.rentedNow.toLocaleString() + ' ชิ้น');
        const od = el('edK2Badge'); if (od) { od.style.display = M.overdue.length ? 'inline-block' : 'none'; od.textContent = 'เกินกำหนด ' + M.overdue.length + ' รายการ'; }
        setText('edK2a', 'มัดจำสะสม: ' + money(M.depositHeld));
        setText('edK3Val', M.total.toLocaleString() + ' ชิ้น'); setText('edK3a', 'พร้อมใช้: ' + M.ready.toLocaleString() + ' ชิ้น'); setText('edK3b', 'สต็อกต่ำ: ' + M.low.length + ' รายการ');
        setText('edK4Val', M.brokenQty.toLocaleString() + ' ชิ้น'); setText('edK4a', 'ค่าปรับสะสม: ' + money(M.fines)); setText('edK4b', 'รอซ่อม: ' + M.waitRepairQty + ' ชิ้น');
    }

    function renderStock() {
        const q = searchText(), list = ED.eq.filter(function (e) { return matches(q, e.name, e.type, facName(e.facility_id)); });
        const multi = ED.facs.length > 1, maxStock = Math.max.apply(null, [1].concat(ED.eq.map(function (e) { return num(e.stock); })));
        const cards = list.map(function (e) {
            const th = thresholdOf(e), stock = num(e.stock), low = stock <= th, rent = e.type === 'เช่า', pct = Math.max(0, Math.min(100, Math.round(stock / maxStock * 100)));
            const rentedQty = ED.M && ED.M.activeBookingRent ? num(ED.M.activeBookingRent[String(e.id)]) : 0;
            return '<div class="ed-eq-card' + (low ? ' low' : '') + '">' + (low ? '<div class="ed-ribbon">สต็อกต่ำ (เหลือ &lt;= ' + th + ')</div>' : '') +
                '<button class="ed-eq-del" data-act="edit-eq" data-id="' + esc(e.id) + '">✎</button><span class="ed-tag ' + (rent ? 'rent' : 'sale') + '">' + (rent ? 'สำหรับเช่า' : 'ซื้อขาด') + '</span>' +
                '<div class="ed-eq-name" data-act="edit-eq" data-id="' + esc(e.id) + '">' + esc(e.name) + '</div>' +
                '<div class="ed-eq-price">' + money(e.price) + ' <small>/ ' + (rent ? 'รอบเช่า' : 'ชิ้น') + '</small>' + (rent && num(e.deposit) ? '<small class="ed-eq-dep">มัดจำ ' + money(e.deposit) + '</small>' : '') + (multi ? '<span class="ed-eq-fac">' + esc(facName(e.facility_id)) + '</span>' : '') + '</div>' +
                '<div class="ed-stockbar"><span class="' + (low ? 'low' : '') + '" style="width:' + pct + '%"></span></div>' +
                '<div class="ed-eq-foot"><span>คงเหลือ: <b class="' + (low ? 'warn' : '') + '">' + stock.toLocaleString() + ' ชิ้น</b>' + (rent && rentedQty ? ' <small class="ed-sub">(จอง ' + rentedQty + ')</small>' : '') + '</span>' +
                '<span class="ed-stepper"><button data-act="stock-dec" data-id="' + esc(e.id) + '">−</button><button data-act="stock-inc" data-id="' + esc(e.id) + '">+</button></span></div></div>';
        }).join('');
        const sv = list.reduce(function (s, e) { return s + num(e.stock) * num(e.price); }, 0), su = list.reduce(function (s, e) { return s + num(e.stock); }, 0);
        const sum = list.length ? '<div class="ed-stock-summary"><span>อุปกรณ์ทั้งหมด: <b>' + list.length + ' รายการ</b></span><span>สต็อกรวม: <b>' + su.toLocaleString() + ' ชิ้น</b></span><span>มูลค่าสต็อกรวม: <b class="green">' + money(sv) + '</b></span></div>' : '';
        el('edPane1').innerHTML = tabTitle('รายการสต็อกอุปกรณ์กีฬา และสินค้าขายหน้าร้าน', '', '<div class="ed-hint">กดปุ่ม + / − เพื่อปรับจำนวนสต็อกคงเหลือด่วน</div>') + sum + (list.length ? '<div class="ed-eq-grid">' + cards + '</div>' : '<div class="ed-empty-block">ยังไม่มีอุปกรณ์</div>');
    }

    function renderRentals() {
        const q = searchText(), now = new Date();
        const rows = ED.rentalsOpen.filter(function (r) { return matches(q, r.customer_name, r.customer_phone, r.equipment_name, facName(r.facility_id)); }).map(function (r) {
            const late = r.due_at && new Date(r.due_at) < now;
            return '<tr><td><b>' + esc(r.customer_name || '-') + '</b><div class="ed-sub">' + esc(maskPhone(r.customer_phone)) + '</div></td><td>' + esc(r.equipment_name || '-') + '<div class="ed-sub">' + esc(facName(r.facility_id)) + '</div></td><td class="num">' + num(r.qty) + '</td><td>' + fmtDT(r.rented_at) + '</td><td>' + fmtDT(r.due_at) + '</td><td><span class="ed-badge ' + (late ? 'red' : 'blue') + '">' + (late ? 'เกินกำหนด' : 'กำลังเช่า') + '</span></td><td class="num">' + money(r.deposit) + '</td><td><button class="ed-btn sm green" data-act="return" data-id="' + esc(r.id) + '">รับคืน</button></td></tr>';
        }).join('');
        const bk = ED.M.bookingRentRows.filter(function (x) { return matches(q, x.bill.customer_name, x.a.name, facName(x.bill.facility_id)); }).map(function (x) {
            const stMap = { active: ['กำลังใช้งาน', 'blue'], upcoming: ['รอใช้งาน', 'amber'], done: ['สิ้นสุดแล้ว', 'gray'], pending: ['รออนุมัติ', 'amber'], period: ['ในช่วงที่เลือก', 'green'] };
            const st = stMap[x.state] || [x.state, 'gray'];
            return '<tr><td><b>' + esc(x.bill.customer_name) + '</b><div class="ed-sub">' + esc(maskPhone(x.bill.customer_phone)) + '</div></td><td>' + esc(x.a.name) + '<div class="ed-sub">' + esc(facName(x.bill.facility_id)) + '</div></td><td class="num">' + num(x.a.qty) + '</td><td>' + esc(x.range) + ' น.</td><td><span class="ed-badge ' + st[1] + '">' + st[0] + '</span></td></tr>';
        }).join('');
        const hist = ED.rentalsPeriod.filter(function (r) { return r.status !== 'renting' && matches(q, r.customer_name, r.equipment_name); }).slice(0, 40).map(function (r) {
            return '<tr><td>' + fmtDT(r.rented_at) + '</td><td>' + esc(r.customer_name || '-') + '</td><td>' + esc(r.equipment_name || '-') + '</td><td class="num">' + num(r.qty) + '</td><td><span class="ed-badge ' + (r.kind === 'rent' ? 'green' : 'purple') + '">' + (r.kind === 'rent' ? 'คืนแล้ว' : 'ขายแล้ว') + '</span></td><td class="num">' + money(r.amount) + '</td><td>' + (r.payment_method === 'transfer' ? 'โอน' : 'เงินสด') + '</td></tr>';
        }).join('');
        el('edPane2').innerHTML = tabTitle('รายการกำลังเช่า & คืนของ', 'กด “รับคืน” เพื่อคืนสต็อกและมัดจำ', '<button class="ed-btn blue" data-act="new-rental">+ ทำรายการเช่า / ขายหน้าร้าน</button>') +
            '<div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>ลูกค้า</th><th>อุปกรณ์</th><th class="num">จำนวน</th><th>เวลาเช่า</th><th>กำหนดคืน</th><th>สถานะ</th><th class="num">มัดจำ</th><th></th></tr></thead><tbody>' + (rows || emptyRow(8, 'ไม่มีรายการที่กำลังเช่าอยู่')) + '</tbody></table></div>' +
            '<h4 class="ed-h4">เช่าพร้อมการจองสนาม</h4><div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>ลูกค้า</th><th>อุปกรณ์</th><th class="num">จำนวน</th><th>ช่วงเวลาจอง</th><th>สถานะ</th></tr></thead><tbody>' + (bk || emptyRow(5, 'ไม่มีรายการเช่าผ่านการจองสนาม')) + '</tbody></table></div>' +
            '<h4 class="ed-h4">ประวัติเช่า/ขายหน้าร้าน</h4><div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>เวลา</th><th>ลูกค้า</th><th>อุปกรณ์</th><th class="num">จำนวน</th><th>สถานะ</th><th class="num">ยอด</th><th>ชำระ</th></tr></thead><tbody>' + (hist || emptyRow(7, 'ยังไม่มีประวัติ')) + '</tbody></table></div>';
    }

    function renderIncidents() {
        const q = searchText(), map = new Map(), M = ED.M;
        ED.incidentsOpen.concat(ED.incidentsPeriod).forEach(function (i) { map.set(i.id, i); });
        const rows = Array.from(map.values()).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).filter(function (i) { return matches(q, i.equipment_name, i.customer_name, INC_KIND[i.kind], facName(i.facility_id)); }).map(function (i) {
            const st = INC_ST[i.status] || [i.status, 'gray'];
            let act = '';
            if (i.status === 'damaged') act = '<button class="ed-btn sm amber" data-act="inc-send" data-id="' + esc(i.id) + '">ส่งซ่อม</button> <button class="ed-btn sm ghost" data-act="inc-off" data-id="' + esc(i.id) + '">ตัดจำหน่าย</button>';
            else if (i.status === 'repairing') act = '<button class="ed-btn sm green" data-act="inc-done" data-id="' + esc(i.id) + '">ซ่อมเสร็จ</button> <button class="ed-btn sm ghost" data-act="inc-off" data-id="' + esc(i.id) + '">ตัดจำหน่าย</button>';
            return '<tr><td>' + fmtDT(i.created_at) + '</td><td>' + esc(i.equipment_name || '-') + '<div class="ed-sub">' + esc(facName(i.facility_id)) + '</div></td><td>' + esc(i.customer_name || '-') + '</td><td>' + (INC_KIND[i.kind] || i.kind) + '</td><td class="num">' + num(i.qty) + '</td><td><span class="ed-badge ' + st[1] + '">' + st[0] + '</span></td><td class="num">' + money(i.fine_amount) + '</td><td class="num">' + (num(i.repair_cost) ? money(i.repair_cost) : '-') + '</td><td>' + act + '</td></tr>';
        }).join('');
        el('edPane3').innerHTML = tabTitle('ชำรุด / ส่งซ่อม & ค่าปรับ', 'ติดตามสถานะการซ่อมและค่าปรับ', '<button class="ed-btn amber" data-act="new-incident">⚠ แจ้งชำรุด / สูญหาย</button>') +
            '<div class="ed-mini-grid"><div><span>รอส่งซ่อม</span><b>' + M.waitRepairQty + ' ชิ้น</b></div><div><span>ชำรุด/ซ่อมอยู่</span><b>' + M.brokenQty + ' ชิ้น</b></div><div><span>ค่าปรับสะสม</span><b>' + money(M.fines) + '</b></div><div><span>ค่าซ่อมสะสม</span><b>' + money(M.repairCost) + '</b></div></div>' +
            '<div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>วันที่</th><th>อุปกรณ์</th><th>ลูกค้า</th><th>ประเภท</th><th class="num">จำนวน</th><th>สถานะ</th><th class="num">ค่าปรับ</th><th class="num">ค่าซ่อม</th><th></th></tr></thead><tbody>' + (rows || emptyRow(9, 'ยังไม่มีรายการชำรุด / สูญหาย')) + '</tbody></table></div>';
    }

    function renderCash() {
        const C = ED.cash, sh = ED.shift, last = ED.lastShift;
        let panel = sh ? ('<h4>สถานะกะปัจจุบัน</h4><p class="ed-sub2">พนักงาน: ' + esc(sh.staff_name || '-') + ' (' + esc(sh.shift_label || 'กะ') + ')</p><div class="ed-line"><span>เงินสดตั้งต้น (Float):</span><b>' + money(C.float) + '</b></div><div class="ed-line"><span>รับเงินสดระหว่างกะ:</span><b>' + money(C.received) + '</b></div><div class="ed-line total"><span>รวมเงินสดต้องมีในกะ:</span><b>' + money(C.expected) + '</b></div><button class="ed-btn-wide" data-act="close-shift">เริ่มบันทึกตรวจนับเงินส่งมอบกะ</button>') :
            ('<h4>สถานะการตรวจนับเงินปิดกะล่าสุด</h4>' + (last ? '<p class="ed-sub2">พนักงาน: ' + esc(last.staff_name || '-') + '</p><div class="ed-line"><span>เงินสดที่ต้องมี:</span><b>' + money(last.expected_cash) + '</b></div><div class="ed-line"><span>นับได้จริง:</span><b>' + money(last.counted_cash) + '</b></div><div class="ed-line total"><span>ผลต่าง:</span><b>' + money(last.diff) + '</b></div>' : '<p class="ed-sub2">ยังไม่เคยปิดกะ</p>') + '<button class="ed-btn-wide" data-act="open-shift">เปิดกะใหม่</button>');
        el('edPane4').innerHTML = tabTitle('สรุปช่องทางชำระเงินปัจจุบัน', sh ? ('นับตั้งแต่เปิดกะ ' + fmtDT(sh.opened_at)) : 'แสดงยอดของวันนี้') +
            '<div class="ed-cash-grid"><div class="ed-cash-left"><div class="ed-pay green"><div class="ic">💵</div><div class="tx"><b>เงินสดในลิ้นชัก (Cash in Drawer)</b><span>คำนวณจากระบบ</span></div><div class="amt">' + money(C.expected) + '</div></div><div class="ed-pay blue"><div class="ic">▦</div><div class="tx"><b>เงินโอน (PromptPay / QR)</b><span>เข้าบัญชีธนาคาร</span></div><div class="amt">' + money(C.transfer) + '</div></div></div><div class="ed-cash-right">' + panel + '</div></div>';
    }

    function renderFolios() {
        const q = searchText(), list = ED.folios.filter(function (f) { return matches(q, f.name, f.phone, f.no, Array.from(f.facs).join(' ')); });
        const rows = list.map(function (f) {
            return '<tr><td><b class="pri">' + esc(f.no) + '</b></td><td><b>' + esc(f.name) + ' (' + esc(maskPhone(f.phone)) + ')</b></td><td>' + esc(Array.from(f.facs).join(', ')) + '</td><td class="num">' + money(f.court) + '</td><td class="num">' + money(f.equip + f.fines) + '</td><td class="num ' + (f.refunded ? 'green' : '') + '">−' + money(f.refunded) + '</td><td class="num"><b>' + money(f.net) + '</b></td><td><button class="ed-iconbtn" data-act="receipt" data-i="' + ED.folios.indexOf(f) + '">🖨</button></td></tr>';
        }).join('');
        el('edPane5').innerHTML = tabTitle('รายการบิลรวมลูกค้ารายบุคคล (Consolidated Folios)', 'รวมค่าจองสนาม + ค่าเช่า/ซื้ออุปกรณ์ + ค่าปรับ') +
            '<div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>เลขที่ Folio</th><th>ชื่อลูกค้า / โทรศัพท์</th><th>สนามที่ใช้บริการ</th><th class="num">ค่าสนาม</th><th class="num">ค่าเช่า/ซื้ออุปกรณ์</th><th class="num">มัดจำคืนแล้ว</th><th class="num">ยอดสุทธิชำระ</th><th>ใบเสร็จ</th></tr></thead><tbody>' + (rows || emptyRow(8, 'ไม่พบบิลในช่วงเวลาที่เลือก')) + '</tbody></table></div>';
    }

    function renderStats() {
        const M = ED.M, q = searchText(), top = M.topItems, max = top.length ? top[0].qty : 1;
        const bars = top.map(function (t) { return '<div class="ed-bar"><div class="r"><span>' + esc(t.name) + '</span><b>' + t.qty.toLocaleString() + ' ' + (t.type === 'เช่า' ? 'ครั้ง' : 'ชิ้น') + '</b></div><div class="trk"><div class="fil" style="width:' + Math.max(4, Math.round(t.qty / max * 100)) + '%"></div></div></div>'; }).join('');
        const facRows = (M.facStats || []).filter(function (x) { return matches(q, x.name, x.sport); }).map(function (x) {
            return '<tr><td><strong>' + esc(x.name) + '</strong></td><td class="num"><span style="color:#16a34a;font-weight:700;">' + x.approvedCount.toLocaleString() + ' ชม.</span></td><td class="num"><span style="color:#dc2626;font-weight:600;">' + x.cancelCount.toLocaleString() + ' ครั้ง</span></td><td class="num"><strong style="color:var(--primary);">' + money(x.revenue) + '</strong></td></tr>';
        }).join('');
        const facTotal = (M.facStats && M.facStats.length) ? ('<tr style="background:#f0f9ff;border-top:2px solid #bae6fd;"><td><strong>รวมทั้งหมด (' + M.facStats.length + ' สนาม)</strong></td><td class="num"><strong style="color:#16a34a;">' + M.totalApprovedHours.toLocaleString() + ' ชม.</strong></td><td class="num"><strong style="color:#dc2626;">' + M.totalCancelCount.toLocaleString() + ' ครั้ง</strong></td><td class="num"><strong style="color:var(--primary);">' + money(M.totalBookingRev) + '</strong></td></tr>') : '';

        el('edPane6').innerHTML = '<div class="ed-stats-grid">' +
            '<div class="ed-stat-card"><h4>สัดส่วนรายได้แยกตามหมวดหมู่สินค้า</h4><div class="ed-chart"><canvas id="edPieRevenue"></canvas></div></div>' +
            '<div class="ed-stat-card"><h4>สัดส่วนสถานะอุปกรณ์ทั้งหมด</h4><div class="ed-chart"><canvas id="edDonutStatus"></canvas></div></div>' +
            '<div class="ed-stat-card"><h4>5 อันดับอุปกรณ์ที่ถูกเช่าและซื้อบ่อยที่สุด</h4>' + (bars || '<div class="ed-empty-block">ยังไม่มีข้อมูลการเช่า/ขาย</div>') + '</div></div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:18px;">' +
            '<div class="ed-stat-card" style="min-height:auto;"><h4>📑 ตารางสรุปรายงานแยกตามสนามกีฬา</h4><div class="ed-tablewrap"><table class="ed-table"><thead><tr><th>ชื่อสนาม</th><th class="num">จองสำเร็จ</th><th class="num">ยกเลิก</th><th class="num">รายได้สุทธิ</th></tr></thead><tbody>' + (facRows ? (facRows + facTotal) : emptyRow(4, 'ไม่พบข้อมูลสำหรับช่วงเวลานี้')) + '</tbody></table></div></div>' +
            '<div class="ed-stat-card" style="min-height:auto;"><h4>📊 กราฟรายได้แยกตามประเภทกีฬา</h4><div class="ed-chart" style="height:260px;"><canvas id="edBarSportRevenue"></canvas></div></div></div>';

        if (typeof Chart === 'undefined') return;
        Object.values(ED.charts).forEach(function (c) { try { c.destroy(); } catch (e) {} }); ED.charts = {};
        const opt = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 34, boxHeight: 10, font: { family: 'Prompt, sans-serif', size: 11 } } } } };
        ED.charts.pie = new Chart(el('edPieRevenue'), { type: 'pie', data: { labels: ['ค่าเช่าอุปกรณ์', 'สินค้าขายขาด', 'ค่าปรับ/อื่นๆ'], datasets: [{ data: [M.rentRev, M.saleRev, M.fines], backgroundColor: ['#0284c7', '#10b981', '#f59e0b'], borderWidth: 1 }] }, options: opt });
        ED.charts.donut = new Chart(el('edDonutStatus'), { type: 'doughnut', data: { labels: ['พร้อมใช้งาน', 'กำลังถูกเช่า', 'ชำรุด/ส่งซ่อม'], datasets: [{ data: [M.ready, M.rentedNow, M.brokenQty], backgroundColor: ['#10b981', '#0284c7', '#ef4444'], borderWidth: 1 }] }, options: Object.assign({}, opt, { cutout: '55%' }) });
        const sLabels = ['Football', 'Badminton', 'Basketball', 'Futsal', 'Volleyball'];
        const sData = sLabels.map(function (l) { return num(M.sportRev[l.toLowerCase()]); });
        if (el('edBarSportRevenue')) {
            ED.charts.sportBar = new Chart(el('edBarSportRevenue'), {
                type: 'bar',
                data: { labels: sLabels, datasets: [{ label: 'รายได้ (฿)', data: sData, backgroundColor: ['#16a34a', '#2563eb', '#f59e0b', '#ec4899', '#8b5cf6'], borderRadius: 8 }] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { grid: { display: false } } } }
            });
        }
    }

    const RENDER = { 1: renderStock, 2: renderRentals, 3: renderIncidents, 4: renderCash, 5: renderFolios, 6: renderStats };
    function renderTab(n) { try { if (ED.M && el('edPane' + n)) RENDER[n](); } catch (e) { console.error(e); } }
    async function refresh() {
        if (ED.loading) { ED.again = true; return; }
        ED.loading = true;
        try { await loadAll(); compute(); renderBanner(); renderKPIs(); renderTab(ED.tab); if (window.lucide) try { lucide.createIcons(); } catch (e) {} }
        finally { ED.loading = false; }
        if (ED.again) { ED.again = false; await refresh(); }
    }

    window.switchDashTab = function (n) {
        ED.tab = Number(n) || 1;
        document.querySelectorAll('.ed-tab-btn').forEach(function (b) { b.style.display = ''; b.classList.toggle('active', Number(b.dataset.tab) === ED.tab); });
        document.querySelectorAll('.ed-pane').forEach(function (p) { p.classList.toggle('active', p.id === 'edPane' + ED.tab); });
        renderTab(ED.tab);
    };
    window.edRender = function () { renderTab(ED.tab); };

    function modal(title, html, buttons) {
        let ov = el('edModal');
        if (!ov) { ov = document.createElement('div'); ov.id = 'edModal'; ov.className = 'modal-overlay'; document.body.appendChild(ov); ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.classList.remove('active'); }); }
        ov.innerHTML = '<div class="modal ed-modal"><h3>' + esc(title) + '</h3><div class="ed-modal-body">' + html + '</div><div class="ed-modal-foot"></div></div>';
        const foot = ov.querySelector('.ed-modal-foot');
        (buttons || []).forEach(function (b) {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ed-btn ' + (b.cls || 'ghost'); btn.textContent = b.label;
            btn.addEventListener('click', async function () { if (b.close) { ov.classList.remove('active'); return; } btn.disabled = true; try { await b.fn(); } finally { btn.disabled = false; } });
            foot.appendChild(btn);
        });
        ov.classList.add('active');
    }
    function closeEd() { const ov = el('edModal'); if (ov) ov.classList.remove('active'); }

    async function adjustStock(id, delta) {
        const e = ED.eq.find(function (x) { return String(x.id) === String(id); }); if (!e) return;
        const ns = Math.max(0, num(e.stock) + delta); e.stock = ns; renderStock();
        await supabaseClient.from('equipment').update({ stock: ns }).eq('id', id); compute(); renderKPIs();
    }
    async function shiftStock(eqId, delta) {
        const res = await supabaseClient.from('equipment').select('stock').eq('id', eqId).single();
        if (res.error || !res.data) return { error: res.error || new Error('ไม่พบอุปกรณ์') };
        const ns = num(res.data.stock) + delta; if (ns < 0) return { error: new Error('สต็อกไม่พอ') };
        const up = await supabaseClient.from('equipment').update({ stock: ns }).eq('id', eqId); return { error: up.error, stock: ns };
    }

    function equipmentModal(id) {
        const e = id ? ED.eq.find(function (x) { return String(x.id) === String(id); }) : null;
        modal(e ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์ใหม่',
            field('สนาม', '<select id="edf_fac">' + facOptions(e ? e.facility_id : (ED.facs[0] || {}).id) + '</select>') +
            field('ชื่ออุปกรณ์', '<input id="edf_name" type="text" value="' + esc(e ? e.name : '') + '">') +
            '<div class="ed-row2">' + field('ประเภท', '<select id="edf_type"><option value="เช่า"' + (e && e.type === 'เช่า' ? ' selected' : '') + '>สำหรับเช่า</option><option value="ซื้อ"' + (e && e.type === 'ซื้อ' ? ' selected' : '') + '>ซื้อขาด</option></select>') + field('ราคา (บาท)', '<input id="edf_price" type="number" min="0" value="' + (e ? num(e.price) : '') + '">') + '</div>' +
            '<div class="ed-row3">' + field('สต็อก', '<input id="edf_stock" type="number" min="0" value="' + (e ? num(e.stock) : 0) + '">') + field('มัดจำ', '<input id="edf_dep" type="number" min="0" value="' + (e ? num(e.deposit) : 0) + '">') + field('เตือนเมื่อ ≤', '<input id="edf_th" type="number" min="0" value="' + (e ? thresholdOf(e) : 3) + '">') + '</div>',
            [{ label: 'บันทึก', cls: 'blue', fn: async function () {
                const name = v('edf_name').trim(); if (!name) return toast('กรุณากรอกชื่ออุปกรณ์', false);
                const row = { facility_id: v('edf_fac'), name: name, type: v('edf_type'), price: num(v('edf_price')), stock: Math.max(0, Math.floor(num(v('edf_stock')))) };
                if (e) await supabaseClient.from('equipment').update(row).eq('id', e.id);
                else await supabaseClient.from('equipment').insert([Object.assign({ owner_id: (currentUser && currentUser.id) || null }, row)]);
                closeEd(); toast('บันทึกเรียบร้อย'); await refresh();
            } }].concat(e ? [{ label: 'ลบ', cls: 'red', fn: async function () { if (!confirm('ยืนยันลบอุปกรณ์นี้?')) return; await supabaseClient.from('equipment').delete().eq('id', e.id); closeEd(); await refresh(); } }] : []).concat([{ label: 'ยกเลิก', close: true }]));
    }

    function rentalModal() {
        if (!ED.facs.length) return toast('ยังไม่มีสนาม', false);
        modal('ทำรายการเช่า / ขายหน้าร้าน',
            field('สนาม', '<select id="edr_fac">' + facOptions(ED.facs[0].id) + '</select>') + field('อุปกรณ์', '<select id="edr_eq"></select>') +
            '<div class="ed-row2">' + field('จำนวน', '<input id="edr_qty" type="number" min="1" value="1">') + field('ชำระด้วย', '<select id="edr_pay"><option value="cash">เงินสด</option><option value="transfer">โอน / QR</option></select>') + '</div>' +
            '<div class="ed-row2">' + field('ชื่อลูกค้า', '<input id="edr_name" type="text">') + field('เบอร์โทร', '<input id="edr_phone" type="tel">') + '</div>' +
            '<div class="ed-row2" id="edr_rentbox">' + field('เงินมัดจำ', '<input id="edr_dep" type="number" min="0" value="0">') + field('คืนใน (ชม.)', '<input id="edr_hours" type="number" min="1" value="2">') + '</div>',
            [{ label: 'บันทึก', cls: 'blue', fn: async function () {
                const e = ED.eq.find(function (x) { return String(x.id) === v('edr_eq'); }), qty = Math.floor(num(v('edr_qty'))), name = v('edr_name').trim();
                if (!e || qty < 1 || !name) return toast('กรอกข้อมูลให้ครบ', false);
                const rent = e.type === 'เช่า', now = new Date();
                const ins = await supabaseClient.from('equipment_rentals').insert([{ facility_id: String(e.facility_id), equipment_id: String(e.id), equipment_name: e.name, equipment_type: e.type, kind: rent ? 'rent' : 'sale', customer_name: name, customer_phone: v('edr_phone').trim() || null, qty: qty, unit_price: num(e.price), amount: num(e.price) * qty, deposit: rent ? num(v('edr_dep')) : 0, deposit_refunded: 0, payment_method: v('edr_pay'), rented_at: now.toISOString(), due_at: rent ? new Date(now.getTime() + num(v('edr_hours')) * 3600000).toISOString() : null, status: rent ? 'renting' : 'sold', staff_id: (currentUser && currentUser.id) || null }]).select().single();
                if (ins.error) return toast(ins.error.message, false);
                await shiftStock(e.id, -qty); closeEd(); toast('บันทึกแล้ว'); await refresh();
            } }, { label: 'ยกเลิก', close: true }]);
        const fill = function () { const list = ED.eq.filter(function (e) { return String(e.facility_id) === v('edr_fac'); }); el('edr_eq').innerHTML = list.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + ' (' + money(e.price) + ')</option>'; }).join(''); };
        el('edr_fac').addEventListener('change', fill); fill();
    }

    function returnModal(id) {
        const r = ED.rentalsOpen.find(function (x) { return String(x.id) === String(id); }); if (!r) return;
        modal('รับคืนอุปกรณ์', '<div class="ed-info"><b>' + esc(r.equipment_name) + '</b> × ' + num(r.qty) + '</div>' + field('ค่าปรับ (บาท)', '<input id="edt_fine" type="number" min="0" value="0">'),
            [{ label: 'ยืนยันรับคืน', cls: 'green', fn: async function () {
                const fine = num(v('edt_fine')), refund = Math.max(0, num(r.deposit) - fine);
                await supabaseClient.from('equipment_rentals').update({ status: 'returned', returned_at: new Date().toISOString(), deposit_refunded: refund }).eq('id', r.id);
                await shiftStock(r.equipment_id, num(r.qty)); closeEd(); toast('รับคืนเรียบร้อย'); await refresh();
            } }, { label: 'ยกเลิก', close: true }]);
    }

    function incidentModal() {
        if (!ED.eq.length) return toast('ยังไม่มีอุปกรณ์', false);
        modal('แจ้งชำรุด / สูญหาย',
            field('อุปกรณ์', '<select id="edi_eq">' + ED.eq.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + ' (' + esc(facName(e.facility_id)) + ')</option>'; }).join('') + '</select>') +
            '<div class="ed-row2">' + field('ประเภท', '<select id="edi_kind"><option value="damaged">ชำรุด</option><option value="lost">สูญหาย</option></select>') + field('จำนวน', '<input id="edi_qty" type="number" min="1" value="1">') + '</div>' +
            '<div class="ed-row2">' + field('ชื่อลูกค้า', '<input id="edi_name" type="text">') + field('ค่าปรับ (บาท)', '<input id="edi_fine" type="number" min="0" value="0">') + '</div>',
            [{ label: 'บันทึก', cls: 'amber', fn: async function () {
                const e = ED.eq.find(function (x) { return String(x.id) === v('edi_eq'); }), qty = Math.floor(num(v('edi_qty'))), kind = v('edi_kind'), fine = num(v('edi_fine'));
                if (!e || qty < 1) return;
                await supabaseClient.from('equipment_incidents').insert([{ facility_id: String(e.facility_id), equipment_id: String(e.id), equipment_name: e.name, customer_name: v('edi_name').trim() || null, kind: kind, qty: qty, fine_amount: fine, fine_collected: fine, fine_method: 'cash', status: kind === 'lost' ? 'written_off' : 'damaged' }]);
                await shiftStock(e.id, -qty); closeEd(); toast('บันทึกแล้ว'); await refresh();
            } }, { label: 'ยกเลิก', close: true }]);
    }

    async function incidentAction(act, id) {
        const i = ED.incidentsOpen.concat(ED.incidentsPeriod).find(function (x) { return String(x.id) === String(id); }); if (!i) return;
        if (act === 'inc-send') await supabaseClient.from('equipment_incidents').update({ status: 'repairing' }).eq('id', id);
        else if (act === 'inc-off') await supabaseClient.from('equipment_incidents').update({ status: 'written_off', resolved_at: new Date().toISOString() }).eq('id', id);
        else if (act === 'inc-done') { await supabaseClient.from('equipment_incidents').update({ status: 'repaired', resolved_at: new Date().toISOString() }).eq('id', id); await shiftStock(i.equipment_id, num(i.qty)); }
        await refresh();
    }

    function openShiftModal() {
        const nm = (currentUser && currentUser.profile && currentUser.profile.name) || '';
        modal('เปิดกะใหม่', field('ชื่อพนักงาน', '<input id="eds_name" type="text" value="' + esc(nm) + '">') + field('เงินสดตั้งต้น (Float)', '<input id="eds_float" type="number" min="0" value="2000">'),
            [{ label: 'เปิดกะ', cls: 'green', fn: async function () {
                await supabaseClient.from('cash_shifts').insert([{ owner_key: String(currentUser.id), staff_id: currentUser.id, staff_name: v('eds_name').trim() || 'Admin', shift_label: 'กะปกติ', float_amount: num(v('eds_float')), status: 'open' }]);
                closeEd(); await refresh();
            } }, { label: 'ยกเลิก', close: true }]);
    }

    function closeShiftModal() {
        if (!ED.shift) return openShiftModal();
        const C = ED.cash;
        modal('ปิดกะ & นับเงินสด', '<div class="ed-info">เงินสดที่ระบบคำนวณ: <b>' + money(C.expected) + '</b></div>' + field('นับได้จริง (บาท)', '<input id="edc_count" type="number" min="0" value="' + C.expected + '">'),
            [{ label: 'ปิดกะ', cls: 'green', fn: async function () {
                const cnt = num(v('edc_count'));
                await supabaseClient.from('cash_shifts').update({ closed_at: new Date().toISOString(), expected_cash: C.expected, counted_cash: cnt, diff: cnt - C.expected, transfer_total: C.transfer, status: 'closed' }).eq('id', ED.shift.id);
                closeEd(); await refresh();
            } }, { label: 'ยกเลิก', close: true }]);
    }

    function printReceipt(idx) {
        const f = ED.folios[idx]; if (!f) return;
        const rows = ['<tr><td>ค่าจองสนาม ' + esc(Array.from(f.facs).join(', ')) + '</td><td style="text-align:right">' + money(f.court) + '</td></tr>'].concat(f.items.map(function (it) { return '<tr><td>' + esc(it.name) + '</td><td style="text-align:right">' + money(it.amount) + '</td></tr>'; }));
        const w = window.open('', '_blank'); if (!w) return toast('กรุณาอนุญาต Pop-up', false);
        w.document.write('<html><head><meta charset="utf-8"><title>' + esc(f.no) + '</title></head><body style="font-family:Tahoma;padding:24px"><h2>Sport Circle — ใบเสร็จรับเงิน</h2><div>เลขที่: <b>' + esc(f.no) + '</b> | วันที่: ' + fmtD(f.date) + '</div><div>ลูกค้า: ' + esc(f.name) + ' (' + esc(f.phone) + ')</div><table style="width:100%;margin-top:14px;border-collapse:collapse" border="1" cellpadding="6">' + rows.join('') + '<tr><td><b>ยอดสุทธิ</b></td><td style="text-align:right"><b>' + money(f.net) + '</b></td></tr></table><script>window.onload=function(){window.print()}<\/script></body></html>');
        w.document.close();
    }

    function buildReport() {
        const M = ED.M, C = ED.cash, p = ED.period, now = new Date(), facs = ED.facs.map(function (f) { return f.name; }).join(', ') || '-';
        const facRows = (M.facStats || []).map(function (x) { return [x.name, x.approvedCount.toLocaleString() + ' ชม.', x.cancelCount.toLocaleString() + ' ครั้ง', money(x.revenue)]; });
        if (facRows.length) facRows.push(['รวมทั้งหมด (' + facRows.length + ' สนาม)', M.totalApprovedHours.toLocaleString() + ' ชม.', M.totalCancelCount.toLocaleString() + ' ครั้ง', money(M.totalBookingRev)]);
        return {
            title: 'รายงานสรุปการจองสนามและอุปกรณ์กีฬา — Sport Circle',
            meta: ['ช่วงเวลา: ' + p.label, { label: 'สนาม: ', list: ED.facs.map(function (f) { return f.name; }) }, 'ออกรายงานเมื่อ: ' + fmtDT(now.toISOString())],
            sections: [
                { title: '1. ตารางสรุปรายงานการจองแยกตามสนามกีฬา', cols: ['ชื่อสนามกีฬา', 'จองสำเร็จ', 'ยกเลิก', 'รายได้สุทธิ'], rows: facRows },
                { title: '2. สรุปภาพรวมอุปกรณ์กีฬา', cols: ['รายการ', 'มูลค่า'], rows: [['รายได้อุปกรณ์สุทธิ', money(M.netRev)], ['ค่าเช่าอุปกรณ์', money(M.rentRev)], ['ขายขาด', money(M.saleRev)], ['ค่าปรับสะสม', money(M.fines)], ['กำลังถูกเช่า', M.rentedNow + ' ชิ้น'], ['สต็อกพร้อมใช้', M.ready + ' ชิ้น']] },
                { title: '3. สต็อกอุปกรณ์ & สินค้าขาย', cols: ['สนาม', 'อุปกรณ์', 'ประเภท', 'ราคา', 'คงเหลือ'], rows: ED.eq.map(function (e) { return [facName(e.facility_id), e.name, e.type, money(e.price), String(num(e.stock))]; }) },
                { title: '4. สรุปเงินสดและเงินโอน', cols: ['รายการ', 'จำนวนเงิน'], rows: [['เงินสดในลิ้นชัก', money(C.expected)], ['เงินโอน (QR)', money(C.transfer)]] },
                { title: '5. บิลรวมลูกค้า (Folios)', cols: ['เลขที่ Folio', 'ลูกค้า', 'สนาม', 'ค่าสนาม', 'อุปกรณ์/ค่าปรับ', 'สุทธิ'], rows: ED.folios.map(function (f) { return [f.no, f.name, Array.from(f.facs).join(', '), money(f.court), money(f.equip + f.fines), money(f.net)]; }) }
            ]
        };
    }

    function reportHtml(R) {
        // ความกว้างคอลัมน์ (%) ของแต่ละตาราง กันตัวหนังสือถูกตัด/ทับกัน
        const W = { '1': [46, 16, 16, 22], '2': [60, 40], '3': [26, 34, 12, 14, 14], '4': [60, 40], '5': [19, 15, 28, 12, 15, 11] };
        const base = 'font-family:Prompt,Tahoma,sans-serif;line-height:1.7;';
        const th = 'padding:6px 6px;vertical-align:middle;text-align:center;font-weight:700;line-height:1.7;word-break:break-word;border:1px solid #94a3b8;';
        const tdBase = 'padding:6px 6px;vertical-align:middle;line-height:1.7;word-break:break-word;border:1px solid #94a3b8;';
        return '<div style="' + base + 'color:#0f172a;font-size:11px;width:718px;box-sizing:border-box;padding:0;background:#fff">' +
            '<h1 style="' + base + 'font-size:20px;margin:0 0 8px;line-height:1.5">' + esc(R.title) + '</h1>' +
            R.meta.map(function (m) {
                if (m && typeof m === 'object') {
                    // ชื่อสนามแต่ละชื่อเป็นบล็อกแยก ขึ้นบรรทัดใหม่ระหว่างชื่อสนาม (กันตัวหนังสือไทยทับกันตอนตัดบรรทัดกลางข้อความ)
                    const items = (m.list && m.list.length) ? m.list : ['-'];
                    return '<div style="' + base + 'margin:0 0 3px"><span style="display:inline-block;margin-right:4px">' + esc(m.label) + '</span>' +
                        items.map(function (n, i) { return '<span style="display:inline-block;margin-right:5px;white-space:nowrap">' + esc(n) + (i < items.length - 1 ? ',' : '') + '</span>'; }).join('') + '</div>';
                }
                return '<div style="' + base + 'margin:0 0 3px;word-break:break-word">' + esc(m) + '</div>';
            }).join('') +
            R.sections.map(function (s) {
                const w = W[String(s.title).charAt(0)] || [];
                const colgroup = w.length === s.cols.length ? '<colgroup>' + w.map(function (x) { return '<col style="width:' + x + '%">'; }).join('') + '</colgroup>' : '';
                const tbl = s.rows.length
                    ? ('<table style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:8px" cellspacing="0">' + colgroup +
                        '<thead style="background:#e0f2fe"><tr>' + s.cols.map(function (c) { return '<th style="' + th + '">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
                        s.rows.map(function (r) {
                            return '<tr style="page-break-inside:avoid">' + r.map(function (c, i) {
                                const txt = String(c == null ? '' : c);
                                const isNum = /^฿/.test(txt);
                                const nowrap = (s.title.charAt(0) === '5' && i === 0) ? 'white-space:nowrap;' : '';
                                const inner = (!isNum && txt.indexOf(', ') > -1)
                                    ? txt.split(', ').map(function (p) { return '<div style="line-height:1.7">' + esc(p) + '</div>'; }).join('')
                                    : esc(txt);
                                return '<td style="' + tdBase + nowrap + (isNum ? 'text-align:right;' : 'text-align:left;') + '">' + inner + '</td>';
                            }).join('') + '</tr>';
                        }).join('') + '</tbody></table>')
                    : '<div style="' + base + 'margin-top:6px;color:#64748b">— ไม่มีข้อมูล —</div>';
                return '<h2 style="' + base + 'margin:20px 0 4px;color:#075985;font-size:13px;line-height:1.6;page-break-after:avoid">' + esc(s.title) + '</h2>' + tbl;
            }).join('') + '</div>';
    }

    async function exportPDF() {
        if (!ED.M) await refresh(); const R = buildReport(), html = reportHtml(R);
        toast('กำลังสร้างไฟล์ PDF...');
        try {
            if (typeof html2pdf === 'undefined') throw new Error('no lib');
            // รอให้ฟอนต์ไทยโหลดครบก่อนวาดลง canvas (ไม่งั้นสระ/วรรณยุกต์ซ้อนและตัวหนังสือเพี้ยน)
            try {
                if (document.fonts && document.fonts.load) {
                    await Promise.all([document.fonts.load('400 11px Prompt', 'ก็ไทย'), document.fonts.load('700 11px Prompt', 'ก็ไทย')]);
                    await document.fonts.ready;
                }
            } catch (_) { }
            await html2pdf().set({
                margin: [10, 10, 10, 10],
                filename: 'SportCircle_Report.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: false, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h2'] }
            }).from(html, 'string').save();
            toast('ดาวน์โหลด PDF เรียบร้อย');
        } catch (e) {
            const w = window.open('', '_blank'); if (!w) return;
            w.document.write('<html><head><meta charset="utf-8"><title>Report</title></head><body>' + html + '<script>window.onload=function(){window.print()}<\/script></body></html>'); w.document.close();
        }
    }

    async function exportDOCX() {
        if (!ED.M) await refresh(); const R = buildReport();
        const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>' + reportHtml(R) + '</body></html>';
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff', html], { type: 'application/msword' })); a.download = 'SportCircle_Report.doc'; document.body.appendChild(a); a.click(); a.remove();
        toast('ดาวน์โหลดไฟล์ Word เรียบร้อย');
    }
    window.edExportPDF = exportPDF; window.edExportDOCX = exportDOCX;

    function bindEvents() {
        const root = el('view-dashboard'); if (!root || root._edBound) return; root._edBound = true;
        root.addEventListener('click', async function (ev) {
            const t = ev.target.closest('[data-act]'); if (!t) return;
            const act = t.dataset.act, id = t.dataset.id;
            if (act === 'stock-inc') return adjustStock(id, 1);
            if (act === 'stock-dec') return adjustStock(id, -1);
            if (act === 'edit-eq') return equipmentModal(id);
            if (act === 'new-eq') return equipmentModal(null);
            if (act === 'new-rental') return rentalModal();
            if (act === 'return') return returnModal(id);
            if (act === 'new-incident') return incidentModal();
            if (act.indexOf('inc-') === 0) return incidentAction(act, id);
            if (act === 'open-shift') return openShiftModal();
            if (act === 'close-shift') return closeShiftModal();
            if (act === 'receipt') return printReceipt(Number(t.dataset.i));
            if (act === 'goto-tab') return window.switchDashTab(t.dataset.tab);
            if (act === 'pdf') return exportPDF();
            if (act === 'docx') return exportDOCX();
            if (act === 'refresh') return refresh();
        });
    }

    function fillFilters() {
        const now = new Date(), ys = el('dashReportYear'), ms = el('dashReportMonth');
        if (ys && !ys.options.length) { for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) ys.add(new Option(y + ' (' + (y + 543) + ')', String(y))); ys.value = String(now.getFullYear()); }
        if (ms && !ms.options.length) { MONTHS.forEach(function (m, i) { ms.add(new Option(m, pad(i + 1))); }); ms.value = pad(now.getMonth() + 1); }
    }

    function init() {
        fillFilters(); bindEvents();
        const origSwitch = window.switchView;
        window.switchView = async function (view) {
            if (typeof canAccessView === 'function' && !canAccessView(view)) return origSwitch(view);
            await origSwitch(view);
            if (view === 'matrix' && typeof renderMultiCourtMatrix === 'function') { try { await renderMultiCourtMatrix(); } catch (e) {} }
            if (view === 'dashboard') { fillFilters(); bindEvents(); await refresh(); }
        };
        window.renderDashboardStats = async function () {
            fillFilters(); bindEvents();
            if (el('edPane1')) await refresh();
            if (typeof renderMultiCourtMatrix === 'function') { try { await renderMultiCourtMatrix(); } catch (e) {} }
        };
        setInterval(function () { if (inView()) renderClock(); }, 1000);
        renderClock();
    }
    window.__ED = ED;
    init();
})();
// =====================================================================