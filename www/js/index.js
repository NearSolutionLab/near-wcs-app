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

    initialize: function () {
        this.bindEvents();
    },

    bindEvents: function () {
        document.addEventListener("deviceready", this.onDeviceReady.bind(this), false);

        function bind(id, event, handler) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener(event, handler.bind(app), false);
            } else {
                alert('Binding failed for element: ' + id);
            }
        }

        bind('settings-btn', 'click', this.toggleSettings);
        bind('saveAddress', 'click', this.saveAddress);
    },

    onDeviceReady: function () {
        var serverAddress = localStorage.getItem("serverAddress");
        var addressInput = document.getElementById("serverAddress");

        if (serverAddress && addressInput) {
            addressInput.value = serverAddress;
            this.loadUrlInBrowser(this.prepareUrl(serverAddress));
        } else if (addressInput) {
            this.toggleSettings();
        }
    },

    toggleSettings: function() {
        var panel = document.getElementById('settings-panel');
        if (panel) {
            if (panel.style.display === 'none' || panel.style.display === '') {
                panel.style.display = 'block';
            } else {
                panel.style.display = 'none';
            }
        }
    },

    loadUrlInBrowser: function(url) {
        if (app.inAppBrowserRef) {
            app.inAppBrowserRef.executeScript({ code: `window.location.href = "${url}"` });
        } else {
            var browser = cordova.InAppBrowser.open(url, '_blank', 'location=no,hidden=yes,toolbar=no');
            app.inAppBrowserRef = browser;

            browser.addEventListener('loadstop', function(event) {
                if (event.url.includes('/#/login')) {
                    browser.executeScript({
                        code: "(function(){if(document.getElementById('gemini-change-ip-btn'))return;var b=document.createElement('button');b.innerHTML='IP 변경';b.id='gemini-change-ip-btn';b.style.cssText='position:fixed;bottom:20px;right:20px;z-index:10000;padding:10px 20px;background-color:#007bff;color:white;border:none;border-radius:5px;font-size:16px;';document.body.appendChild(b);b.onclick=function(){var m={type:'change_ip_request'};webkit.messageHandlers.cordova_iab.postMessage(JSON.stringify(m))}})()"
                    });
                } else {
                    browser.executeScript({ code: `var b=document.getElementById('gemini-change-ip-btn');if(b)b.parentNode.removeChild(b);` });
                }
                browser.show();
            });

            browser.addEventListener('message', function(params) {
                if (params.data && params.data.type === 'change_ip_request') {
                    app.promptForNewIpAndReload();
                }
            });

            browser.addEventListener('loaderror', function(event) {
                alert('Page failed to load!\nURL: ' + event.url + '\nCode: ' + event.code + '\nMessage: ' + event.message);
            });

            browser.addEventListener('exit', function() {
                app.inAppBrowserRef = null;
            });
        }
    },

    promptForNewIpAndReload: function() {
        var newIp = prompt("새로운 IP 주소를 입력하세요:", localStorage.getItem("serverAddress") || "");
        if (newIp) {
            localStorage.setItem("serverAddress", newIp);
            document.getElementById("serverAddress").value = newIp;
            this.loadUrlInBrowser(this.prepareUrl(newIp));
        }
    },

    saveAddress: function() {
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

    prepareUrl: function(address) {
        var url = address;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }
        return url;
    }
};

app.initialize();
