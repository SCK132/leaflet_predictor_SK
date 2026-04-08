/*
 * Phase 4: 機能改善群
 * - プリセット保存/復元
 * - CSVエクスポート
 * - レイヤー管理
 * - インラインバリデーション
 */

// ============================================================
// 4a. 予測パラメータのプリセット機能
// ============================================================

var PRESET_KEY = 'predictor_presets';
var LAST_SETTINGS_KEY = 'predictor_last_settings';

// プリセットで保存するフィールドID
var PRESET_FIELDS = [
    'lat', 'lon', 'ascent', 'burst', 'drag', 'initial_alt', 
    'flight_profile', 'prediction_type', 
    'year', 'month', 'day', 'hour', 'min',
    'api_source', 'api_custom_url'
];

function getFormValues() {
    var values = {};
    PRESET_FIELDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) values[id] = el.value;
    });
    return values;
}

function applyFormValues(values) {
    PRESET_FIELDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && values[id] !== undefined) {
            el.value = values[id];
            
            // 特殊なトリガーが必要なフィールドの処理
            if (id === 'month' || id === 'site' || id === 'api_source') {
                $(el).change(); 
            }
            if (id === 'lat' || id === 'lon') {
                if (typeof plotClick === 'function') plotClick();
            }

            // バリデーション再実行
            if (typeof validateField === 'function') validateField(el);
        }
    });
    if (typeof showToast === 'function') {
        showToast('設定を復元しました', 'success', 2000);
    }
}

