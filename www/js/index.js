/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// Wait for the deviceready event before using any of Cordova's device APIs.
// See https://cordova.apache.org/docs/en/latest/cordova/events/events.html#deviceready
// document.addEventListener('deviceready', onDeviceReady, false);

// function onDeviceReady() {
//     // Cordova is now initialized. Have fun!

//     console.log('Running cordova-' + cordova.platformId + '@' + cordova.version);
//     document.getElementById('deviceready').classList.add('ready');
// }

var app = {
  inAppBrowserRef: null,

  // ====== SPP 상태 ======
  btAddr: null,
  reconnectTimer: null,
  _rxBuf: "",

  // 모드 플래그(HID 병행 시 사용)
  useHID: false,

  // ====== 자동 엔터 동작 플래그 ======
  _autoEnter: true, // 필요없으면 false

  // (옵션) 접두 제거 정규식 (현재는 사용하지 않지만 필요 시 활용)
  prefixStripRegex: /^(?:\]?[A-Za-z][0-9]?\s+|[A-Za-z]\s+){1,3}(?=[A-Za-z0-9])/,

  // ====== 재연결 백오프 ======
  retry: { base: 3000, max: 60000, step: 0 },
  nextDelay: function () {
    var d = Math.min(this.retry.base * Math.pow(2, this.retry.step++), this.retry.max);
    var jitter = Math.floor(d * 0.2 * Math.random());
    return d + jitter;
  },
  resetBackoff: function () { this.retry.step = 0; },

  // ====== Code ID (N/P, ]C1 등) 단독 프레임 처리 ======
  _cidPending: null,
  _cidTimer: null,
  _cidWindowMs: 150, // 다음 프레임 대기 시간(ms)

  _isCodeIdFrame: function (s) {
    if (!s) return false;
    s = String(s).replace(/[\x00-\x1F\x7F]+/g,'').trim();
    // a) 단일 영문자 Code ID (예: N, P, E, K 등)
    if (/^[A-Za-z]$/.test(s)) return true;
    // b) AIM ID (예: ]C1, ]E0)
    if (/^\][A-Za-z][0-9]?$/.test(s)) return true;
    return false;
  },

  initialize: function () {
    this.bindEvents();
  },

  bindEvents: function () {
    document.addEventListener("deviceready", this.onDeviceReady.bind(this), false);

    const bind = (id, ev, h) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(ev, h.bind(this), false);
      else alert('Binding failed for element: ' + id);
    };
    bind('settings-btn', 'click', this.toggleSettings);
    bind('saveAddress',  'click', this.saveAddress);
  },

  onDeviceReady: function () {
    // PM5 MAC 복원 (있으면 이후 연결 시도 시 사용)
    //var savedBt = localStorage.getItem('pm5.btaddr');
    //if (savedBt) this.btAddr = savedBt;

    var serverAddress = localStorage.getItem("serverAddress");
    var addressInput  = document.getElementById("serverAddress");

    if (serverAddress && addressInput) {
      addressInput.value = serverAddress;
      this.loadUrlInBrowser(this.prepareUrl(serverAddress));
    } else if (addressInput) {
      this.toggleSettings();
    }

    this.initBluetooth();
  },

  /* =============== UI / InAppBrowser =============== */

  toggleSettings: function () {
    var panel = document.getElementById('settings-panel');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
  },

  loadUrlInBrowser: function (url) {
    // ★ 페이지 전환 전 잔여 프레임/보류 상태 초기화 (진입 시 N/P 찍힘 방지)
    this._rxBuf = "";
    if (this._cidTimer) { clearTimeout(this._cidTimer); this._cidTimer = null; }
    this._cidPending = null;

    if (this.inAppBrowserRef) {
      this.inAppBrowserRef.executeScript({ code: `window.location.href = "${url}"` });
      return;
    }

    var browser = cordova.InAppBrowser.open(url, '_blank', 'location=no,hidden=yes,toolbar=no');
    this.inAppBrowserRef = browser;

    browser.addEventListener('loadstop', () => {
      // IAB: 스캔값 처리 + 자동 엔터 (+ 단일 Code ID 방지/선두 Code ID 스트립)
      browser.executeScript({
        code: `
          (function(){
            if (window.__cordovaHandleScan) return;

            function _strongEnter(){
              try{
                var d = document;
                var el = d.activeElement || d.querySelector('input,textarea,[contenteditable="true"]');
                if (!el) return;

                try {
                  el.dispatchEvent(new Event('change',{bubbles:true}));
                  el.blur(); setTimeout(function(){ el.focus(); }, 0);
                } catch(_){}

                ['keydown','keypress','keyup'].forEach(function(t){
                  var ev = new KeyboardEvent(t,{key:'Enter',code:'Enter',which:13,keyCode:13,bubbles:true,cancelable:true});
                  try { el.dispatchEvent(ev); } catch(_){}
                  try { d.dispatchEvent(ev); } catch(_){}
                });

                var form = el.form || (el.closest && el.closest('form'));
                if (form) {
                  var ok = form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
                  if (ok && typeof form.submit === 'function') { try { form.submit(); } catch(_){} }
                }

                var btn = (form && (
                  form.querySelector('button[type="submit"],input[type="submit"]') ||
                  form.querySelector('[data-testid*="submit" i], [data-action*="submit" i], .submit, [role="button"][aria-label*="submit" i]')
                )) || d.querySelector('button[type="submit"],input[type="submit"]');
                if (btn && typeof btn.click === 'function') { try { btn.click(); } catch(_){} }
              }catch(_){}
            }

            window.__cordovaHandleScan = function(text){
              try {
                var raw = ''+text;

                // A) 제어문자가 있으면: 마지막 제어문자 이후만 취함 (가장 신뢰도 높음)
                if (/[\\x00-\\x1F\\x7F]/.test(raw)) {
                  var last = /[\\x00-\\x1F\\x7F](?!.*[\\x00-\\x1F\\x7F])/.exec(raw);
                  if (last) raw = raw.slice(last.index + 1);
                } else {
                  // B) 제어문자가 없으면: 과잉 스트립 방지 위해 최소만 수행
                  //   - 선두 AIM ID (]C1, ]E0 등) 1회 제거만 허용
                  raw = raw.replace(/^\\][A-Za-z][0-9]?/, '');
                }

                // C) zero-width/NBSP/개행류 정리
                var s0 = raw
                  .replace(/[\\u200B-\\u200D\\uFEFF]/g,'')
                  .replace(/\\u00A0/g,' ')
                  .replace(/[\\r\\n\\t]+/g,' ')
                  .replace(/\\s{2,}/g,' ')
                  .trim();

                // D) 마지막 제어문자 이후 절단(보강)
                var lastCtrl = s0.search(/[\\x00-\\x1F\\x7F](?!.*[\\x00-\\x1F\\x7F])/);
                var s = (lastCtrl >= 0) ? s0.slice(lastCtrl + 1) : s0;

                // E) 잔여 제어문자/공백 제거
                s = s.replace(/[\\x00-\\x1F\\x7F]+/g,'').replace(/\\s+/g,'').trim();

                // F) 보조: 선두 AIM ID 1회만 다시 확인/제거 (중복 안전)
                s = s.replace(/^\\][A-Za-z][0-9]?/, '');

                // 단일 영문만 남으면 무시 (Code ID 단독 프레임)
                if (/^[A-Za-z]$/.test(s)) return;

                var el = document.activeElement;
                if (!el || (el.tagName!=='INPUT' && el.tagName!=='TEXTAREA' && el.isContentEditable!==true)) {
                  el = document.querySelector('input,textarea,[contenteditable="true"]');
                }
                if (el) {
                  el.focus();
                  el.value = s;
                  el.dispatchEvent(new Event('input',{bubbles:true}));
                  el.dispatchEvent(new Event('change',{bubbles:true}));
                  _strongEnter();
                }
              } catch(e){}
            };
          })();
        `
      });
      browser.show();
    });

    browser.addEventListener('message', (params) => {
      if (params.data && params.data.type === 'change_ip_request') {
        this.promptForNewIpAndReload();
      }
    });

    browser.addEventListener('loaderror', (e) => {
      alert('Page failed to load!\nURL: ' + e.url + '\nCode: ' + e.code + '\nMessage: ' + e.message);
    });

    browser.addEventListener('exit', () => { this.inAppBrowserRef = null; });
  },

  promptForNewIpAndReload: function () {
    var newIp = prompt("새로운 IP 주소를 입력하세요:", localStorage.getItem("serverAddress") || "");
    if (newIp) {
      localStorage.setItem("serverAddress", newIp);
      var ipInput = document.getElementById("serverAddress");
      if (ipInput) ipInput.value = newIp;
      this.loadUrlInBrowser(this.prepareUrl(newIp));
    }
  },

  saveAddress: function () {
    var addressInput = document.getElementById('serverAddress');
    if (addressInput && addressInput.value) {
      var address = addressInput.value;
      localStorage.setItem("serverAddress", address);
      this.loadUrlInBrowser(this.prepareUrl(address));
      this.toggleSettings();
    } else {
      alert("Please enter an address.");
    }
  },

  prepareUrl: function (address) {
    var url = address || '';
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url;
  },

  /* ================= BT / SPP ================= */

  initBluetooth: function () {
    try {
      if (!window.bluetoothSerial) {
        alert('Bluetooth Serial plugin not available');
        return;
      }

      const perms = cordova.plugins && cordova.plugins.permissions;
      const needPerms = perms ? [
        perms.BLUETOOTH_CONNECT,
        perms.BLUETOOTH_SCAN,
        perms.ACCESS_FINE_LOCATION
      ] : [];

      const ensure = (p) => new Promise(res => {
        if (!perms || !p) return res(true);
        perms.hasPermission(p,
          ok => ok ? res(true)
                   : perms.requestPermission(p, r => res(!!(r && r.hasPermission)), () => res(false)),
          () => res(false)
        );
      });

      (perms ? Promise.all(needPerms.map(ensure)) : Promise.resolve([true]))
        .then(results => {
          const allGranted = results.every(Boolean);
          if (!allGranted) {
            alert("블루투스 권한이 허용되지 않았습니다. 설정 > 앱 > 권한에서 '근처 기기(블루투스)'를 허용하세요.");
            return;
          }
          bluetoothSerial.isEnabled(
            () => this.listDevices(),
            () => bluetoothSerial.enable(() => this.listDevices(), e => alert("BT 활성화 실패: " + JSON.stringify(e)))
          );
        });
    } catch (e) {}
  },

  listDevices: function () {
    bluetoothSerial.list(devs => {
      const pm5 = devs.find(d => /PM5/i.test(d.name || ""));
      if (!pm5) return alert("PM5 스캐너를 찾을 수 없습니다. 먼저 페어링하세요.");
      this.btAddr = pm5.id || pm5.address;

      if (this.btAddr) {
        localStorage.setItem('pm5.btaddr', this.btAddr);
        if (pm5.name) localStorage.setItem('pm5.btname', pm5.name);
      }

      this.connectToScanner(this.btAddr);
    }, () => {});
  },

  connectToScanner: function (address) {
    if (!address) { this.listDevices(); return; }

    try { bluetoothSerial.disconnect(()=>{},()=>{}); } catch(e){}

    const ab2str = (ab) => {
      try {
        if (window.TextDecoder) {
          // UTF-8 디코딩 + ETX(0x03) 제거
          return new TextDecoder().decode(new Uint8Array(ab)).replace(/\x03/g, "");
        }
      } catch(_) {}
      var a = new Uint8Array(ab), s = '';
      for (var i=0;i<a.length;i++) {
        var c = a[i];
        if (c !== 0x03) s += String.fromCharCode(c); // ETX 제거
      }
      return s;
    };

    const onConnected = () => {
      this.resetBackoff();
      this._rxBuf = "";
      try { bluetoothSerial.clear(); } catch(e){}

      this.btAddr = address;
      localStorage.setItem('pm5.btaddr', this.btAddr);

      // RAW 구독 (중복 등록 없이 한 번만)
      bluetoothSerial.subscribeRawData((ab) => {
        try {
          const txt = ab2str(ab).replace(/\x00/g, "");
          this._accumulateAndSplit(txt);
        } catch (e) {}
      }, () => {});
    };

    // SPP 모드일 때만 백오프 재시도, HID 모드면 그냥 종료
    const onFail = () => {
      bluetoothSerial.connect(address, onConnected, () => {
        console.warn("스캐너 연결 실패 (", this.useHID ? "HID 모드" : "SPP 모드", ")");
//        if (!this.useHID) {
//          // SPP 모드일 때만 재시도
//          clearTimeout(this.reconnectTimer);
//          const delay = this.nextDelay();
//          console.log("[BT] retry in", delay, "ms");
//          this.reconnectTimer = setTimeout(()=> this.connectToScanner(this.btAddr || address), delay);
//        }
      });
    };

    bluetoothSerial.connectInsecure(address, onConnected, onFail);
  },

  _accumulateAndSplit: function (text) {
    if (!text) return;
    this._rxBuf += text;

    // CRLF, CR, LF, TAB, ETX 기준으로 분리
    const parts = this._rxBuf.split(/\r\n|\r|\n|\t|\x03/);
    this._rxBuf = parts.pop();

    for (const pRaw of parts) {
      // 바코드 정규화 (제어문자 제거, AIM ID 제거 등)
      const cleaned = this.normalizeBarcode(pRaw);

      // 결과가 없으면 무시 (CR/LF 단독 프레임 → Enter 강제 발생시키지 않음)
      if (!cleaned) continue;

      // 정상 바코드만 처리
      this.handleBarcode(cleaned);
    }

    // 버퍼 누적 제한
    if (this._rxBuf.length > 8192) {
      this._rxBuf = this._rxBuf.slice(-2048);
    }
  },



  /* ================= 주입/정규화/엔터 ================= */

  _injectIntoActiveInput: function (win, text) {
    try {
      let el = win.document.activeElement;
      if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.isContentEditable !== true)) {
        el = win.document.querySelector("input,textarea,[contenteditable='true']");
      }
      if (el) {
        el.focus();
        el.value = text;
        el.dispatchEvent(new Event("input",  { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (e) {}
  },

  // '마지막 제어문자 이후만 채택' → 잔여 제어문자/공백 제거 + (AIM ID만 1회 제거)
  normalizeBarcode: function (raw) {
    if (!raw) return raw;
    raw = String(raw);

    // A) 제어문자가 섞여 있으면: 마지막 제어문자 이후만 취함
    if (/[\x00-\x1F\x7F]/.test(raw)) {
      const last = /[\x00-\x1F\x7F](?!.*[\x00-\x1F\x7F])/.exec(raw);
      if (last) raw = raw.slice(last.index + 1);
    } else {
      // B) 제어문자가 없으면: 선두 AIM ID만 1회 제거 (N/P 제거 규칙 삭제)
      raw = raw.replace(/^\][A-Za-z][0-9]?/, '');
    }

    // C) zero-width/NBSP/개행류 정리
    let s0 = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // D) 마지막 제어문자 이후로 한 번 더 절단
    const m = /[\x00-\x1F\x7F](?!.*[\x00-\x1F\x7F])/.exec(s0);
    let s = m ? s0.slice(m.index + 1) : s0;

    // E) 잔여 제어문자/공백 제거
    s = s.replace(/[\x00-\x1F\x7F]+/g, '').replace(/\s+/g, '').trim();

    // F) 보조: 선두 AIM ID 1회만 재확인
    s = s.replace(/^\][A-Za-z][0-9]?/, '');

    return s;
  },

  _triggerEnter: function (win) {
    try {
      const d = win.document;
      let el = d.activeElement;
      if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.isContentEditable !== true)) {
        el = d.querySelector("input,textarea,[contenteditable='true']");
      }
      if (!el) return;

      try {
        el.dispatchEvent(new Event('change',{bubbles:true}));
        el.blur(); setTimeout(() => { try { el.focus(); } catch(_){} }, 0);
      } catch(_){}

      ['keydown','keypress','keyup'].forEach((t) => {
        const ev = new KeyboardEvent(t, { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true, cancelable: true });
        try { el.dispatchEvent(ev); } catch(_){}
        try { d.dispatchEvent(ev); } catch(_){}
      });

      const form = el.form || (el.closest && el.closest("form"));
      if (form) {
        const ok = form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (ok && typeof form.submit === "function") { try { form.submit(); } catch(_){} }
      }

      const btn = (form && (
        form.querySelector('button[type="submit"],input[type="submit"]') ||
        form.querySelector('[data-testid*="submit" i], [data-action*="submit" i], .submit, [role="button"][aria-label*="submit" i]')
      )) || d.querySelector('button[type="submit"],input[type="submit"]');
      if (btn && typeof btn.click === 'function') { try { btn.click(); } catch(_ ){} }

    } catch (_) {}
  },

  handleBarcode: function (code) {
    if (!code) return;
    // 단일 Code ID만 남은 결과는 최종 주입 차단
    if (/^[A-Za-z]$/.test(code)) return;

    if (this.inAppBrowserRef) {
      const payload = JSON.stringify(code);
      this.inAppBrowserRef.executeScript({
        code: `
          (function(s){
            try{
              var d = document;
              var el = d.activeElement;
              if (!el || (el.tagName!=='INPUT' && el.tagName!=='TEXTAREA' && el.isContentEditable!==true)) {
                el = d.querySelector('input,textarea,[contenteditable="true"]');
              }
              if (el) {
                if (/^[A-Za-z]$/.test(s)) return;
                el.focus();
                el.value = s;
                el.dispatchEvent(new Event('input',{bubbles:true}));
                el.dispatchEvent(new Event('change',{bubbles:true}));
                (function(){
                  try{
                    el.dispatchEvent(new Event('change',{bubbles:true}));
                    el.blur(); setTimeout(function(){ el.focus(); }, 0);
                  }catch(_){}
                  ['keydown','keypress','keyup'].forEach(function(t){
                    var ev = new KeyboardEvent(t,{key:'Enter',code:'Enter',which:13,keyCode:13,bubbles:true,cancelable:true});
                    try { el.dispatchEvent(ev); } catch(_){}
                    try { d.dispatchEvent(ev); } catch(_){}
                  });
                  var form = el.form || (el.closest && el.closest('form'));
                  if (form) {
                    var ok = form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
                    if (ok && form.submit) { try { form.submit(); } catch(_){} }
                  }
                  var btn = (form && (
                    form.querySelector('button[type="submit"],input[type="submit"]') ||
                    form.querySelector('[data-testid*="submit" i], [data-action*="submit" i], .submit, [role="button"][aria-label*="submit" i]')
                  )) || d.querySelector('button[type="submit"],input[type="submit"]');
                  if (btn && btn.click) { try { btn.click(); } catch(_ ){} }
                })();
              }
            }catch(e){}
          })(${payload});
        `
      });
      return;
    }

    this._injectIntoActiveInput(window, code);
    if (this._autoEnter) this._triggerEnter(window);
  }
};

app.initialize();