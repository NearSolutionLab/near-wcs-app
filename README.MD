## 주의
nvm use 18
npm install
1. BLE와 일반 Bluetooth사이에 라브러리 충동 있음
2. 따라서 필요 시 다시 다른 다른 라이버러리 수정 필요

## 1. platform 추가
cordova platform add android

## 2. 환경 설정 확인 
cordova requirements
Java JDK: installed 17.0.11
Android SDK: installed true
Android target: installed android-35,android-34,android-33,android-28
Gradle: installed /Users/lyonghwan/.sdkman/candidates/gradle/7.6/bin/gradle

## 3. 소스 수정
1. 서버 IP 수정 파일 수정
   A. config.xml  IP 변경
      <allow-navigation href="http://183.99.7.38:8033" />
   B. /www/js/index.js IP 변경
      var targetUrl = "http://183.99.7.38:8033";
   C. www/index.html  IP 변경
      <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'self' data: gap:http://183.99.7.38:8033 https://ssl.gstatic.com 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src *; img-src 'self' data: content:;"
            />
      <a id="bkpLink" href="http://183.99.7.38:8033">wes</a>

2. config 반영 처리(IP 변경 필수 실행)
   cordova prepare  

3. 빌드 처리
   cordova build android --verbose
   cordova run android

4. 생성된 apk 확인 
   platforms/android/app/build/outputs/apk/debug/app-debug.apk

5. 빌드 및 VM 삭제
   cordova platform rm android