function loadPresets() {
    try {
        var raw = localStorage.getItem(PRESET_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function savePreset(name) {
    var presets = loadPresets();
    var values = getFormValues();
    // 同名があれば上書き
    var found = false;
    for (var i = 0; i < presets.length; i++) {
        if (presets[i].name === name) {
            presets[i].values = values;
            found = true;
            break;
        }
    }
    if (!found) {
        presets.push({ name: name, values: values });
    }
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    updatePresetUI();
    if (typeof showToast === 'function') {
        showToast('プリセット「' + name + '」を保存', 'success', 2000);
    }
}

function deletePreset(name) {
    var presets = loadPresets();
    presets = presets.filter(function (p) { return p.name !== name; });
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    updatePresetUI();
}

function updatePresetUI() {
    var select = document.getElementById('preset_select');
    if (!select) return;
    var presets = loadPresets();
    // 現在の選択値を保持
    var currentVal = select.value;
    select.innerHTML = '<option value="">-- プリセット選択 --</option>';
    presets.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
    select.value = currentVal;
}

// 前回の設定を自動保存（予測実行時に呼ばれる）
function saveLastSettings() {
    var values = getFormValues();
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(values));
}

function restoreLastSettings() {
    try {
        var raw = localStorage.getItem(LAST_SETTINGS_KEY);
        if (raw) {
            applyFormValues(JSON.parse(raw));
        }
    } catch (e) { /* 無視 */ }
}

// ============================================================
// 4b. 落下位置一覧のCSVエクスポート
// ============================================================

function exportPosListCSV() {
    var table = document.getElementById('pos_list_table');
    if (!table) return;

    var rows = table.querySelectorAll('tr');
    if (rows.length <= 1) {
        if (typeof showToast === 'function') {
            showToast('エクスポートするデータがありません', 'warning', 3000);
        }
        return;
    }

    var csv = [];
    rows.forEach(function (row) {
        var cols = row.querySelectorAll('th, td');
        var rowData = [];
        cols.forEach(function (col) {
            // リンクテキストを取得（HTMLを除去）
            var text = col.textContent.trim().replace(/"/g, '""');
            rowData.push('"' + text + '"');
        });
        csv.push(rowData.join(','));
    });

    var csvContent = '\uFEFF' + csv.join('\n'); // BOM付きUTF-8
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', '落下位置一覧_' + new Date().toISOString().slice(0, 10) + '.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') {
        showToast('CSVをエクスポートしました', 'success', 3000);
    }
}

function copyPosListToClipboard() {
    var table = document.getElementById('pos_list_table');
    if (!table) return;

    var rows = table.querySelectorAll('tr');
    if (rows.length <= 1) {
        if (typeof showToast === 'function') {
            showToast('コピーするデータがありません', 'warning', 3000);
        }
        return;
    }

    var text = [];
    rows.forEach(function (row) {
        var cols = row.querySelectorAll('th, td');
        var rowData = [];
        cols.forEach(function (col) {
            rowData.push(col.textContent.trim());
        });
        text.push(rowData.join('\t'));
    });

    navigator.clipboard.writeText(text.join('\n')).then(function () {
        if (typeof showToast === 'function') {
            showToast('クリップボードにコピーしました', 'success', 2000);
        }
    }).catch(function () {
        if (typeof showToast === 'function') {
            showToast('コピーに失敗しました', 'error', 3000);
        }
    });
}

// ============================================================
// 4c. 地図上の結果レイヤー管理
// ============================================================

function clearAllPredictions() {
    if (typeof clearMapItems === 'function') {
        clearMapItems();
    }
    // 履歴マーカーも削除
    if (typeof landing_history_markers !== 'undefined') {
        for (var i = 0; i < landing_history_markers.length; i++) {
            var m = landing_history_markers[i];
            if (m) {
                // 軌跡があれば削除
                if (m.associatedPath && typeof m.associatedPath.remove === 'function') {
                    m.associatedPath.remove();
                }
                // マーカーを削除
                if (typeof m.remove === 'function') {
                    m.remove();
                }
            }
        }
        landing_history_markers = [];
    }
    // 落下位置一覧をクリア
    var tbody = document.querySelector('#pos_list_table tbody');
    if (tbody) tbody.innerHTML = '';

    // C3履歴キャッシュをクリア
    if (typeof clearEhimeHistoryCache === 'function') {
        clearEhimeHistoryCache();
    }

    if (typeof showToast === 'function') {
        showToast('すべての予測結果をクリアしました', 'info', 3000);
    }
}

// ============================================================
// 4d. インラインバリデーション
// ============================================================

var VALIDATION_RULES = {
    'ascent': { min: 0.1, max: 20, label: '上昇速度' },
    'burst': { min: 100, max: 50000, label: '破裂高度' },
    'drag': { min: 0.1, max: 30, label: '下降速度' },
    'initial_alt': { min: 0, max: 10000, label: '打ち上げ高度' },
    'lat': { min: -90, max: 90, label: '緯度' },
    'lon': { min: -180, max: 360, label: '経度' }
};

function validateField(el) {
    if (!el || !el.id) return true;
    var rule = VALIDATION_RULES[el.id];
    if (!rule) return true;

    // 落下モード時は開始高度の許容上限を拡張する
    var dynamicRule = {
        min: rule.min,
        max: rule.max,
        label: rule.label
    };
    if (el.id === 'initial_alt') {
        var predTypeEl = document.getElementById('prediction_type');
        var isFallMode = predTypeEl && predTypeEl.value === 'fall';
        if (isFallMode) {
            dynamicRule.max = 50000;
            dynamicRule.label = '落下開始高度';
        }
    }

    var val = parseFloat(el.value);
    var errorEl = document.getElementById('valid_' + el.id);

    if (isNaN(val)) {
        setValidationState(el, errorEl, '数値を入力してください');
        return false;
    }

    if (val < dynamicRule.min || val > dynamicRule.max) {
        setValidationState(el, errorEl, dynamicRule.label + ': ' + dynamicRule.min + '〜' + dynamicRule.max + ' の範囲');
        return false;
    }

    // 破裂高度 < 打ち上げ高度のチェック
    if (el.id === 'burst') {
        var initAlt = parseFloat(document.getElementById('initial_alt').value) || 0;
        if (val <= initAlt) {
            setValidationState(el, errorEl, '破裂高度は打ち上げ高度より高くしてください');
            return false;
        }
    }

    clearValidationState(el, errorEl);
    return true;
}

function setValidationState(el, errorEl, message) {
    el.classList.add('input-invalid');
    el.classList.remove('input-valid');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

function clearValidationState(el, errorEl) {
    el.classList.remove('input-invalid');
    el.classList.add('input-valid');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

// バリデーション初期化
function initValidation() {
    Object.keys(VALIDATION_RULES).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;

        // エラーメッセージ要素を作成
        var errorSpan = document.createElement('span');
        errorSpan.id = 'valid_' + id;
        errorSpan.className = 'validation-error';
        errorSpan.style.display = 'none';
        el.parentNode.appendChild(errorSpan);

        // イベントリスナー
        el.addEventListener('input', function () { validateField(el); });
        el.addEventListener('blur', function () { validateField(el); });
    });
}

// ============================================================
// 4e. アンサンブル結果エクスポート (CSV / JSON)
// ============================================================

/**
 * 13バリアント結果をCSVファイルとしてダウンロード
 */
function exportEnsembleCSV() {
    if (typeof _ensembleResults === 'undefined' || _ensembleResults.length === 0) {
        if (typeof showToast === 'function') showToast('エクスポートするアンサンブル結果がありません', 'warning', 3000);
        return;
    }

    // CSVヘッダー行
    var header = [
        'ラベル', '変更内容', '着地緯度', '着地経度',
        '上昇速度(m/s)', '下降速度(m/s)', '破裂高度(m)',
        '飛行時間', '打上緯度', '打上経度',
        '破裂緯度', '破裂経度', '破裂高度(実)', '海陸判定'
    ];

    var rows = [header.join(',')];
    // indexでソートしてからエクスポート
    var sorted = _ensembleResults.slice().sort(function (a, b) { return a.index - b.index; });

    for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i];
        var landSea = r.isWater === true ? '海' : r.isWater === false ? '陸' : '不明';
        var row = [
            '"' + r.label + '"',
            '"' + r.description + '"',
            r.lat.toFixed(6),
            r.lng.toFixed(6),
            r.ascent_rate.toFixed(2),
            r.descent_rate.toFixed(2),
            r.burst_altitude.toFixed(0),
            '"' + r.flight_time_str + '"',
            r.launch_lat.toFixed(6),
            r.launch_lng.toFixed(6),
            r.burst_lat.toFixed(6),
            r.burst_lng.toFixed(6),
            (r.burst_alt || 0).toFixed(0),
            '"' + landSea + '"'
        ];
        rows.push(row.join(','));
    }

    // BOM付きUTF-8でCSV生成
    var csvContent = '\uFEFF' + rows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ensemble_results_' + moment().format('YYYYMMDD_HHmmss') + '.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof showToast === 'function') showToast('アンサンブル結果をCSVエクスポートしました', 'success', 3000);
}

