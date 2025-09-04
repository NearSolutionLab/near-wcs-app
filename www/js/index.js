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

  // ====== 자동 엔터 동작 플래그 ======
  _autoEnter: true, // 필요없으면 false

  // (옵션) 접두 제거 정규식 (현재는 사용하지 않지만 필요 시 활용)
  prefixStripRegex: /^(?:\]?[A-Za-z][0-9]?\s+|[A-Za-z]\s+){1,3}(?=[A-Za-z0-9])/,

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
    if (this.inAppBrowserRef) {
      this.inAppBrowserRef.executeScript({ code: `window.location.href = "${url}"` });
      return;
    }

    var browser = cordova.InAppBrowser.open(url, '_blank', 'location=no,hidden=yes,toolbar=no');
    this.inAppBrowserRef = browser;

    browser.addEventListener('loadstop', () => {
      // IAB: 스캔값 처리 + 강화된 자동 엔터
      browser.executeScript({
        code: `
          (function(){
            if (window.__cordovaHandleScan) return;

            function _strongEnter(){
              try{
                var d = document;
                var el = d.activeElement || d.querySelector('input,textarea,[contenteditable="true"]');
                if (!el) return;

                // change/blur 트리거 유도
                try {
                  el.dispatchEvent(new Event('change',{bubbles:true}));
                  el.blur(); setTimeout(function(){ el.focus(); }, 0);
                } catch(_){}

                // 키 이벤트 전송 (엘리먼트 → 문서)
                ['keydown','keypress','keyup'].forEach(function(t){
                  var ev = new KeyboardEvent(t,{key:'Enter',code:'Enter',which:13,keyCode:13,bubbles:true,cancelable:true});
                  try { el.dispatchEvent(ev); } catch(_){}
                  try { d.dispatchEvent(ev); } catch(_){}
                });

                // form submit 시도 (이벤트 먼저, 막히면 프로그램 호출)
                var form = el.form || (el.closest && el.closest('form'));
                if (form) {
                  var ok = form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
                  if (ok && typeof form.submit === 'function') { try { form.submit(); } catch(_){} }
                }

                // submit 버튼 클릭 대체
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

                // 0) zero-width/NBSP/개행류 정리(제어문자는 남겨 split 기준으로 사용)
                var s0 = raw
                  .replace(/[\\u200B-\\u200D\\uFEFF]/g,'')
                  .replace(/\\u00A0/g,' ')
                  .replace(/[\\r\\n\\t]+/g,' ')
                  .replace(/\\s{2,}/g,' ')
                  .trim();

                // 1) 마지막 제어문자 이후만 채택
                var lastCtrl = s0.search(/[\\x00-\\x1F\\x7F](?!.*[\\x00-\\x1F\\x7F])/);
                var s = (lastCtrl >= 0) ? s0.slice(lastCtrl + 1) : s0;

                // 2) 잔여 제어문자/공백 제거
                s = s.replace(/[\\x00-\\x1F\\x7F]+/g,'').replace(/\\s+/g,'').trim();

                var el = document.activeElement;
                if (!el || (el.tagName!=='INPUT' && el.tagName!=='TEXTAREA' && el.contentEditable!=='true')) {
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
    } catch (e) {
      // 환경에 따라 플러그인 미존재 가능
    }
  },

  listDevices: function () {
    bluetoothSerial.list(devs => {
      const pm5 = devs.find(d => /PM5/i.test(d.name || ""));
      if (!pm5) return alert("PM5 스캐너를 찾을 수 없습니다. 먼저 페어링하세요.");
      this.btAddr = pm5.id || pm5.address;
      this.connectToScanner(this.btAddr);
    }, () => {});
  },

  connectToScanner: function (address) {
    try { bluetoothSerial.disconnect(()=>{},()=>{}); } catch(e){}

    const ab2str = (ab) => {
      try { if (window.TextDecoder) return new TextDecoder().decode(new Uint8Array(ab)); }
      catch(_) {}
      var a = new Uint8Array(ab), s = '';
      for (var i=0;i<a.length;i++) { var c=a[i]; if (c) s += String.fromCharCode(c); }
      return s;
    };

    const onConnected = () => {
      this._rxBuf = "";
      try { bluetoothSerial.clear(); } catch(e){}

      const onLine = (s) => this._accumulateAndSplit(s);

      // Delimiter 구독 + RAW 병행
      bluetoothSerial.subscribe("\r\n", onLine, () => {
        bluetoothSerial.subscribe("\r", onLine, () => {
          bluetoothSerial.subscribe("\n", onLine, () => {/* only RAW */});
        });
      });
      bluetoothSerial.subscribeRawData((ab) => {
        try {
          const txt = ab2str(ab).replace(/\x00/g, "");
          this._accumulateAndSplit(txt);
        } catch (e) {}
      }, () => {});
    };

    const onFail = () => {
      bluetoothSerial.connect(address, onConnected, () => {
        alert("스캐너 연결 실패");
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(()=> this.connectToScanner(this.btAddr || address), 3000);
      });
    };

    bluetoothSerial.connectInsecure(address, onConnected, onFail);
  },

  _accumulateAndSplit: function (text) {
    if (!text) return;
    this._rxBuf += text;
    const parts = this._rxBuf.split(/\r\n|[\r\n\t]|\x03/); // CRLF/CR/LF/TAB/ETX
    this._rxBuf = parts.pop();

    for (const p of parts) {
      // ① 제어문자만 온 경우(엔터 전용 바코드) → 강제 엔터
      if (/^[\x00-\x1F\x7F]+$/.test(p)) {
        if (this._autoEnter) this._triggerEnter(window);
        continue;
      }
      // ② 일반 스캔 처리
      const code = this.normalizeBarcode(p);
      if (code) this.handleBarcode(code);
    }

    if (this._rxBuf.length > 8192) this._rxBuf = this._rxBuf.slice(-2048);
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

  // '마지막 제어문자 이후만 채택' → 잔여 제어문자/공백 제거
  normalizeBarcode: function (raw) {
    if (!raw) return raw;

    let s0 = String(raw)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const m = /[\x00-\x1F\x7F](?!.*[\x00-\x1F\x7F])/.exec(s0);
    let s = m ? s0.slice(m.index + 1) : s0;

    s = s
      .replace(/[\x00-\x1F\x7F]+/g, '')
      .replace(/\s+/g, '')
      .trim();

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

      // change/blur → focus 토글 (일부 UI가 blur에서만 반응)
      try {
        el.dispatchEvent(new Event('change',{bubbles:true}));
        el.blur(); setTimeout(() => { try { el.focus(); } catch(_){} }, 0);
      } catch(_){}

      // 키 이벤트(엘리먼트, 문서)
      ['keydown','keypress','keyup'].forEach((t) => {
        const ev = new KeyboardEvent(t, { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true, cancelable: true });
        try { el.dispatchEvent(ev); } catch(_){}
        try { d.dispatchEvent(ev); } catch(_){}
      });

      // form submit (이벤트 → 프로그래매틱 콜)
      const form = el.form || (el.closest && el.closest("form"));
      if (form) {
        const ok = form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (ok && typeof form.submit === "function") { try { form.submit(); } catch(_){} }
      }

      // submit 버튼 클릭 대체
      const btn = (form && (
        form.querySelector('button[type="submit"],input[type="submit"]') ||
        form.querySelector('[data-testid*="submit" i], [data-action*="submit" i], .submit, [role="button"][aria-label*="submit" i]')
      )) || d.querySelector('button[type="submit"],input[type="submit"]');
      if (btn && typeof btn.click === 'function') { try { btn.click(); } catch(_){} }

    } catch (_) {}
  },

  handleBarcode: function (code) {
    if (!code) return;

    if (this.inAppBrowserRef) {
      const payload = JSON.stringify(code);
      this.inAppBrowserRef.executeScript({
        code: `
          (function(s){
            try{
              var d = document;
              var el = d.activeElement;
              if (!el || (el.tagName!=='INPUT' && el.tagName!=='TEXTAREA' && el.contentEditable!=='true')) {
                el = d.querySelector('input,textarea,[contenteditable="true"]');
              }
              if (el) {
                el.focus();
                el.value = s;
                el.dispatchEvent(new Event('input',{bubbles:true}));
                el.dispatchEvent(new Event('change',{bubbles:true}));

                // 강화된 자동 엔터
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
                  if (btn && btn.click) { try { btn.click(); } catch(_){} }
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