# start_dashboard.ps1
# Script khởi chạy local web server phục vụ Dashboard mà không cần Node/Python
# Cổng mặc định: 8000

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8000
$Url = "http://localhost:$Port/"

# Khởi tạo HTTP Listener
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Url)

try {
    $Listener.Start()
} catch {
    Write-Host "Không thể mở server trên cổng $Port. Có thể cổng đang được sử dụng hoặc cần quyền Admin." -ForegroundColor Red
    Write-Host "Lỗi: $_" -ForegroundColor Red
    Exit
}

Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Stock Agent Dashboard Web Server Đang Hoạt Động" -ForegroundColor Green
Write-Host "  Địa chỉ: $Url" -ForegroundColor Cyan
Write-Host "  Thư mục: $ScriptDir" -ForegroundColor DarkGray
Write-Host "  Nhấn [Ctrl + C] hoặc đóng cửa sổ này để dừng server" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green

# Tự động mở trình duyệt
try {
    Start-Process $Url
} catch {
    Write-Host "Vui lòng mở thủ công trình duyệt và truy cập: $Url" -ForegroundColor Yellow
}

# Vòng lặp lắng nghe request
while ($Listener.IsListening) {
    try {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response
        
        # Lấy file tương ứng
        $Path = $Request.Url.LocalPath
        if ($Path -eq "/") {
            $Path = "/index.html"
        }
        
        $FilePath = Join-Path $ScriptDir $Path
        
        if (Test-Path $FilePath -PathType Leaf) {
            # Xác định Content-Type
            $Extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $ContentType = "text/plain"
            switch ($Extension) {
                ".html" { $ContentType = "text/html; charset=utf-8" }
                ".css"  { $ContentType = "text/css" }
                ".js"   { $ContentType = "application/javascript" }
                ".json" { $ContentType = "application/json; charset=utf-8" }
                ".png"  { $ContentType = "image/png" }
                ".jpg"  { $ContentType = "image/jpeg" }
                ".gif"  { $ContentType = "image/gif" }
                ".ico"  { $ContentType = "image/x-icon" }
            }
            
            $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
            $Response.ContentType = $ContentType
            $Response.ContentLength64 = $Bytes.Length
            
            # Thêm Header CORS cho phép gọi AJAX nội bộ mượt mà
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            
            $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 200 OK: $Path" -ForegroundColor Gray
        } else {
            $Response.StatusCode = 404
            $ErrorMsg = "File Not Found: $Path"
            $ErrorBytes = [System.Text.Encoding]::UTF8.GetBytes($ErrorMsg)
            $Response.ContentType = "text/plain; charset=utf-8"
            $Response.ContentLength64 = $ErrorBytes.Length
            $Response.OutputStream.Write($ErrorBytes, 0, $ErrorBytes.Length)
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 404 Not Found: $Path" -ForegroundColor Red
        }
        $Response.OutputStream.Close()
    }
    catch [System.Net.HttpListenerException] {
        # Bỏ qua lỗi ngắt kết nối đột ngột từ trình duyệt khi tải lại trang
    }
    catch {
        Write-Host "Lỗi xử lý request: $_" -ForegroundColor Red
    }
}

$Listener.Stop()
