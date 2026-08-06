#!/usr/bin/env python3
"""
Osmanlıca Çeviri Sistemi - Local Web & AI API Server
Serves web application and handles AI OCR & Translation requests.
"""

import http.server
import socketserver
import os
import sys
import json
import urllib.request
import urllib.error
import re

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Check for GEMINI_API_KEY in environment or .env file
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# Try reading .env file if available
env_path = os.path.join(DIRECTORY, '.env')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip().startswith('GEMINI_API_KEY='):
                GEMINI_API_KEY = line.strip().split('=', 1)[1].strip('"\'')

class AIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        if self.path == '/api/translate':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                image_base64 = payload.get('image', '')
                api_key = payload.get('api_key', '').strip() or GEMINI_API_KEY
                
                if not image_base64:
                    self._send_json({"error": "Görsel verisi eksik."}, 400)
                    return
                
                if api_key:
                    # Perform real Gemini Vision AI OCR & Translation
                    try:
                        result = self._call_gemini_vision(image_base64, api_key)
                        self._send_json(result, 200)
                    except urllib.error.HTTPError as http_err:
                        err_body = http_err.read().decode('utf-8', errors='ignore')
                        print(f"Gemini API HTTP Error {http_err.code}: {err_body}")
                        err_msg = "Gemini API Anahtarı geçersiz veya yetkisiz."
                        try:
                            err_json = json.loads(err_body)
                            if 'error' in err_json and 'message' in err_json['error']:
                                err_msg = f"Gemini API Hatası: {err_json['error']['message']}"
                        except Exception:
                            pass
                        self._send_json({"error": err_msg, "code": http_err.code}, 400)
                    except Exception as api_err:
                        print(f"Gemini API Exception: {api_err}")
                        self._send_json({"error": f"API Bağlantı Hatası: {str(api_err)}"}, 500)
                else:
                    self._send_json({
                        "status": "no_api_key",
                        "error": "API Key Tanımlanmadı",
                        "message": "Canlı görselleri çevirebilmek için lütfen sağ üstteki ⚙️ API Ayarları butonundan Gemini API Key giriniz."
                    }, 400)
            except Exception as e:
                print(f"General Server Error: {e}")
                self._send_json({"error": f"Sunucu hatası: {str(e)}"}, 500)
        else:
            self.send_error(404, "Endpoint bulunamadı")

    def _call_gemini_vision(self, base64_data, api_key):
        clean_b64 = base64_data.split(',')[-1]
        
        # Candidate model names to try in order of preference
        models = [
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-flash-latest",
            "gemini-2.5-flash",
            "gemini-2.0-flash"
        ]

        prompt = (
            "Lütfen bu Osmanlıca belgenin TÜM SATIRLARINI VE PARAGRAFLARINI eksiksiz transkribe et ve çevir. "
            "DİKKAT: 'ocr' alanına KESİNLİKLE Latin harfi karıştırma; metni %100 Orijinal Arap Harfli Osmanlıca (Osmanlı Türkçesi) olarak yaz. "
            "'trans' alanına ise tam metnin günümüz Türkçesi sadeleştirmesini ver. "
            "Yanıt formatı KESİNLİKLE geçerli bir JSON olmalıdır: {\"ocr\": \"sadece arap harfli osmanlıca metin\", \"trans\": \"günümüz türkçesi çeviri\"}"
        )

        request_body = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": clean_b64}}
                ]
            }]
        }

        last_error = None
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            req = urllib.request.Request(
                url,
                data=json.dumps(request_body).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
                    raw_text = res_data['candidates'][0]['content']['parts'][0]['text']
                    
                    json_match = re.search(r'\{[\s\S]*\}', raw_text)
                    if json_match:
                        parsed = json.loads(json_match.group(0))
                        if 'ocr' in parsed and 'trans' in parsed:
                            return parsed
                    return {"ocr": raw_text, "trans": "Çeviri tamamlandı."}
            except urllib.error.HTTPError as e:
                last_error = e
                # If it's a 404 (model not found), try next model name
                if e.code == 404:
                    continue
                else:
                    raise e
            except Exception as e:
                last_error = e
                continue
        
        if last_error:
            raise last_error

    def _send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

def run_server():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), AIHandler) as httpd:
        print(f"==================================================")
        print(f"📜 Osmanlıca Çeviri Sistemi AI Web Sunucusu Başlatıldı!")
        print(f"🌐 Yerel Adres: http://localhost:{PORT}")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nSunucu durduruldu.")

if __name__ == '__main__':
    run_server()