/**
 * 13バリアント結果をJSONファイルとしてダウンロード
 * メタデータ（日時、統計情報）も含む
 */
function exportEnsembleJSON() {
    if (typeof _ensembleResults === 'undefined' || _ensembleResults.length === 0) {
        if (typeof showToast === 'function') showToast('エクスポートするアンサンブル結果がありません', 'warning', 3000);
        return;
    }

    // 統計情報を収集
    var meanPos = document.getElementById('ensemble_mean_pos');
    var maxDev = document.getElementById('ensemble_max_dev');
    var landPct = document.getElementById('ensemble_land_pct');
    var seaPct = document.getElementById('ensemble_sea_pct');

    var exportData = {
        metadata: {
            exported_at: moment().format('YYYY-MM-DD HH:mm:ss JST'),
            variant_count: _ensembleResults.length,
            mean_landing_position: meanPos ? meanPos.textContent : '-',
            max_deviation_km: maxDev ? maxDev.textContent : '-',
            land_percentage: landPct ? landPct.textContent : '-',
            sea_percentage: seaPct ? seaPct.textContent : '-'
        },
        results: _ensembleResults.slice().sort(function (a, b) { return a.index - b.index; })
    };

    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ensemble_results_' + moment().format('YYYYMMDD_HHmmss') + '.json';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof showToast === 'function') showToast('アンサンブル結果をJSONエクスポートしました', 'success', 3000);
}

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    updatePresetUI();
    initValidation();

    // プリセット読み込みボタン
    var loadBtn = document.getElementById('preset_load_btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', function () {
            var select = document.getElementById('preset_select');
            if (!select || !select.value) return;
            var presets = loadPresets();
            var preset = presets.find(function (p) { return p.name === select.value; });
            if (preset) applyFormValues(preset.values);
        });
    }

    // プリセット保存ボタン
    var saveBtn = document.getElementById('preset_save_btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            var name = prompt('プリセット名を入力してください:');
            if (name && name.trim()) {
                savePreset(name.trim());
            }
        });
    }

    // プリセット削除ボタン
    var delBtn = document.getElementById('preset_delete_btn');
    if (delBtn) {
        delBtn.addEventListener('click', function () {
            var select = document.getElementById('preset_select');
            if (!select || !select.value) return;
            if (confirm('プリセット「' + select.value + '」を削除しますか？')) {
                deletePreset(select.value);
            }
        });
    }

    // 前回の設定復元ボタン
    var restoreBtn = document.getElementById('preset_restore_btn');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', restoreLastSettings);
    }

    // CSVエクスポートボタン (落下位置一覧)
    var csvBtn = document.getElementById('csv_export_btn');
    if (csvBtn) csvBtn.addEventListener('click', exportPosListCSV);

    // クリップボードコピーボタン
    var copyBtn = document.getElementById('clipboard_copy_btn');
    if (copyBtn) copyBtn.addEventListener('click', copyPosListToClipboard);

    // 全クリアボタン
    var clearBtn = document.getElementById('clear_all_btn');
    if (clearBtn) clearBtn.addEventListener('click', clearAllPredictions);

    // アンサンブル結果エクスポートボタン
    var ensembleCsvBtn = document.getElementById('ensemble_export_csv');
    if (ensembleCsvBtn) ensembleCsvBtn.addEventListener('click', exportEnsembleCSV);

    var ensembleJsonBtn = document.getElementById('ensemble_export_json');
    if (ensembleJsonBtn) ensembleJsonBtn.addEventListener('click', exportEnsembleJSON);

    // 着地予測エリアトグルボタン
    var redAreaBtn = document.getElementById('ensemble_heatmap_toggle');
    if (redAreaBtn) redAreaBtn.addEventListener('click', function () {
        if (typeof toggleEnsembleHeatmap === 'function') toggleEnsembleHeatmap();
    });
});
