plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val sharedVersion = Regex("""const APP_VERSION = "([^"]+)";""")
    .find(file("../../src/budget.js").readText())?.groupValues?.get(1)
    ?: error("Shared APP_VERSION is missing")

val webAssets = tasks.register<Sync>("syncWebAssets") {
    from(rootProject.projectDir.parentFile) {
        include("index.html", "src/**")
        exclude("src/site-nav.css")
        filesMatching("index.html") {
            filter { line ->
                line.replace("https://immichaelyeh.github.io/css/site-nav.css", "./src/site-nav.css")
            }
        }
    }
    from("src/main/web") { into("src") }
    into(layout.buildDirectory.dir("generated/webAssets"))
}

android {
    namespace = "com.michaelyeh.mybudgetplanner"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.michaelyeh.mybudgetplanner"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = sharedVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

tasks.named("preBuild") { dependsOn(webAssets) }

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.14.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.15.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
