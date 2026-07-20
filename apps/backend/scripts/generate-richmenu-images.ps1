# Generates the two Rich Menu background images LINE requires (2500x1686 PNG)
# for FR-2.1's "unregistered" and "registered" menus. Plain solid-color +
# centered label — functional placeholders, not a design deliverable.
Add-Type -AssemblyName System.Drawing

function New-RichMenuImage {
    param(
        [string]$Text,
        [string]$OutPath,
        [string]$BgColorHex
    )
    $width = 2500
    $height = 1686
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bgColor = [System.Drawing.ColorTranslator]::FromHtml($BgColorHex)
    $g.Clear($bgColor)

    $font = New-Object System.Drawing.Font("Leelawadee UI", 130, [System.Drawing.FontStyle]::Bold)
    $brush = [System.Drawing.Brushes]::White
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF(0, 0, $width, $height)
    $g.DrawString($Text, $font, $brush, $rect, $format)

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $font.Dispose()
}

$dir = Join-Path $PSScriptRoot "assets"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

New-RichMenuImage -Text "ลงทะเบียน" -OutPath (Join-Path $dir "richmenu-unregistered.png") -BgColorHex "#0f766e"
New-RichMenuImage -Text "ถามคำถาม HR" -OutPath (Join-Path $dir "richmenu-registered.png") -BgColorHex "#134e4a"

Write-Output "Generated richmenu-unregistered.png and richmenu-registered.png in $dir"

