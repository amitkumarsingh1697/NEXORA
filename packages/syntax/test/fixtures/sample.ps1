Import-Module ./Store.psm1
. ./common.ps1

class Cart {
    [int] Add([string] $Sku, [int] $Qty) {
        $this.Check($Sku)
        $total = Get-Helper -N $Qty
        return $total
    }
    [bool] Check([string] $Sku) { return $Sku.Length -gt 0 }
}

function Get-Helper {
    param([int] $N, [string] $Name = "x")
    Write-Output ($N * 2)
}

Get-Helper -N 3
