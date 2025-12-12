# Android Studio 调试指南

## 📱 方式一：使用Android Studio调试（推荐）

### 1. 打开项目

在Android Studio中打开以下目录：

```
/home/liji/danci/danci/packages/tauri-app/src-tauri/gen/android
```

或使用命令行：

```bash
cd /home/liji/danci/danci
./open-android-studio.sh
```

或者使用Tauri CLI：

```bash
cd /home/liji/danci/danci/packages/tauri-app
pnpm tauri android open
```

### 2. 连接设备

1. 用USB连接你的Android设备
2. 确保设备已开启USB调试
3. 在Android Studio顶部工具栏选择你的设备

验证设备连接：

```bash
adb devices
```

### 3. 运行/调试应用

#### 运行模式（无断点）

- 点击顶部工具栏的绿色**运行按钮**（▶️）
- 或按快捷键 `Shift + F10`

#### 调试模式（可设置断点）

- 点击顶部工具栏的**调试按钮**（🐛）
- 或按快捷键 `Shift + F9`
- 可以在Kotlin/Java代码中设置断点

### 4. 查看日志

在Android Studio底部找到**Logcat**标签：

- 选择进程：`com.danci.app`
- 过滤器输入：`danci` 或 `chromium`
- 日志级别：选择 `Debug` 或 `Verbose`

---

## 📝 方式二：使用ADB命令行调试

### 查看实时日志

```bash
cd /home/liji/danci/danci
./adb-logcat.sh
```

或手动运行：

```bash
# 查看应用日志
adb logcat | grep -i danci

# 查看WebView日志（前端错误）
adb logcat | grep -i chromium

# 查看崩溃日志
adb logcat | grep -E "FATAL|AndroidRuntime"
```

### 启动应用

```bash
# 启动应用
adb shell am start -n com.danci.app/.MainActivity

# 停止应用
adb shell am force-stop com.danci.app

# 清除应用数据
adb shell pm clear com.danci.app
```

### 检查应用状态

```bash
# 查看应用是否安装
adb shell pm list packages | grep danci

# 查看应用进程
adb shell ps | grep danci

# 查看应用信息
adb shell dumpsys package com.danci.app
```

---

## 🐛 常见调试技巧

### 1. 查看WebView控制台日志

WebView中的JavaScript错误会显示在logcat中，搜索：

```bash
adb logcat | grep "Web Console"
```

### 2. 调试Rust代码

在 `packages/tauri-app/src-tauri/src/` 中添加打印：

```rust
println!("调试信息: {:?}", some_value);
```

重新构建后在logcat中搜索：

```bash
adb logcat | grep "调试信息"
```

### 3. 检查前端资源是否加载

```bash
# 查看应用的assets目录
adb shell run-as com.danci.app ls -la /data/data/com.danci.app/files/
```

### 4. 远程调试WebView

1. 在手机上打开应用
2. 在电脑Chrome浏览器访问：`chrome://inspect`
3. 找到 `com.danci.app` 进程
4. 点击 `inspect` 打开DevTools

---

## 🔧 修改代码后的工作流

### 修改前端代码后

```bash
# 1. 重新构建前端
pnpm --filter @danci/frontend build

# 2. 重新构建Android APK
pnpm tauri android build --debug --target aarch64

# 3. 安装到设备
adb install -r packages/tauri-app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

### 修改Rust代码后

```bash
# 直接重新构建（会自动编译Rust）
pnpm tauri android build --debug --target aarch64
```

### 在Android Studio中实时调试

1. 在Android Studio中点击 `File` > `Sync Project with Gradle Files`
2. 修改Kotlin/Java代码后，直接点击运行按钮
3. Android Studio会自动重新编译并安装

---

## 📊 性能分析

### 使用Android Profiler

在Android Studio中：

1. 点击 `View` > `Tool Windows` > `Profiler`
2. 选择 `com.danci.app` 进程
3. 查看CPU、内存、网络、能耗使用情况

### 查看应用内存

```bash
adb shell dumpsys meminfo com.danci.app
```

---

## 🎯 调试闪退问题

如果应用闪退，立即运行：

```bash
# 查看崩溃堆栈
adb logcat -d | grep -A 20 "FATAL"

# 或保存完整日志
adb logcat -d > crash.log
```

---

## 快速参考

| 操作               | 命令                                               |
| ------------------ | -------------------------------------------------- |
| 打开Android Studio | `pnpm tauri android open`                          |
| 构建debug APK      | `pnpm tauri android build --debug`                 |
| 运行到设备         | Android Studio运行按钮 或 `pnpm tauri android dev` |
| 查看日志           | `./adb-logcat.sh`                                  |
| 卸载应用           | `adb uninstall com.danci.app`                      |
| Chrome调试         | `chrome://inspect`                                 |
