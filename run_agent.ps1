# Run Stock Market Agent script
# Usage: .\run_agent.ps1 [-OneShot] [-Force]

param(
    [switch]$OneShot,  # Chạy 1 lần rồi thoát (tiện cho việc test)
    [switch]$Force     # Bỏ qua lịch sử, phân tích lại tất cả các tin tìm thấy
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8

# Cài đặt thư mục làm việc và các file dữ liệu
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir "config.json"
$DataDir = Join-Path $ScriptDir "data"
$HistoryFile = Join-Path $DataDir "history.json"
$ResultsFile = Join-Path $DataDir "analysis_results.json"

# Hàm in log màu mè cho đẹp mắt
function Write-Log {
    param (
        [string]$Message,
        [string]$Type = "INFO"
    )
    $Color = "White"
    switch ($Type) {
        "INFO"    { $Color = "Cyan" }
        "SUCCESS" { $Color = "Green" }
        "WARNING" { $Color = "Yellow" }
        "ERROR"   { $Color = "Red" }
    }
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Type] $Message" -ForegroundColor $Color
}

Write-Log "Khởi động Stock Market Analysis Agent..." "INFO"

# Tạo thư mục data nếu chưa tồn tại
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
    Write-Log "Đã tạo thư mục lưu trữ dữ liệu tại: $DataDir" "SUCCESS"
}

# Đọc file cấu hình config.json
if (-not (Test-Path $ConfigFile)) {
    Write-Log "Không tìm thấy file cấu hình config.json tại $ConfigFile" "ERROR"
    Exit
}

$Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
$ApiKey = $Config.GeminiApiKey

# Hỏi API Key nếu chưa cấu hình
if ($ApiKey -eq "YOUR_GEMINI_API_KEY" -or [string]::IsNullOrEmpty($ApiKey)) {
    Write-Log "Gemini API Key chưa được cấu hình." "WARNING"
    $InputKey = Read-Host "Vui lòng nhập Gemini API Key của bạn (hoặc nhấn Enter để bỏ qua nếu đã set biến môi trường GEMINI_API_KEY)"
    if (-not [string]::IsNullOrEmpty($InputKey)) {
        $ApiKey = $InputKey.Trim()
        # Lưu lại vào file config.json để lần sau không cần nhập lại
        $Config.GeminiApiKey = $ApiKey
        $ConfigJson = ConvertTo-Json $Config -Depth 10
        [System.IO.File]::WriteAllText($ConfigFile, $ConfigJson, [System.Text.Encoding]::UTF8)
        Write-Log "Đã lưu Gemini API Key vào file config.json" "SUCCESS"
    } else {
        $ApiKey = $env:GEMINI_API_KEY
    }
}

if ([string]::IsNullOrEmpty($ApiKey)) {
    Write-Log "Không có Gemini API Key. Vui lòng lấy khóa API miễn phí từ Google AI Studio và cấu hình vào config.json." "ERROR"
    Exit
}

# Đọc lịch sử quét tin tức
$History = @()
if (Test-Path $HistoryFile) {
    try {
        $RawHistory = Get-Content -Path $HistoryFile -Raw | ConvertFrom-Json
        if ($null -ne $RawHistory) {
            # Chống lỗi chuỗi dính liền hoặc kiểu dữ liệu đơn
            $History = @($RawHistory)
        }
    } catch {
        Write-Log "Lỗi đọc file lịch sử. Khởi tạo lại." "WARNING"
        $History = @()
    }
}

# Đọc kết quả phân tích cũ
$Results = @()
if (Test-Path $ResultsFile) {
    try {
        $RawResults = Get-Content -Path $ResultsFile -Raw | ConvertFrom-Json
        if ($null -ne $RawResults) {
            $Results = @($RawResults)
        }
    } catch {
        Write-Log "Lỗi đọc file kết quả cũ. Khởi tạo lại." "WARNING"
        $Results = @()
    }
}

# Hàm làm sạch thẻ HTML trong phần tóm tắt của RSS (nếu có)
function Clean-Html {
    param ([string]$Html)
    if ([string]::IsNullOrEmpty($Html)) { return "" }
    # Loại bỏ các thẻ HTML
    $Clean = $Html -replace '<[^>]+>', ''
    # Giải mã các ký tự HTML thực thể cơ bản
    $Clean = $Clean -replace '&nbsp;', ' '
    $Clean = $Clean -replace '&amp;', '&'
    $Clean = $Clean -replace '&quot;', '"'
    $Clean = $Clean -replace '&lt;', '<'
    $Clean = $Clean -replace '&gt;', '>'
    return $Clean.Trim()
}

# Hàm trích xuất text an toàn từ XML Node (hỗ trợ Windows PowerShell và PowerShell Core trên Linux)
function Get-NodeText {
    param ($Node)
    if ($null -eq $Node) { return "" }
    if ($Node -is [System.Xml.XmlElement]) {
        return $Node.InnerText.Trim()
    }
    return ([string]$Node).Trim()
}

# Hàm lấy tin tức từ RSS feed
function Get-RssFeedItems {
    param (
        [string]$FeedUrl,
        [string]$Source
    )
    $Items = @()
    try {
        Write-Log "Đang tải tin tức từ: $Source ($FeedUrl)..." "INFO"
        # Đặt User-Agent để tránh bị một số báo chặn
        $WebResponse = Invoke-WebRequest -Uri $FeedUrl -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -TimeoutSec 15 -UseBasicParsing
        [xml]$Xml = $WebResponse.Content
        
        # Parse RSS 2.0
        if ($Xml.rss.channel.item) {
            $Items = $Xml.rss.channel.item | ForEach-Object {
                $CleanDesc = Clean-Html $_.description
                [PSCustomObject]@{
                    Title       = Get-NodeText $_.title
                    Description = $CleanDesc
                    Link        = Get-NodeText $_.link
                    PubDate     = Get-NodeText $_.pubDate
                    Source      = $Source
                }
            }
        }
    } catch {
        Write-Log "Lỗi khi lấy tin tức từ $($Source): $_" "WARNING"
    }
    return $Items
}

