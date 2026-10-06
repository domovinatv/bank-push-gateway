plugins {
    id("com.android.application")
}

android {
    namespace = "ai.domovina.bankpush"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.domovina.bankpush"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

// Namjerno bez ovisnosti (osim Kotlin stdliba): kod na telefonu s bankovnom
// sesijom mora biti mali i pregledan (vidi CLAUDE.md §Sigurnost).
dependencies {
    testImplementation("junit:junit:4.13.2")
}
