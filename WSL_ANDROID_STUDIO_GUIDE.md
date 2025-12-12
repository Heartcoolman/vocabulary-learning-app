# WSL + Android Studio 调试方案

## ⚠️ 问题说明

你的环境是 **Windows Android Studio + WSL Ubuntu 项目**，会遇到路径冲突问题。

## ✅ 已修复的问题

已将 `gradle.properties` 配置为使用WSL中的JDK：

```properties
org.gradle.java.home=/usr/lib/jvm/java-17-openjdk-amd64
```

验证结果：

- ✅ Gradle 8.14.3
- ✅ JDK 17.0.17 (Ubuntu)
- ✅ 路径正确指向WSL

---

## 🎯 推荐方案：在WSL中直接调试

由于项目在WSL中，**建议在WSL终端中调试**，避免跨系统问题。

### 方式一：使用命令行调试（推荐）

#### 1. 查看实时日志

```bash
cd /home/liji/danci/danci
./adb-logcat.sh
```

#### 2. 重新安装并启动

```bash
# 卸载旧版本
adb uninstall com.danci.app

# 安装新版本
adb install packages/tauri-app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# 启动应用
adb shell am start -n com.danci.app/.MainActivity
```

#### 3. 使用Chrome DevTools调试前端

```bash
# 1. 在手机上启动应用
# 2. 在Windows Chrome浏览器访问：chrome://inspect
# 3. 找到 com.danci.app 进程
# 4. 点击 inspect 打开DevTools
```

---

### 方式二：Tauri开发模式（实时热更新）

这个模式可以实时看到代码修改效果：

```bash
# 1. 启动前端开发服务器
pnpm --filter @danci/frontend dev

# 2. 在另一个终端启动Tauri Android开发模式
cd packages/tauri-app
pnpm tauri android dev
```

注意：需要手机和电脑在同一网络，且前端开发服务器监听 `0.0.0.0:5173`

---

### 方式三：在WSL中使用Android Studio（高级）

如果你想在WSL中使用Android Studio GUI：

#### 安装WSLg和Android Studio (Linux版本)

```bash
# 1. 下载Android Studio for Linux
wget https://redirector.gvt1.com/edgedl/android/studio/ide-zips/2024.2.1.12/android-studio-2024.2.1.12-linux.tar.gz

# 2. 解压
tar -xzf android-studio-*-linux.tar.gz -C ~/

# 3. 启动
~/android-studio/bin/studio.sh
```

然后在Android Studio中打开：

```
/home/liji/danci/danci/packages/tauri-app/src-tauri/gen/android
```

---

## 🔧 使用Windows Android Studio的替代方案

如果坚持使用Windows版Android Studio：

### 1. 在项目根目录创建 gradle.properties

在 **Android Studio** 中：

1. 打开 `File` → `Settings`
2. 搜索 `Gradle JDK`
3. 选择 `Gradle Settings`
4. `Gradle JDK` 选择：`Project JDK`
5. 然后 `File` → `Project Structure` → `SDK Location`
6. 设置 JDK 为WSL路径（可能不支持）

### 2. 使用Gradle命令行构建

在WSL终端中：

```bash
cd /home/liji/danci/danci/packages/tauri-app/src-tauri/gen/android

# 清理
./gradlew clean

# 构建debug
./gradlew assembleUniversalDebug

# 安装到设备
./gradlew installUniversalDebug
```

---

## 📱 推荐的完整调试流程

### 快速调试流程

```bash
cd /home/liji/danci/danci

# 1. 修改代码后，重新构建前端
pnpm --filter @danci/frontend build

# 2. 重新构建APK
pnpm tauri android build --debug --target aarch64

# 3. 安装到设备
adb install -r packages/tauri-app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# 4. 启动应用
adb shell am start -n com.danci.app/.MainActivity

# 5. 查看日志
./adb-logcat.sh
```

### 使用Chrome DevTools调试前端（最佳）

这是调试WebView中React应用的最好方式：

1. **启动应用**（在手机上）
2. **打开Chrome**（在Windows上）
3. **访问** `chrome://inspect`
4. **找到** `com.danci.app`
5. **点击** `inspect`
6. 现在可以：
   - 查看Console日志
   - 检查Network请求
   - 调试React组件
   - 设置JavaScript断点
   - 查看localStorage/sessionStorage

---

## 🎯 建议

由于你是 **WSL + Windows** 混合环境，我的建议是：

✅ **调试前端**: 使用 Chrome DevTools (`chrome://inspect`)
✅ **查看日志**: 使用 WSL终端 + `./adb-logcat.sh`
✅ **构建APK**: 使用 WSL终端 + `pnpm tauri android build`
❌ **避免**: Windows Android Studio打开WSL项目（会有路径问题）

如果需要调试Kotlin/Java代码，可以在WSL中安装Linux版本的Android Studio。