# Danh sách mã cổ phiếu hợp lệ (Whitelist) — Toàn bộ HOSE (373 mã) + HNX (281 mã) + UPCoM (786 mã) = 1440 mã
# Nguồn: CafeF banggia API, cập nhật 30/06/2026
$ValidTickers = @(
    # ===== HOSE (373 mã) =====
    "AAA","AAM","AAT","ABR","ABS","ABT","ACB","ACC","ACG","ACL","ADG","ADP","ADS","AGG","AGR","ANV","APG","APH"
    "ASG","ASM","ASP","AST","BAF","BBC","BCE","BCG","BCM","BFC","BHN","BIC","BID","BKG","BMC","BMI","BMP","BRC"
    "BSI","BSR","BTP","BTT","BVH","BWE","CCC","CCI","CCL","CDC","CHP","CIG","CII","CKG","CLC","CLL","CLW","CMG"
    "CMV","CMX","CNG","COM","CRC","CRE","CSM","CSV","CTD","CTF","CTG","CTI","CTR","CTS","CVT","DAH","DAT","DBC"
    "DBD","DBT","DCL","DCM","DGC","DGW","DHA","DHC","DHG","DHM","DIG","DLG","DMC","DPG","DPM","DPR","DQC","DRC"
    "DRH","DRL","DSC","DSE","DSN","DTA","DTL","DTT","DVP","DXG","DXS","DXV","EIB","ELC","EVE","EVF","EVG","FCM"
    "FCN","FDC","FIR","FIT","FMC","FPT","FRT","FTS","GAS","GDT","GEE","GEG","GEX","GIL","GMD","GMH","GSP","GTA"
    "GVR","HAG","HAH","HAP","HAR","HAS","HAX","HCD","HCM","HDB","HDC","HDG","HHP","HHS","HHV","HID","HII","HMC"
    "HNA","HPG","HPX","HQC","HRC","HSG","HSL","HTG","HTI","HTL","HTN","HTV","HUB","HVH","HVN","HVX","ICT","IDI"
    "IJC","ILB","IMP","ITC","ITD","JVC","KBC","KDC","KDH","KHG","KHP","KMR","KOS","KSB","LAF","LBM","LCG","LDG"
    "LGC","LGL","LHG","LIX","LPB","LSS","MBB","MCM","MCP","MDG","MHC","MIG","MSB","MSH","MSN","MWG","NAB","NAF"
    "NAV","NBB","NCT","NHA","NHH","NHT","NKG","NLG","NNC","NSC","NTL","NVL","NVT","OCB","OGC","OPC","ORS","PAC"
    "PAN","PDN","PDR","PET","PGC","PGD","PGI","PGV","PHC","PHR","PIT","PJT","PLP","PLX","PMG","PNC","PNJ","POW"
    "PPC","PTB","PTC","PTL","PVD","PVP","PVT","QCG","QNP","RAL","REE","RYG","SAB","SAM","SAV","SBA","SBG","SBT"
    "SBV","SCR","SCS","SFC","SFG","SFI","SGN","SGR","SGT","SHA","SHB","SHI","SHP","SIP","SJD","SJS","SKG","SMA"
    "SMB","SMC","SPM","SRC","SRF","SSB","SSC","SSI","STB","STG","STK","SVC","SVD","SVI","SVT","SZC","SZL","TBC"
    "TCB","TCD","TCH","TCI","TCL","TCM","TCO","TCR","TCT","TDC","TDG","TDH","TDM","TDP","TDW","TEG","THG","TIP"
    "TIX","TLD","TLG","TLH","TMP","TMS","TMT","TNC","TNH","TNI","TNT","TPB","TPC","TRA","TRC","TSC","TTA","TTE"
    "TTF","TVB","TVS","TVT","TYA","UIC","VAF","VCA","VCB","VCF","VCG","VCI","VDP","VDS","VFG","VGC","VHC","VHM"
    "VIB","VIC","VID","VIP","VIX","VJC","VMD","VND","VNE","VNG","VNL","VNM","VNS","VOS","VPB","VPD","VPG","VPH"
    "VPI","VPL","VPS","VRC","VRE","VSC","VSH","VSI","VTB","VTO","VTP","YBM","YEG"
    # ===== HNX (281 mã) =====
    "AAV","ADC","ALT","AMC","AME","AMV","API","APS","ARM","ATS","BAB","BAX","BBS","BCC","BCF","BDB","BED","BKC"
    "BNA","BPC","BSC","BST","BTS","BTW","BVS","BXH","CAG","CAN","CAP","CAR","CCR","CDN","CEO","CET","CIA","CJC"
    "CKV","CLH","CLM","CMC","CMS","CPC","CSC","CST","CTB","CTC","CTP","CTT","CTX","CVN","DAD","DAE","DDG","DHP"
    "DHT","DIH","DNC","DNP","DST","DTD","DTG","DTK","DVM","DXP","EBS","ECI","EID","EVS","FID","GDW","GIC","GKM"
    "GLT","GMA","GMX","HAD","HAT","HBS","HCC","HCT","HDA","HEV","HGM","HHC","HJS","HKT","HLC","HLD","HMH","HMR"
    "HOM","HTC","HUT","HVT","ICG","IDC","IDJ","IDV","INC","INN","IPA","ITQ","IVS","KDM","KHS","KKC","KMT","KSD"
    "KSF","KST","KSV","KTS","LAS","LBE","LCD","LDP","LHC","LIG","MAC","MAS","MBG","MBS","MCC","MCF","MCO","MDC"
    "MED","MEL","MKV","MST","MVB","NAG","NAP","NBC","NBP","NBW","NDN","NDX","NET","NFC","NHC","NRC","NSH","NST"
    "NTH","NTP","NVB","OCH","ONE","PBP","PCE","PCG","PCH","PCT","PDB","PEN","PGN","PGS","PGT","PHN","PIA","PIC"
    "PJC","PLC","PMB","PMC","PMP","PMS","POT","PPE","PPP","PPS","PPT","PPY","PRC","PRE","PSC","PSD","PSE","PSI"
    "PSW","PTD","PTI","PTS","PTX","PVB","PVC","PVG","PVI","PVS","QHD","QST","QTC","RCL","SAF","SCG","SCI","SDA"
    "SDC","SDG","SDN","SDU","SEB","SED","SFN","SGC","SGD","SGH","SHE","SHN","SHS","SIC","SJE","SLS","SMN","SMT"
    "SPC","SPI","SRA","SSM","STC","STP","SVN","SZB","TBX","TDN","TDT","TET","TFC","THB","THD","THS","THT","TIG"
    "TJC","TKU","TMB","TMC","TMX","TNG","TOT","TPH","TPP","TSB","TTC","TTH","TTL","TTT","TVC","TVD","TXM","UNI"
    "VBC","VCC","VCM","VCS","VDL","VFS","VGP","VGS","VHE","VHL","VIF","VIG","VIT","VLA","VMC","VMS","VNC","VNF"
    "VNR","VNT","VSA","VSM","VTC","VTH","VTJ","VTV","VTZ","WCS","WSS"
    # ===== UPCoM (786 mã) =====
    "AAH","AAS","ABB","ABC","ABI","ABW","ACE","ACM","ACS","ACV","AFX","AGF","AGM","AGP","AGX","AIC","AIG","ALV"
    "AMD","AMP","AMS","ANT","APC","APF","APL","APP","APT","ART","ATA","ATB","ATG","AVC","AVG","BAL","BBH","BBM"
    "BBT","BCA","BCB","BCP","BCR","BCV","BDG","BDT","BDW","BEL","BGE","BGW","BHA","BHC","BHG","BHI","BHK","BHP"
    "BIG","BII","BIO","BLF","BLI","BLN","BLT","BMD","BMF","BMG","BMJ","BMK","BMN","BMS","BMV","BNW","BOT","BQB"
    "BRR","BRS","BSA","BSD","BSG","BSH","BSL","BSP","BSQ","BTB","BTD","BTG","BTH","BTN","BTU","BTV","BVB","BVG"
    "BVL","BVN","BWA","BWS","CAB","CAD","CAT","CBI","CBS","CCA","CCM","CCP","CCT","CCV","CDG","CDH","CDO","CDP"
    "CDR","CEG","CEN","CFM","CFV","CGV","CHC","CHS","CID","CIP","CKA","CKD","CLG","CLX","CMD","CMF","CMI","CMK"
    "CMM","CMN","CMP","CMT","CMW","CNA","CNC","CNN","CNT","CPA","CPH","CPI","CQN","CQT","CSI","CTW","CYC","DAC"
    "DAN","DAS","DBM","DCF","DCG","DCH","DCR","DCS","DCT","DDB","DDH","DDM","DDN","DDV","DFC","DFF","DGT","DHB"
    "DHD","DHN","DIC","DID","DKC","DKG","DKW","DLD","DLR","DLT","DMN","DMS","DNA","DND","DNE","DNH","DNL","DNM"
    "DNN","DNT","DNW","DOC","DOP","DPC","DPH","DPP","DPS","DRG","DRI","DSD","DSG","DSH","DSP","DTB","DTC","DTE"
    "DTH","DTI","DTP","DUS","DVC","DVG","DVN","DVW","DWC","DWS","DXL","DZM","ECO","EFI","EIC","EIN","EME","EMG"
    "EMS","EPC","EPH","FBC","FCC","FCS","FGL","FHN","FHS","FIC","FLC","FOC","FOX","FRC","FRM","FSO","FTI","FTM"
    "GAB","GCB","GCF","GDA","GER","GGG","GHC","GLC","GLW","GMC","GND","GPC","GSM","GTD","GTS","GVT","HAC","HAF"
    "HAM","HAN","HAV","HBC","HBD","HBH","HCB","HCI","HDM","HDP","HDS","HDW","HEC","HEJ","HEP","HES","HFB","HFC"
    "HFX","HGT","HHG","HHN","HIG","HIO","HJC","HKB","HLB","HLO","HLS","HLT","HLY","HMD","HMG","HMS","HNB","HND"
    "HNF","HNG","HNI","HNM","HNP","HNR","HOT","HPB","HPD","HPH","HPI","HPM","HPP","HPT","HPW","HRB","HRT","HSA"
    "HSI","HSM","HSP","HSV","HTE","HTM","HTP","HTT","HUG","HVA","HWS","IBD","ICC","ICF","ICI","ICN","IDP","IFS"
    "IHK","ILA","ILC","ILS","IME","ING","IRC","ISG","ISH","IST","ITA","ITS","JOS","KCB","KCE","KGM","KHD","KHW"
    "KIP","KLB","KSH","KTC","KTL","KTT","KTW","KVC","KWA","LAI","LAW","LCC","LCM","LCS","LDW","LEC","LGM","LIC"
    "LKW","LLM","LMC","LMH","LMI","LNC","LPT","LQN","LSG","LTC","LTG","LUT","MBN","MBT","MCG","MCH","MDA","MDF"
    "MEC","MEF","MES","MFS","MGC","MGG","MGR","MIC","MIE","MKP","MLC","MLS","MML","MNB","MND","MPC","MPT","MPY"
    "MQB","MQN","MRF","MSR","MTA","MTB","MTC","MTG","MTH","MTL","MTP","MTS","MTV","MTX","MVC","MVN","MZG","NAC"
    "NAS","NAU","NAW","NBE","NBT","NCG","NCS","NDC","NDP","NDT","NDW","NED","NEM","NGC","NHP","NHV","NJC","NLS"
    "NNG","NNT","NOS","NQB","NQN","NQT","NSG","NSL","NSS","NTC","NTF","NTT","NTW","NUE","NVP","NWT","NXT","ODE"
    "OIL","ONW","PAI","PAP","PAS","PAT","PBC","PBT","PCC","PCF","PCM","PDC","PDV","PEC","PEG","PEQ","PFL","PGB"
    "PHH","PHP","PHS","PIS","PIV","PJS","PLA","PLE","PLO","PMJ","PMT","PMW","PND","PNG","PNP","PNT","POB","POM"
    "POS","POV","PPH","PPI","PQN","PRO","PRT","PSB","PSG","PSL","PSN","PSP","PTE","PTG","PTH","PTN","PTO","PTP"
    "PTT","PTV","PVA","PVE","PVH","PVL","PVM","PVO","PVR","PVV","PVX","PVY","PWA","PWS","PXA","PXC","PXI","PXL"
    "PXM","PXS","PXT","QBS","QCC","QHW","QNC","QNS","QNT","QNU","QNW","QPH","QSP","QTP","RAT","RBC","RCC","RCD"
    "RDP","RIC","RTB","SAC","SAL","SAP","SAS","SBB","SBD","SBH","SBL","SBM","SBR","SBS","SCC","SCD","SCJ","SCL"
    "SCO","SCY","SDD","SDJ","SDK","SDP","SDT","SDV","SDY","SEA","SEP","SGB","SGI","SGP","SGS","SHC","SHG","SHX"
    "SID","SIG","SII","SIV","SJC","SJF","SJG","SJM","SKH","SKN","SKV","SNC","SNZ","SPB","SPD","SPH","SPV","SQC"
    "SRB","SRT","SSF","SSG","SSH","SSN","STH","STS","STT","STW","SVG","SVH","SWC","SZE","SZG","TAB","TAL","TAN"
    "TAR","TAW","TBD","TBH","TBR","TBW","TCJ","TCK","TCW","TDB","TDF","TDI","TDS","TED","TEL","TGP","THM","THN"
    "THP","THU","THW","TID","TIE","TIS","TKA","TKC","TKG","TLI","TLP","TLT","TMG","TMW","TNA","TNB","TNP","TNS"
    "TNV","TNW","TOP","TOS","TOW","TPS","TQN","TQW","TRS","TRT","TSA","TSD","TSG","TSJ","TST","TTD","TTG","TTN"
    "TTP","TTS","TUG","TVA","TVG","TVH","TVM","TVN","TVP","UCT","UDC","UDJ","UDL","UEM","UMC","UPC","UPH","USC"
    "USD","UXC","VAB","VAV","VBB","VBG","VBH","VCE","VCP","VCR","VCT","VCW","VCX","VDB","VDG","VDN","VDT","VEA"
    "VEC","VEF","VES","VET","VFC","VFR","VGG","VGI","VGL","VGR","VGT","VGV","VHD","VHF","VHG","VHH","VIE","VIH"
    "VIM","VIN","VIR","VIW","VKC","VKP","VLB","VLC","VLF","VLG","VLP","VLW","VMA","VMG","VMK","VMT","VNA","VNB"
    "VNH","VNP","VNX","VNY","VNZ","VOC","VPA","VPC","VPR","VPW","VQC","VRG","VSE","VSF","VSG","VSN","VST","VTA"
    "VTD","VTE","VTG","VTI","VTK","VTL","VTM","VTQ","VTR","VTS","VTX","VUA","VVN","VVS","VWS","VXB","VXP","VXT"
    "WSB","WTC","XDC","XDH","XHC","XLV","XMC","XMD","XMP","XPH","YBC","YTC"
)

