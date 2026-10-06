package ai.domovina.bankpush

// Zadani allowlist: paketi bankovnih aplikacija (docs/research.md).
// Obavijesti svih ostalih aplikacija se ignoriraju i nigdje ne spremaju.
object BankPackages {
    val DEFAULT: Set<String> = setOf(
        "co.infinum.hpb",                       // HPB mHPB
        "co.infinum.rba.eva",                   // RBA mojaRBA
        "hr.erstebank.george",                  // Erste George
        "hr.asseco.android.zaba.new",           // ZABA m-zaba
        "hr.asseco.android.intesa.isbd.pbz",    // PBZ mobile
        "hr.pbz.digi4biz",                      // PBZ poslovni
        "hr.asseco.android.ae.otp",             // OTPgo
        "com.comtrade.HYPOnetmBankarstvo",      // Addiko
    )
}
