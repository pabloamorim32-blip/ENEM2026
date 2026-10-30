# Servidor local do site Reta final ENEM. Uso: .\iniciar-site.ps1
# Opcional: $env:GEMINI_API_KEY = "sua-chave" antes de rodar ativa o Gemini.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot; $port = 4173
$gmodel = if ($env:GEMINI_MODEL) { $env:GEMINI_MODEL } else { 'gemini-2.5-flash' }
$mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='text/javascript'; '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.ico'='image/x-icon' }
function Send($res, $code, $bytes, $type) {
  $res.StatusCode = $code; $res.ContentType = $type; $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}
function SendJson($res, $code, $obj) {
  Send $res $code ([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 6 -Compress))) 'application/json; charset=utf-8'
}
$l = [System.Net.HttpListener]::new()
$l.Prefixes.Add("http://127.0.0.1:$port/")
try { $l.Start() } catch { Write-Host "Porta $port em uso. Feche a outra janela do site e tente de novo."; exit 1 }
Write-Host "Site no ar: http://127.0.0.1:$port/  (Ctrl+C para parar)"
Write-Host ("Gemini: " + $(if ($env:GEMINI_API_KEY) { "ativo ($gmodel)" } else { "desligado (usando IA local no navegador)" }))
Start-Process "http://127.0.0.1:$port/"
try {
  while ($l.IsListening) {
    $c = $l.GetContext(); $req = $c.Request; $res = $c.Response
    try {
      $path = $req.Url.AbsolutePath
      if ($path -eq '/api/status') {
        SendJson $res 200 @{ configured = [bool]$env:GEMINI_API_KEY; model = $gmodel }
      } elseif ($path -eq '/api/coach' -and $req.HttpMethod -eq 'POST') {
        if (-not $env:GEMINI_API_KEY) { SendJson $res 503 @{ error = 'Gemini nao configurado.' }; continue }
        $raw = [IO.StreamReader]::new($req.InputStream, [Text.Encoding]::UTF8).ReadToEnd()
        $in = $raw | ConvertFrom-Json
        $body = @{
          systemInstruction = @{ parts = @(@{ text = [string]$in.system }) }
          contents = @(@{ role = 'user'; parts = @(@{ text = ($in.payload | ConvertTo-Json -Depth 8 -Compress) }) })
          generationConfig = @{ temperature = 0.25; maxOutputTokens = 1200 }
        } | ConvertTo-Json -Depth 8 -Compress
        $uri = "https://generativelanguage.googleapis.com/v1beta/models/${gmodel}:generateContent"
        $r = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ 'x-goog-api-key' = $env:GEMINI_API_KEY } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
        SendJson $res 200 @{ answer = $r.candidates[0].content.parts[0].text; model = $gmodel; provider = 'Gemini' }
      } else {
        if ($path -eq '/') { $path = '/index.html' }
        $file = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
        if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
          $ext = [IO.Path]::GetExtension($file).ToLower()
          $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
          Send $res 200 ([IO.File]::ReadAllBytes($file)) $type
        } else { Send $res 404 ([Text.Encoding]::UTF8.GetBytes('Nao encontrado')) 'text/plain; charset=utf-8' }
      }
    } catch {
      try { SendJson $res 500 @{ error = $_.Exception.Message } } catch {}
    } finally { $res.Close() }
  }
} finally { $l.Stop() }