# Hàm phân tích tin tức bằng Gemini API (Kiến trúc Agent 1: Phân tích + Agent 2: Phản biện)
function Analyze-NewsItem {
    param (
        [PSCustomObject]$NewsItem,
        [string]$ApiKey
    )
    
    $Title = $NewsItem.Title
    $Description = $NewsItem.Description
    $Source = $NewsItem.Source
    $PubDate = $NewsItem.PubDate
    $Link = $NewsItem.Link

    Write-Log "Đang gửi phân tích cho tin: '$Title'..." "INFO"

    # ========== SYSTEM PROMPT (role: system) ==========
    $SystemPrompt = @"
Bạn là một Chuyên gia Phân tích Dữ liệu Chứng khoán Việt Nam (VN-Index).
Nhiệm vụ của bạn là đọc các bản tin kinh tế, vĩ mô, hoặc doanh nghiệp và trích xuất các mã cổ phiếu (tickers) bị tác động.

QUY TẮC CỐT LÕI:
1. Chỉ trích xuất các mã cổ phiếu đang niêm yết trên HOSE, HNX, UPCOM. Không tự bịa mã cổ phiếu.
2. Suy luận tác động theo tư duy logic: Tin tức -> Ngành/Vĩ mô -> Doanh nghiệp cụ thể.
3. Phân biệt rõ thời gian tác động (Short-term: tính bằng tuần/tháng, Long-term: tính bằng năm).
4. KHÔNG trả lời bằng văn bản thông thường. CHỈ trả về dữ liệu dưới định dạng JSON nguyên chuẩn.

QUY TẮC PHÂN TÍCH MÃ CỔ PHIẾU BỊ ẢNH HƯỞNG:
- ĐỐI CHIẾU TÊN DOANH NGHIỆP: Tập đoàn Hòa Phát -> HPG, Vinhomes -> VHM, Phát Đạt -> PDR, Vinamilk -> VNM, Vietcombank -> VCB, FPT -> FPT, SSI -> SSI, Novaland -> NVL, VNDirect -> VND, Thế giới Di động -> MWG, Masan -> MSN, Sabeco -> SAB, PV Gas -> GAS, PV Drilling -> PVD, Lọc Hóa dầu Bình Sơn -> BSR, v.v.
- PHÂN TÍCH TÁC ĐỘNG NGÀNH (nếu không nêu cụ thể doanh nghiệp, điền mã Market Leaders):
  Ngành Thép: HPG, HSG, NKG | Ngân hàng: VCB, TCB, BID, CTG, MBB, VPB, STB, ACB | BĐS: VHM, PDR, DXG, KDH, DIG, NLG, NVL | Chứng khoán: SSI, VND, VCI, HCM | Dầu khí: PVS, PVD, BSR, GAS, PLX | Năng lượng: POW, REE, PC1, GEG | Thủy sản: VHC, ANV, IDI | Dệt may: TNG, MSH, VGT | Cảng biển: GMD, HAH, VSC | Bán lẻ: MWG, FRT, MSN, DGW, PNJ | CNTT: FPT, CMG
- PHÂN TÍCH VĨ MÔ: Lãi suất giảm -> SSI, VND, VHM, PDR. Tỷ giá tăng -> POW (tiêu cực), VHC, TNG (tích cực). FDI tăng -> KBC, GVR, SZC, GMD.

QUY TẮC CHỐNG NHIỄU (BẮT BUỘC):
- Nếu tin tức chỉ là thông tin hành chính (thay đổi địa chỉ trụ sở, bổ nhiệm nhân sự cấp thấp), tin đồn không căn cứ, hoặc không có tác động rõ ràng đến biên lợi nhuận/doanh thu/hoạt động kinh doanh của bất kỳ doanh nghiệp nào, bạn BẮT BUỘC phải trả về mảng AffectedTickers rỗng ([]). Tuyệt đối không suy diễn gượng ép.
- Nếu tin tức quốc tế chỉ liên quan đến thị trường nước ngoài / doanh nghiệp nước ngoài (như Apple, Tesla, Nvidia, Dow Jones...) mà không ảnh hưởng trực tiếp hay gián tiếp đến thị trường chứng khoán Việt Nam, bạn BẮT BUỘC đặt Relevance là 'Không liên quan' và trả AffectedTickers rỗng.
- Giới hạn tối đa 5 mã cổ phiếu bị ảnh hưởng cho mỗi tin bài.

VÍ DỤ MẪU (FEW-SHOT):

[Tin tức]: "Giá thép HRC giao ngay tại Trung Quốc tiếp tục phá đáy 2 năm do nhu cầu xây dựng suy yếu."
[Đầu ra]:
{"Title":"Giá thép HRC tại TQ phá đáy 2 năm","Source":"Reuters","Link":"#","PubDate":"2026-06-30","Sentiment":"Tiêu cực","ImpactScore":-6,"MarketImpact":"Giá HRC giảm mạnh làm giảm giá trị hàng tồn kho và thu hẹp biên lợi nhuận gộp của các DN thép Việt Nam, đặc biệt nhóm tôn mạ xuất khẩu.","Relevance":"Cao","AffectedTickers":[{"Ticker":"NKG","ImpactType":"Tiêu cực","Reasoning":"Giá HRC giảm mạnh thu hẹp biên lợi nhuận mảng tôn mạ xuất khẩu, rủi ro trích lập dự phòng hàng tồn kho."},{"Ticker":"HSG","ImpactType":"Tiêu cực","Reasoning":"Tương tự NKG, mảng tôn mạ chịu rủi ro trích lập dự phòng giảm giá hàng tồn kho."},{"Ticker":"HPG","ImpactType":"Tiêu cực","Reasoning":"Mặc dù HPG tiêu thụ nội địa là chính, giá HRC giảm tạo áp lực cạnh tranh từ thép nhập khẩu giá rẻ."}]}

[Tin tức]: "NHNN yêu cầu các TCTD tiếp tục giảm lãi suất cho vay để hỗ trợ BĐS phục hồi cuối năm."
[Đầu ra]:
{"Title":"NHNN chỉ đạo giảm lãi suất cho vay hỗ trợ BĐS","Source":"VnExpress","Link":"#","PubDate":"2026-06-30","Sentiment":"Tích cực","ImpactScore":7,"MarketImpact":"Chính sách nới lỏng tiền tệ giúp giảm chi phí vốn vay cho DN BĐS và kích thích nhu cầu mua nhà, đồng thời hỗ trợ thanh khoản thị trường chứng khoán.","Relevance":"Cao","AffectedTickers":[{"Ticker":"VHM","ImpactType":"Tích cực","Reasoning":"DN BĐS lớn nhất hưởng lợi trực tiếp từ giảm chi phí vay và tăng nhu cầu mua nhà."},{"Ticker":"PDR","ImpactType":"Tích cực","Reasoning":"Chi phí vay vốn giảm giúp giảm áp lực tài chính cho DN BĐS có đòn bẩy cao."},{"Ticker":"SSI","ImpactType":"Tích cực","Reasoning":"Lãi suất giảm thúc đẩy dòng tiền chảy vào TTCK, tăng doanh thu môi giới và margin lending."}]}

[Tin tức]: "Bộ Xây dựng ban hành quy định mới về quản lý nhà chung cư thay thế Thông tư cũ."
[Đầu ra]:
{"Title":"Quy định mới về quản lý nhà chung cư","Source":"Tuổi Trẻ","Link":"#","PubDate":"2026-06-30","Sentiment":"Trung lập","ImpactScore":0,"MarketImpact":"Thông tin hành chính về quản lý vận hành nhà chung cư, không tác động trực tiếp đến hoạt động kinh doanh hay biên lợi nhuận của các DN BĐS niêm yết.","Relevance":"Thấp","AffectedTickers":[]}
"@

    # ========== USER PROMPT (role: user) ==========
    $UserPrompt = @"
Hãy phân tích tin tức sau và trả về kết quả JSON theo đúng cấu trúc đã hướng dẫn:

Tin tức:
- Tiêu đề: $Title
- Tóm tắt/Nội dung: $Description
- Nguồn tin: $Source
- Ngày đăng: $PubDate

Cấu trúc JSON bắt buộc (CHỈ trả về JSON, không kèm văn bản):
{
  "Title": "$($Title -replace '"', '\"')",
  "Source": "$($Source -replace '"', '\"')",
  "Link": "$($Link -replace '"', '\"')",
  "PubDate": "$($PubDate -replace '"', '\"')",
  "Sentiment": "Tích cực" hoặc "Tiêu cực" hoặc "Trung lập",
  "ImpactScore": (số nguyên từ -10 đến 10),
  "MarketImpact": "Giải thích tác động bằng tiếng Việt.",
  "Relevance": "Cao" hoặc "Trung bình" hoặc "Thấp" hoặc "Không liên quan",
  "AffectedTickers": [
    {
      "Ticker": "MÃ_CỔ_PHIẾU",
      "ImpactType": "Tích cực" hoặc "Tiêu cực" hoặc "Trung lập",
      "Reasoning": "Giải thích logic tác động ngắn gọn."
    }
  ]
}
"@

    # ========== GỌI API GEMINI VỚI SYSTEM + USER ROLE ==========
    $Uri = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=$ApiKey"
    
    $RequestBody = @{
        systemInstruction = @{
            parts = @(
                @{ text = $SystemPrompt }
            )
        }
        contents = @(
            @{
                role = "user"
                parts = @(
                    @{ text = $UserPrompt }
                )
            }
        )
        generationConfig = @{
            responseMimeType = "application/json"
            temperature = 0.15
        }
    } | ConvertTo-Json -Depth 10

    # Chuyển đổi body thành bytes UTF-8 để giữ nguyên dấu tiếng Việt khi gọi API
    $BodyBytes = [System.Text.Encoding]::UTF8.GetBytes($RequestBody)
    
    $MaxRetries = 5
    $RetryCount = 0
    $Success = $false
    $Analysis = $null

    while (-not $Success -and $RetryCount -lt $MaxRetries) {
        try {
            $ApiResponse = Invoke-RestMethod -Uri $Uri -Method Post -Headers @{ "Content-Type" = "application/json; charset=utf-8" } -Body $BodyBytes -TimeoutSec 30
            $RawText = $ApiResponse.candidates[0].content.parts[0].text
            
            # Parse JSON từ AI
            $Analysis = $RawText | ConvertFrom-Json
            $Analysis | Add-Member -MemberType NoteProperty -Name "AnalyzedAt" -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            $Success = $true
        } catch {
            $RetryCount++
            $ErrMsg = $_.Exception.Message
            Write-Log "Lỗi API phân tích tin (Lần $RetryCount/$MaxRetries): $ErrMsg" "WARNING"

            if ($RetryCount -lt $MaxRetries) {
                $SleepSecs = $RetryCount * 15
                Write-Log "Chờ $SleepSecs giây rồi thử lại..." "INFO"
                Start-Sleep -Seconds $SleepSecs
            }
        }
    }

    if (-not $Success -or $null -eq $Analysis) {
        return $null
    }

    # ========== BƯỚC XÁC THỰC: Lọc mã cổ phiếu không hợp lệ (Ticker Whitelist Validation) ==========
    if ($Analysis.PSObject.Properties.Name -contains "AffectedTickers" -and $null -ne $Analysis.AffectedTickers) {
        $OriginalCount = $Analysis.AffectedTickers.Count
        $ValidatedTickers = @()
        foreach ($TickerItem in $Analysis.AffectedTickers) {
            $TickerCode = ($TickerItem.Ticker -replace '\s','').ToUpper()
            if ($ValidTickers -contains $TickerCode) {
                $TickerItem.Ticker = $TickerCode
                $ValidatedTickers += $TickerItem
            } else {
                Write-Log "Loại bỏ mã không hợp lệ '$($TickerItem.Ticker)' khỏi kết quả phân tích." "WARNING"
            }
        }
        $Analysis.AffectedTickers = $ValidatedTickers
        $FilteredCount = $ValidatedTickers.Count
        if ($OriginalCount -ne $FilteredCount) {
            Write-Log "Đã lọc ticker: $OriginalCount -> $FilteredCount mã hợp lệ." "INFO"
        }
    }

    # ========== AGENT 2: PHẢN BIỆN (Critique Node) ==========
    # Chỉ chạy nếu có AffectedTickers và tin có Relevance Cao/Trung bình
    $Relevance = ($Analysis.Relevance -replace '\s','').ToLower()
    $HasTickers = ($null -ne $Analysis.AffectedTickers -and $Analysis.AffectedTickers.Count -gt 0)
    
    if ($HasTickers -and ($Relevance -eq "cao" -or $Relevance -eq "trungbình" -or $Relevance -eq "high" -or $Relevance -eq "medium")) {
        Write-Log "Khởi chạy Agent Phản biện (Critique) cho tin: '$Title'..." "INFO"
        
        $TickerSummary = ($Analysis.AffectedTickers | ForEach-Object { "$($_.Ticker) ($($_.ImpactType)): $($_.Reasoning)" }) -join "`n"
        
        $CritiqueSystemPrompt = @"
Bạn là Giám đốc Quản lý Rủi ro tại một quỹ đầu tư chứng khoán Việt Nam.
Nhiệm vụ: Nhận kết quả phân tích của Agent Phân tích và PHẢN BIỆN tính logic của nó.
CHỈ trả về JSON. Không giải thích bằng văn bản.
"@

        $CritiqueUserPrompt = @"
Tin tức gốc: "$Title" - $Description

Kết quả phân tích của Agent 1:
- Sentiment: $($Analysis.Sentiment), ImpactScore: $($Analysis.ImpactScore)
- MarketImpact: $($Analysis.MarketImpact)
- Các mã bị ảnh hưởng:
$TickerSummary

Hãy đánh giá tính logic của kết quả trên. Trả về JSON theo cấu trúc:
{
  "verdict": "Approve" hoặc "Revise",
  "revised_sentiment": "Tích cực" hoặc "Tiêu cực" hoặc "Trung lập" (chỉ điền nếu verdict là Revise),
  "revised_score": (số nguyên -10 đến 10, chỉ điền nếu verdict là Revise),
  "tickers_to_remove": ["MÃ1", "MÃ2"] (danh sách mã nên loại bỏ vì suy diễn gượng ép, để [] nếu không có),
  "critique_note": "Nhận xét ngắn gọn của bạn về chất lượng phân tích."
}
"@

        $CritiqueBody = @{
            systemInstruction = @{
                parts = @( @{ text = $CritiqueSystemPrompt } )
            }
            contents = @(
                @{
                    role = "user"
                    parts = @( @{ text = $CritiqueUserPrompt } )
                }
            )
            generationConfig = @{
                responseMimeType = "application/json"
                temperature = 0.1
            }
        } | ConvertTo-Json -Depth 10

        $CritiqueBytes = [System.Text.Encoding]::UTF8.GetBytes($CritiqueBody)

        try {
            Start-Sleep -Seconds 4  # Tránh rate limit
            $CritiqueResponse = Invoke-RestMethod -Uri $Uri -Method Post -Headers @{ "Content-Type" = "application/json; charset=utf-8" } -Body $CritiqueBytes -TimeoutSec 30
            $CritiqueRaw = $CritiqueResponse.candidates[0].content.parts[0].text
            $Critique = $CritiqueRaw | ConvertFrom-Json

            Write-Log "Agent Phản biện: Verdict=$($Critique.verdict), Note=$($Critique.critique_note)" "INFO"

            # Áp dụng sửa đổi nếu Agent 2 yêu cầu Revise
            if ($Critique.verdict -eq "Revise") {
                if ($Critique.revised_sentiment) {
                    Write-Log "Phản biện sửa Sentiment: $($Analysis.Sentiment) -> $($Critique.revised_sentiment)" "INFO"
                    $Analysis.Sentiment = $Critique.revised_sentiment
                }
                if ($null -ne $Critique.revised_score) {
                    Write-Log "Phản biện sửa ImpactScore: $($Analysis.ImpactScore) -> $($Critique.revised_score)" "INFO"
                    $Analysis.ImpactScore = $Critique.revised_score
                }
                if ($Critique.tickers_to_remove -and $Critique.tickers_to_remove.Count -gt 0) {
                    $BeforeCount = $Analysis.AffectedTickers.Count
                    $Analysis.AffectedTickers = @($Analysis.AffectedTickers | Where-Object { $Critique.tickers_to_remove -notcontains $_.Ticker })
                    Write-Log "Phản biện loại bỏ $($BeforeCount - $Analysis.AffectedTickers.Count) mã suy diễn gượng ép." "INFO"
                }
            }
        } catch {
            Write-Log "Agent Phản biện gặp lỗi (bỏ qua, giữ kết quả Agent 1): $($_.Exception.Message)" "WARNING"
        }
    }

    return $Analysis
}

