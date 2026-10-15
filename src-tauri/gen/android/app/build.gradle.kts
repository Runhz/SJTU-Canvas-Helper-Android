import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.canvas.sjtu.mobile"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.canvas.sjtu.mobile"
        minSdk = 29
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    val signingPath = System.getenv("CANVAS_KEYSTORE_PATH")
    signingConfigs {
        if (!signingPath.isNullOrBlank()) {
            create("publicRelease") {
                storeFile = file(signingPath)
                storePassword = System.getenv("CANVAS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CANVAS_KEY_ALIAS")
                keyPassword = System.getenv("CANVAS_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (!signingPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("publicRelease")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.6.1")
    implementation("androidx.media3:media3-ui:1.6.1")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))

// Tauri regenerates buildSrc. Keep the Windows copy fallback in the application build.
tasks.matching { (it.name.startsWith("assemble") || it.name.startsWith("bundle")) && it.name.endsWith("Release") }.configureEach {
    doFirst {
        require(!System.getenv("CANVAS_KEYSTORE_PATH").isNullOrBlank()) { "Configure private signing variables; see docs/BUILDING.md" }
    }
}

val prebuiltRust = providers.gradleProperty("canvasPrebuiltRust").orNull == "true"
tasks.matching { it.name.startsWith("rustBuild") }.configureEach {
    onlyIf { !prebuiltRust }
}
if (prebuiltRust) {
    val requiredAbis = providers.gradleProperty("abiList").orNull?.split(',') ?: emptyList()
    val nativeDirectory = layout.projectDirectory.dir("src/main/jniLibs")
    val verifyPrebuiltRust = tasks.register("verifyPrebuiltRust") {
        doLast {
            require(requiredAbis.isNotEmpty()) { "Prebuilt mode requires explicit abiList" }
            requiredAbis.forEach { abi ->
                require(nativeDirectory.file("$abi/libcanvas_mobile.so").asFile.isFile) {
                    "Missing freshly built Rust library for $abi"
                }
            }
        }
    }
    tasks.named("preBuild").configure { dependsOn(verifyPrebuiltRust) }
}
