#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 读取基线数据
const baselinePath = path.join(__dirname, 'performance-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));

// 读取构建输出（从前面的构建日志）
const buildOutput = `
dist/index.html                                      0.63 kB │ gzip:   0.38 kB
dist/assets/css/index-RHPi8997.css                  90.51 kB │ gzip:  14.65 kB
dist/assets/js/sentry-vendor-l0sNRNKZ.js             0.00 kB │ gzip:   0.02 kB
dist/assets/js/errorHandler-C68APpEK.js              1.02 kB │ gzip:   0.68 kB
dist/assets/js/useConfigMutations-DHh8fN0f.js        1.33 kB │ gzip:   0.50 kB
dist/assets/js/queryKeys-WQha9mMK.js                 2.24 kB │ gzip:   0.59 kB
dist/assets/js/AboutLayout-B5_2xbnp.js               2.33 kB │ gzip:   1.07 kB
dist/assets/js/AdminLayout-CenIhkYM.js               2.85 kB │ gzip:   1.53 kB
dist/assets/js/LineChart-Bf9Ig5Nv.js                 3.07 kB │ gzip:   1.46 kB
dist/assets/js/Modal-B6e0KafM.js                     3.17 kB │ gzip:   1.26 kB
dist/assets/js/aboutApi-BaIrFBR-.js                  4.19 kB │ gzip:   1.75 kB
dist/assets/js/AboutHomePage-DPWRedFo.js             4.96 kB │ gzip:   2.74 kB
dist/assets/js/AlgorithmConfigService-CMC8Z7Ko.js    5.15 kB │ gzip:   2.23 kB
dist/assets/js/StudySettingsPage-i_chU4I2.js         5.97 kB │ gzip:   2.38 kB
dist/assets/js/ConfigHistoryPage-DG4pXvYX.js         6.13 kB │ gzip:   2.32 kB
dist/assets/js/LearningObjectivesPage-Cym4dDC-.js    6.33 kB │ gzip:   2.43 kB
dist/assets/js/importParsers-DJhwDirb.js             7.42 kB │ gzip:   3.28 kB
dist/assets/js/LearningProfilePage-ERlUMqXn.js       8.49 kB │ gzip:   2.75 kB
dist/assets/js/StatisticsPage-BhreKxVu.js            8.52 kB │ gzip:   2.91 kB
dist/assets/js/TodayWordsPage-Be65h_0P.js            9.05 kB │ gzip:   2.99 kB
dist/assets/js/LearningTimePage-CBv3961-.js          9.11 kB │ gzip:   2.86 kB
dist/assets/js/VocabularyPage-DAq7eaZ5.js            9.58 kB │ gzip:   3.17 kB
dist/assets/js/ProfilePage-Cs2SL68x.js              10.58 kB │ gzip:   3.31 kB
dist/assets/js/UserManagementPage-nhE3xM73.js       11.01 kB │ gzip:   3.53 kB
dist/assets/js/WordListPage-Dvo1wBa_.js             11.03 kB │ gzip:   3.65 kB
dist/assets/js/BatchImportPage-CUoqAuJz.js          11.40 kB │ gzip:   3.66 kB
dist/assets/js/TrendReportPage-D-SDOt_-.js          11.87 kB │ gzip:   3.38 kB
dist/assets/js/BadgeGalleryPage-CDKtskp8.js         12.71 kB │ gzip:   3.76 kB
dist/assets/js/LogViewerPage-iUeWSsEX.js            12.96 kB │ gzip:   3.56 kB
dist/assets/js/StatsPage-DxKmlyWq.js                13.51 kB │ gzip:   4.10 kB
dist/assets/js/LLMAdvisorPage-BECQFzcn.js           13.94 kB │ gzip:   4.05 kB
dist/assets/js/PlanPage-DQjIbaHQ.js                 14.28 kB │ gzip:   4.04 kB
dist/assets/js/CausalInferencePage-ChzfHIPH.js      14.71 kB │ gzip:   3.88 kB
dist/assets/js/SimulationPage-C-6EXgxU.js           14.85 kB │ gzip:   4.82 kB
dist/assets/js/AdminDashboard-DL3AJTBm.js           15.34 kB │ gzip:   4.23 kB
dist/assets/js/WordDetailPage-C8B_31hh.js           15.35 kB │ gzip:   4.12 kB
dist/assets/js/LogAlertsPage-K_ItKKZI.js            15.96 kB │ gzip:   4.34 kB
dist/assets/js/OptimizationDashboard-C6wVKPce.js    16.04 kB │ gzip:   4.92 kB
dist/assets/js/AdminWordBooks-D0TkxtIF.js           16.46 kB │ gzip:   4.83 kB
dist/assets/js/AchievementPage-CIbnsb5O.js          16.54 kB │ gzip:   4.81 kB
dist/assets/js/WordBookDetailPage-C-xj0o68.js       16.63 kB │ gzip:   4.74 kB
dist/assets/js/HabitProfilePage-BeCLYT7L.js         17.31 kB │ gzip:   5.59 kB
dist/assets/js/DashboardPage-CFxxXAp6.js            18.06 kB │ gzip:   5.77 kB
dist/assets/js/SystemStatusPage-CXG-XCCT.js         20.18 kB │ gzip:   4.66 kB
dist/assets/js/ExperimentDashboard-Dm5dOxOo.js      21.95 kB │ gzip:   6.33 kB
dist/assets/js/HistoryPage-BSdIfGKL.js              21.99 kB │ gzip:   5.59 kB
dist/assets/js/StudyProgressPage-Uo1U9u3_.js        22.16 kB │ gzip:   6.42 kB
dist/assets/js/AMASExplainabilityPage-DVOJakzX.js   23.67 kB │ gzip:   5.36 kB
dist/assets/js/WordMasteryPage-D-PCOYq_.js          24.11 kB │ gzip:   6.44 kB
dist/assets/js/AlgorithmConfigPage-Dt0EB26U.js      24.24 kB │ gzip:   5.26 kB
dist/assets/js/UserDetailPage-Cn9MD5RK.js           47.05 kB │ gzip:  10.97 kB
dist/assets/js/vendor-Dq6Cshqx.js                  113.32 kB │ gzip:  38.90 kB
dist/assets/js/index-Bs5e9r-2.js                   178.42 kB │ gzip:  48.04 kB
dist/assets/js/react-vendor-BNPFm4SC.js            541.70 kB │ gzip: 146.10 kB
`;

// 解析构建输出
function parseSize(str) {
  const match = str.match(/([0-9.]+)\s*kB/i);
  if (!match) return 0;
  return parseFloat(match[1]);
}

const lines = buildOutput.trim().split('\n');
const currentBuild = {
  timestamp: new Date().toISOString(),
  buildTime: '13.56s',
  files: [],
  totals: {
    js: 0,
    jsGzip: 0,
    css: 0,
    cssGzip: 0,
    html: 0,
    htmlGzip: 0
  }
};

// 解析每一行
lines.forEach(line => {
  const parts = line.split(/\s+/).filter(p => p);
  if (parts.length < 5) return;

  const fileName = parts[0].replace('dist/', '');
  const rawSize = parseSize(parts[1]);
  const gzipSize = parseSize(parts[4]);

  const fileInfo = {
    file: fileName,
    raw: rawSize,
    gzip: gzipSize
  };

  currentBuild.files.push(fileInfo);

  // 累计统计
  if (fileName.includes('.js')) {
    currentBuild.totals.js += rawSize;
    currentBuild.totals.jsGzip += gzipSize;
  } else if (fileName.includes('.css')) {
    currentBuild.totals.css += rawSize;
    currentBuild.totals.cssGzip += gzipSize;
  } else if (fileName.includes('.html')) {
    currentBuild.totals.html += rawSize;
    currentBuild.totals.htmlGzip += gzipSize;
  }
});

// 找出关键chunks
const reactVendor = currentBuild.files.find(f => f.file.includes('react-vendor'));
const indexBundle = currentBuild.files.find(f => f.file.includes('index-') && !f.file.includes('.css'));
const vendor = currentBuild.files.find(f => f.file.includes('vendor-Dq'));
const userDetailPage = currentBuild.files.find(f => f.file.includes('UserDetailPage'));

// 生成对比报告
const report = {
  summary: {
    timestamp: currentBuild.timestamp,
    buildTime: {
      baseline: baseline.baseline.buildTime,
      current: currentBuild.buildTime,
      change: '✅ -41.9% (23.34s → 13.56s)'
    }
  },
  bundleSize: {
    javascript: {
      total: {
        baseline: {
          raw: baseline.baseline.bundleSize.javascript.total.raw,
          formatted: baseline.baseline.bundleSize.javascript.total.formatted,
          gzipped: baseline.baseline.bundleSize.javascript.total.gzippedFormatted || '~235 KB'
        },
        current: {
          raw: Math.round(currentBuild.totals.js * 1024),
          formatted: `${currentBuild.totals.js.toFixed(2)} KB`,
          gzipped: `${currentBuild.totals.jsGzip.toFixed(2)} KB`
        },
        change: {
          raw: ((currentBuild.totals.js * 1024 - baseline.baseline.bundleSize.javascript.total.raw) / baseline.baseline.bundleSize.javascript.total.raw * 100).toFixed(1) + '%',
          gzipped: ((currentBuild.totals.jsGzip - 235) / 235 * 100).toFixed(1) + '%'
        }
      },
      reactVendor: {
        baseline: {
          raw: baseline.baseline.bundleSize.javascript.chunks.reactVendor.formatted,
          gzipped: baseline.baseline.bundleSize.javascript.chunks.reactVendor.gzippedFormatted
        },
        current: {
          raw: `${reactVendor.raw.toFixed(2)} KB`,
          gzipped: `${reactVendor.gzip.toFixed(2)} KB`
        },
        change: {
          raw: ((reactVendor.raw - 534.46) / 534.46 * 100).toFixed(1) + '%',
          gzipped: ((reactVendor.gzip - 142.70) / 142.70 * 100).toFixed(1) + '%'
        }
      },
      indexBundle: {
        baseline: {
          raw: baseline.baseline.bundleSize.javascript.chunks.indexBundle.formatted,
          gzipped: baseline.baseline.bundleSize.javascript.chunks.indexBundle.gzippedFormatted
        },
        current: {
          raw: `${indexBundle.raw.toFixed(2)} KB`,
          gzipped: `${indexBundle.gzip.toFixed(2)} KB`
        },
        change: {
          raw: ((indexBundle.raw - 176.31) / 176.31 * 100).toFixed(1) + '%',
          gzipped: ((indexBundle.gzip - 47.17) / 47.17 * 100).toFixed(1) + '%'
        }
      },
      vendor: {
        baseline: {
          raw: baseline.baseline.bundleSize.javascript.chunks.vendor.formatted,
          gzipped: baseline.baseline.bundleSize.javascript.chunks.vendor.gzippedFormatted
        },
        current: {
          raw: `${vendor.raw.toFixed(2)} KB`,
          gzipped: `${vendor.gzip.toFixed(2)} KB`
        },
        change: {
          raw: ((vendor.raw - 74.42) / 74.42 * 100).toFixed(1) + '%',
          gzipped: ((vendor.gzip - 27.66) / 27.66 * 100).toFixed(1) + '%'
        }
      }
    },
    css: {
      baseline: {
        raw: baseline.baseline.bundleSize.css.total.formatted,
        gzipped: baseline.baseline.bundleSize.css.total.gzippedFormatted
      },
      current: {
        raw: `${currentBuild.totals.css.toFixed(2)} KB`,
        gzipped: `${currentBuild.totals.cssGzip.toFixed(2)} KB`
      },
      change: {
        raw: ((currentBuild.totals.css - 90.51) / 90.51 * 100).toFixed(1) + '%',
        gzipped: '0.0%'
      }
    }
  },
  pageChunks: {
    largePages: currentBuild.files
      .filter(f => f.file.includes('.js') && !f.file.includes('vendor') && !f.file.includes('index-'))
      .filter(f => f.raw > 20)
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 10)
      .map(f => ({
        name: f.file.replace('assets/js/', '').replace(/\-[a-zA-Z0-9_]+\.js/, ''),
        raw: `${f.raw.toFixed(2)} KB`,
        gzip: `${f.gzip.toFixed(2)} KB`
      }))
  },
  staticAssets: {
    total: '41 MB',
    badges: '96 KB',
    icons: '36 MB',
    notes: '与基线一致，需要优化'
  },
  goals: {
    bundleSizeReduction: {
      target: '< 800 KB',
      baseline: '1.38 MB',
      current: `${(currentBuild.totals.js / 1024).toFixed(2)} MB`,
      progress: ((1.38 - currentBuild.totals.js / 1024) / (1.38 - 0.8) * 100).toFixed(1) + '%'
    },
    gzippedSizeReduction: {
      target: '< 100 KB',
      baseline: '~235 KB',
      current: `${currentBuild.totals.jsGzip.toFixed(2)} KB`,
      progress: ((235 - currentBuild.totals.jsGzip) / (235 - 100) * 100).toFixed(1) + '%'
    }
  }
};

// 输出报告
console.log('\n=== 📊 Bundle Size Analysis Report ===\n');
console.log(JSON.stringify(report, null, 2));

// 保存报告
const reportPath = path.join(__dirname, 'bundle-analysis-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n✅ Report saved to: ${reportPath}\n`);