# Tạo Báo cáo Phân tích Tổng hợp Hàng ngày
function Generate-DailyReport {
    Write-Log "Bắt đầu tạo Báo cáo Phân tích Tổng hợp hàng ngày..." "INFO"
    $ResultsFile = Join-Path $ScriptDir "data/analysis_results.json"
    $ReportFile = Join-Path $ScriptDir "data/daily_report.md"

    if (-not (Test-Path $ResultsFile)) {
        Write-Log "Không tìm thấy dữ liệu để tổng hợp báo cáo." "WARNING"
        return
    }

    $Results = Get-Content -Path $ResultsFile -Raw | ConvertFrom-Json
    if ($Results.Count -eq 0) {
        Write-Log "Dữ liệu trống, không thể tạo báo cáo." "WARNING"
        return
    }

    # Lấy 15 tin mới nhất để làm báo cáo
    $LatestItems = $Results | Sort-Object -Property AnalyzedAt -Descending | Select-Object -First 15

    $TinTucText = ""
    foreach ($Item in $LatestItems) {
        $AffectedTickersList = @()
        if ($Item.AffectedTickers) {
            foreach ($TickerObj in $Item.AffectedTickers) {
                $AffectedTickersList += "$($TickerObj.Ticker) ($($TickerObj.ImpactType): $($TickerObj.Reasoning))"
            }
        }
        
        $TinTucText += @"
- Tiêu đề: $($Item.Title)
  Nguồn: $($Item.Source)
  Ngày phân tích: $($Item.AnalyzedAt)
  Tâm lý chung: $($Item.Sentiment) (Điểm tác động: $($Item.ImpactScore))
  Mã cổ phiếu bị tác động: $($AffectedTickersList -join '; ')
  Tóm tắt tác động thị trường: $($Item.MarketImpact)

"@
    }

    # Đọc API Key
    $Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
    $ApiKey = $Config.GeminiApiKey
    if ($ApiKey -eq "YOUR_GEMINI_API_KEY" -or [string]::IsNullOrEmpty($ApiKey)) {
        $ApiKey = $env:GEMINI_API_KEY
    }

    $Prompt = @"
Bạn là một chuyên gia phân tích tài chính vĩ mô và chứng khoán cao cấp tại Việt Nam.
Hãy lập một "BÁO CÁO PHÂN TÍCH TỔNG HỢP & DỰ BÁO THỊ TRƯỜNG CHỨNG KHOÁN" chi tiết dựa trên danh sách các tin tức đã quét và phân tích sơ bộ sau đây:

$TinTucText

YÊU CẦU CẤU TRÚC VÀ PHƯƠNG PHÁP BÁO CÁO (VIẾT CHI TIẾT, KHÔNG TÓM TẮT SƠ SÀI):

## TÓM TẮT TÂM LÝ THỊ TRƯỜNG CHUNG (OVERVIEW)
- Nhận định ngắn về điểm số tâm lý thị trường chung dựa trên tổng quan điểm số của các tin tức đầu vào. Đánh giá trạng thái chung (Tích cực, Tiêu cực hay Trung lập).

## BƯỚC 1: SÀNG LỌC & XÁC ĐỊNH ĐỘ TRỌNG YẾU (SCREENING)
- Liệt kê và phân tích rõ các tin nào thực sự có tác động mạnh (Trọng yếu) đến ngành hoặc giá cổ phiếu, lý giải tại sao. Loại bỏ các tin tức PR quảng cáo mang tính chất nhiễu. Xác định mức độ trọng yếu (Cao / Trung bình / Thấp) cho từng tin chính.

## BƯỚC 2: PHÂN TÍCH CHUYÊN SÂU THEO NGÀNH (SECTOR ANALYSIS - KHUNG ĐẦY ĐỦ)
- Trình bày rõ ràng theo NGÀNH (mỗi ngành một mục lớn, ví dụ: Bất động sản, Chứng khoán, Ngân hàng, Thép, Năng lượng, Vĩ mô...).
- Trong mỗi ngành, sắp xếp các tin tức có mức độ tác động mạnh lên đầu tiên.
- Với mỗi tin tức lớn, phân tích đầy đủ các lớp sau:
  + Bản chất sự kiện: Nêu rõ các số liệu kinh tế vĩ mô hoặc số liệu doanh nghiệp (các con số, sự kiện phải lấy từ nguồn của danh sách tin đầu vào, tuyệt đối không bịa số liệu).
  + Tác động vĩ mô / ngành: Phân tích kỹ cơ chế truyền dẫn tác động lên ngành và lý giải nguyên nhân tăng/giảm.
  + Tác động trực tiếp lên giá cổ phiếu của các mã cụ thể (nêu rõ các mã bị ảnh hưởng trực tiếp như VIX, PDR, HPG, SSI, v.v.).
- Sử dụng BẢNG số liệu đối chiếu khi so sánh nhiều mã cổ phiếu hoặc nhiều nguồn số liệu khác nhau để báo cáo trông chuyên nghiệp, dễ so sánh.

## RÀNG BUỘC PHÁP LÝ & AN TOÀN
- KHÔNG tự bịa số liệu hay mã cổ phiếu không liên quan. Thiếu dữ kiện phải ghi rõ "chưa xác nhận / chưa có số liệu".
- Đầu ra trả về dưới dạng Markdown chuẩn, trình bày sạch sẽ, trực quan, chuyên nghiệp, sử dụng biểu tượng emoji phù hợp để tăng tính sinh động.
"@

    $Uri = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=$ApiKey"
    $RequestBody = @{
        contents = @(
            @{
                parts = @(
                    @{ text = $Prompt }
                )
            }
        )
    } | ConvertTo-Json -Depth 5

    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($RequestBody)

    $MaxRetries = 5
    $RetryCount = 0
    $Success = $false
    $ReportMarkdown = ""

    while (-not $Success -and $RetryCount -lt $MaxRetries) {
        try {
            $Response = Invoke-RestMethod -Uri $Uri -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $Bytes -TimeoutSec 90
            $ReportMarkdown = $Response.candidates[0].content.parts[0].text
            if ($null -ne $ReportMarkdown -and $ReportMarkdown.Trim() -ne "") {
                $Success = $true
            }
        }
        catch {
            $RetryCount++
            $ErrMsg = $_.Exception.Message
            Write-Log "Lỗi API tạo báo cáo (Lần $RetryCount/$MaxRetries): $ErrMsg" "WARNING"

            if ($RetryCount -lt $MaxRetries) {
                # Giãn cách tăng dần: 20s, 40s, 60s, 80s
                $SleepSecs = $RetryCount * 20
                Write-Log "Chờ $SleepSecs giây rồi thử lại..." "INFO"
                Start-Sleep -Seconds $SleepSecs
            }
        }
    }

    if ($Success) {
        [System.IO.File]::WriteAllText($ReportFile, $ReportMarkdown, [System.Text.Encoding]::UTF8)
        Write-Log "Đã tạo thành công Báo cáo Phân tích Tổng hợp hàng ngày tại $ReportFile!" "SUCCESS"
    } else {
        Write-Log "Không thể tạo báo cáo tổng hợp sau $MaxRetries lần thử." "ERROR"
    }
}

# Tiến hành quét
function Start-Scan {
    # Tải lại file config để nhận cập nhật nếu có thay đổi
    $Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
    $ApiKey = $Config.GeminiApiKey
    
    if ($ApiKey -eq "YOUR_GEMINI_API_KEY" -or [string]::IsNullOrEmpty($ApiKey)) {
        $ApiKey = $env:GEMINI_API_KEY
    }

    if ([string]::IsNullOrEmpty($ApiKey)) {
        Write-Log "Chưa cấu hình API Key. Bỏ qua lượt quét này." "WARNING"
        return
    }

    Write-Log "Bắt đầu chu kỳ quét mới..." "INFO"
    $AllNewItems = @()

    foreach ($Feed in $Config.RssFeeds) {
        $Items = Get-RssFeedItems -FeedUrl $Feed.Url -Source $Feed.Name
        Write-Log "Tìm thấy $($Items.Count) tin tức từ $($Feed.Name)." "INFO"

        $NewFeedItems = @()
        foreach ($Item in $Items) {
            # Tạo hash hoặc dùng link làm định danh
            $UniqueId = $Item.Link
            if ($Force -or ($History -notcontains $UniqueId)) {
                $NewFeedItems += $Item
            }
        }
        
        # Giới hạn số lượng tin mới quét mỗi feed để tránh quá tải
        $Limit = [Math]::Min($NewFeedItems.Count, $Config.MaxItemsPerScan)
        if ($NewFeedItems.Count -gt 0) {
            Write-Log "Phát hiện $($NewFeedItems.Count) tin mới từ $($Feed.Name). Sẽ phân tích $Limit tin mới nhất." "INFO"
            for ($i = 0; $i -lt $Limit; $i++) {
                $AllNewItems += $NewFeedItems[$i]
            }
        }
    }

    Write-Log "Tổng số tin tức mới cần phân tích trên tất cả các kênh: $($AllNewItems.Count)" "INFO"

    $ProcessedCount = 0
    foreach ($Item in $AllNewItems) {
        # Phân tích qua Gemini
        $Analysis = Analyze-NewsItem -NewsItem $Item -ApiKey $ApiKey
        
        if ($Analysis -ne $null) {
            # Bỏ qua các tin tức không liên quan (ví dụ tin thuần chứng khoán quốc tế)
            if ($Analysis.Relevance -eq "Không liên quan" -or $Analysis.Relevance -eq "Unrelated") {
                Write-Log "Bỏ qua tin tức thuần quốc tế: '$($Item.Title)'" "INFO"
                # Thêm tin vào lịch sử để không phân tích lại nữa
                $History = @($History) + $Item.Link
                if ($History.Count -eq 1) {
                    $HistoryJson = "[$((ConvertTo-Json $History[0]).Trim())]"
                } else {
                    $HistoryJson = ConvertTo-Json $History
                }
                [System.IO.File]::WriteAllText($HistoryFile, $HistoryJson, [System.Text.Encoding]::UTF8)
                continue
            }

            # Thêm kết quả vào đầu mảng kết quả (tin mới nhất hiển thị trên cùng)
            $Results = @($Analysis) + $Results
            
            # Giới hạn số lượng kết quả lưu trữ tối đa (ví dụ giữ lại 1000 tin mới nhất để lưu lịch sử tốt hơn)
            if ($Results.Count -gt 1000) {
                $Results = $Results[0..999]
            }

            # Ghi kết quả xuống file JSON
            $ResultsJson = ConvertTo-Json $Results -Depth 10
            [System.IO.File]::WriteAllText($ResultsFile, $ResultsJson, [System.Text.Encoding]::UTF8)

            # Thêm tin vào lịch sử để không phân tích lại
            $History = @($History) + $Item.Link
            if ($History.Count -eq 1) {
                $HistoryJson = "[$((ConvertTo-Json $History[0]).Trim())]"
            } else {
                $HistoryJson = ConvertTo-Json $History
            }
            [System.IO.File]::WriteAllText($HistoryFile, $HistoryJson, [System.Text.Encoding]::UTF8)

            $ProcessedCount++
            Write-Log "Đã phân tích thành công: '$($Item.Title)' (Sentiment: $($Analysis.Sentiment))" "SUCCESS"
            
            # Delay để tránh rate limit (8 giây = tối đa ~7.5 lần/phút, an toàn cho 15 RPM)
            Start-Sleep -Seconds 8
        } else {
            Write-Log "Phân tích thất bại cho tin: '$($Item.Title)'. Sẽ thử lại ở phiên sau." "WARNING"
        }
    }

    Write-Log "Hoàn thành quét chu kỳ này. Đã xử lý $ProcessedCount/$($AllNewItems.Count) tin mới." "SUCCESS"
    
    # Tạo Báo cáo Phân tích Tổng hợp hàng ngày (chờ 20 giây để API "nguội" trước khi gọi)
    Write-Log "Chờ 20 giây để API ổn định trước khi tạo báo cáo..." "INFO"
    Start-Sleep -Seconds 20
    Generate-DailyReport
}

# Vòng lặp chính
if ($OneShot) {
    Write-Log "Đang chạy chế độ One-Shot (chạy một lần)..." "INFO"
    Start-Scan
} else {
    Write-Log "Đang chạy chế độ tự động chạy định kỳ..." "INFO"
    Write-Log "Nhấn Ctrl + C để dừng Agent." "WARNING"
    while ($true) {
        try {
            Start-Scan
        } catch {
            Write-Log "Lỗi không mong muốn trong chu kỳ quét: $_" "ERROR"
        }
        
        $Interval = $Config.ScanIntervalSeconds
        Write-Log "Chờ $Interval giây trước phiên quét kế tiếp..." "INFO"
        Start-Sleep -Seconds $Interval
    }
}
