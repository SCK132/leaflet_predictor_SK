/*
 * CUSF Landing Prediction Version 3
 * Mark Jessop 2019
 * vk5qi@rfhead.net
 *
 * http://github.com/jonsowman/cusf-standalone-predictor
 *
 */


function initLaunchCard() {
    // Initialise the time/date on the launch card.

    // Use local JST (UTC+9) for display, but keep backend in UTC.
    // var today = moment.utc().add(9, 'hour'); // Old style
    var todayJst = moment().utcOffset(9 * 60);

    $('#year').val(todayJst.year());
    $('#day').val(todayJst.date());
    var month = todayJst.month() + 1;
    $("#month").val(month).change();
    $('#hour').val(todayJst.hours());
    $('#min').val(todayJst.minutes());
}


function getSettings() {
    var s = {};
    var year = parseInt($('#year').val());
    var month = parseInt($('#month').val());
    var day = parseInt($('#day').val());
    var hour = parseInt($('#hour').val());
    var min = parseInt($('#min').val());

    // JST -> UTC (JST is UTC+9)
    var m = moment([year, month - 1, day, hour, min]);
    s.launch_datetime = m.clone().subtract(9, 'hours').utc().format();

    s.launch_latitude = parseFloat($('#lat').val());
    s.launch_longitude = parseFloat($('#lon').val());
    if (s.launch_longitude < 0) s.launch_longitude += 360;

    s.initial_alt = parseFloat($('#initial_alt').val());
    s.launch_altitude = s.initial_alt;
    s.ascent_rate = parseFloat($('#ascent').val());
    s.profile = $('#flight_profile').val();
    s.pred_type = $('#prediction_type').val();
    s.launch_site_name = $('#site option:selected').text();

    if (s.profile == "standard_profile") {
        s.burst_altitude = parseFloat($('#burst').val());
        s.descent_rate = parseFloat($('#drag').val());
    } else {
        s.float_altitude = parseFloat($('#burst').val());
    }

    // API source
    var source = $('#api_source').val();
    if (source === 'custom') {
        s.api_url = $('#api_custom_url').val();
    } else {
        s.api_url = "/api/v1/";
    }

    return s;
}

function runPrediction() {
    // Read the user-supplied parameters and request a prediction.
    // Phase 4: 前回の設定を自動保存
    if (typeof saveLastSettings === 'function') saveLastSettings();
    var run_settings = {};
    var extra_settings = {};
    run_settings.profile = $('#flight_profile').val();
    run_settings.pred_type = $('#prediction_type').val();
    run_settings.launch_site_name = $('#site option:selected').text();

    // Grab date values
    var year = $('#year').val();
    var month = $('#month').val();
    var day = $('#day').val();
    var hour = $('#hour').val();
    var minute = $('#min').val();

    // Months are zero-indexed in Javascript. Wat.
    // Input is JST. Create moment with fixed offset +09:00
    var launch_time_local = moment([year, month - 1, day, hour, minute, 0, 0]).utcOffset(9 * 60, true);
    // Convert to UTC for API
    var launch_time = launch_time_local.clone().utc();

    run_settings.launch_datetime = launch_time.format();
    extra_settings.launch_moment = launch_time;

    // Sanity check the launch date to see if it's not too far into the past or future.
    // [Modified for Task B] Removed strict past date check to allow historical simulation.
    // Original: if (launch_time < (moment.utc().subtract(12, 'hours'))) { ... }

    // Still keep future check? Maybe relax it too if simulating future hypothetical scenarios?
    // Maintaining future check for now as GFS forecast is limited.
    if (launch_time > (moment.utc().add(16, 'days'))) { // Relaxed a bit from 7 days just in case
        throwError("Launch time too far into the future (outside of model time range).");
        return;
    }

    // Grab other launch settings.
    run_settings.launch_latitude = parseFloat($('#lat').val());
    run_settings.launch_longitude = parseFloat($('#lon').val());
    // Handle negative longitudes - Tawhiri wants longitudes between 0-360
    if (run_settings.launch_longitude < 0.0) {
        run_settings.launch_longitude += 360.0
    }
    run_settings.launch_altitude = parseFloat($('#initial_alt').val());
    run_settings.ascent_rate = parseFloat($('#ascent').val());

    if (run_settings.profile == "standard_profile") {
        run_settings.burst_altitude = parseFloat($('#burst').val());
        run_settings.descent_rate = parseFloat($('#drag').val());
    } else {
        run_settings.float_altitude = parseFloat($('#burst').val());
        run_settings.stop_datetime = launch_time.add(1, 'days').format();
    }


    // Update the URL with the supplied parameters.
    url = new URL(window.location.href);
    // Should probably clear all these parameters before setting them again?
    if (time_was_now) {
        url.searchParams.set('launch_datetime', 'now');
    } else {
        url.searchParams.set('launch_datetime', run_settings.launch_datetime);
    }
    url.searchParams.set('launch_latitude', run_settings.launch_latitude);
    url.searchParams.set('launch_longitude', run_settings.launch_longitude);
    url.searchParams.set('launch_altitude', run_settings.launch_altitude);
    url.searchParams.set('ascent_rate', run_settings.ascent_rate);
    url.searchParams.set('profile', run_settings.profile);
    url.searchParams.set('prediction_type', run_settings.pred_type);
    if (run_settings.profile == "standard_profile") {
        url.searchParams.set('burst_altitude', run_settings.burst_altitude);
        url.searchParams.set('descent_rate', run_settings.descent_rate);
    } else {
        url.searchParams.set('float_altitude', run_settings.float_altitude);
    }

    // New parameters for Collaboration
    var api_source = $('#api_source').val();
    url.searchParams.set('api_source', api_source);
    if (api_source === 'custom') {
        url.searchParams.set('api_custom_url', $('#api_custom_url').val());
    } else {
        url.searchParams.delete('api_custom_url'); // Clean up if not custom
    }

    // Update browser URL.
    history.replaceState(
        {},
        'WASA 気球実験用 予測ツール',
        url.href
    );


    // Determine API URL
    var api_source = $('#api_source').val();
    var current_api_url = "";

    if (api_source === 'local') {
        // Proxy経由: cors-proxy.js がDocker Tawhiriへ転送
        current_api_url = "/api/v1/";
    } else if (api_source === 'custom') {
        current_api_url = $('#api_custom_url').val();
        if (!current_api_url) {
            alert("カスタムAPI URLを入力してください。");
            return;
        }
    } else {
        // Default: SondeHub
        current_api_url = "https://api.v2.sondehub.org/tawhiri";
    }

    appendDebug("Using API: " + current_api_url);

    // Run the request
    if (run_settings.pred_type == 'ensemble') {
        runEnsembleSimulation(run_settings, current_api_url);
    } else if (run_settings.pred_type == 'ensemble_13var') {
        run13VariantEnsemble(run_settings, current_api_url);
    } else {
        tawhiriRequest(run_settings, extra_settings, current_api_url);
    }

}

// Tawhiri API URL. Refer to API docs here: https://tawhiri.readthedocs.io/en/latest/api.html
// Habitat Tawhiri Instance
//var tawhiri_api = "https://predict.cusf.co.uk/api/v1/";
// Sondehub Tawhiri Instance
// var tawhiri_api = "https://api.v2.sondehub.org/tawhiri"; // Moved to runPrediction
// Approximately how many hours into the future the model covers.
var MAX_PRED_HOURS = 169;

// グローバル変数: アンサンブル結果データ（エクスポート・ヒートマップ用）
var _ensembleResults = [];
var _ensembleHeatLayer = null;
var _ensembleHeatVisible = false;

function runEnsembleSimulation(settings, api_url) {
    if (!api_url) api_url = "/api/v1/";

    appendDebug("Running Ensemble Simulation (20 runs)...");
    clearMapItems();

    var runs = 20;
    var completed = 0;

    // Normal Distribution (Gaussian) Helper
    // Box-Muller transform
    function randomGaussian(mean, stdev) {
        var u = 0, v = 0;
        while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
        while (v === 0) v = Math.random();
        var num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return num * stdev + mean;
    }

    // Bounds for randomization (+- 10% or similar)
    // We vary: ascent_rate, burst_altitude, descent_rate

    for (var i = 0; i < runs; i++) {
        var iterSettings = { ...settings }; // clone

        // Random variations (Gaussian Distribution)
        // 5% standard deviation for parameters?
        // Or should we use 2.5% so 95% falls within +-5%?
        // Let's use 5% as 1 sigma to get enough spread.
        var stdevFactor = 0.05;

        iterSettings.ascent_rate = randomGaussian(settings.ascent_rate, settings.ascent_rate * stdevFactor);
        iterSettings.burst_altitude = randomGaussian(settings.burst_altitude, settings.burst_altitude * stdevFactor);
        iterSettings.descent_rate = settings.ascent_rate; // Default initialization

        if (settings.settings_descent_rate) {
            iterSettings.descent_rate = randomGaussian(settings.descent_rate, settings.descent_rate * stdevFactor);
        } else {
            iterSettings.descent_rate = settings.descent_rate;
        }
        // Float profile? 
        if (iterSettings.profile != 'standard_profile') {
            iterSettings.float_altitude = randomGaussian(settings.float_altitude, settings.float_altitude * stdevFactor);
        }

        // Calculate diffs for tooltip
        var diffs = {
            ascent: {
                val: iterSettings.ascent_rate,
                pct: ((iterSettings.ascent_rate - settings.ascent_rate) / settings.ascent_rate * 100).toFixed(1)
            },
            burst: {
                val: iterSettings.burst_altitude,
                pct: ((iterSettings.burst_altitude - settings.burst_altitude) / settings.burst_altitude * 100).toFixed(1)
            },
            descent: {
                val: iterSettings.descent_rate,
                pct: settings.settings_descent_rate ? ((iterSettings.descent_rate - settings.descent_rate) / settings.descent_rate * 100).toFixed(1) : 0
            }
        };

        // We need a way to identify this request when it returns, although variables in closure capture 'i' or 'iterSettings' if we use let, but here var i.
        // Actually $.get is async.

        (function (idx, currentSets, diffInfo) {
            $.get(api_url, currentSets)
                .done(function (data) {
                    var res = parsePrediction(data.prediction);
                    plotEnsemblePath(res, idx, diffInfo);
                    // Also update chart for the FIRST run (main run) or maybe all? All is too much.
                    // Maybe just the first one to give an idea.
                    if (idx === 0 && typeof updateAltitudeChart === "function") {
                        updateAltitudeChart(data.prediction);
                    }
                })
                .fail(function () {
                    console.log("Ensemble run " + idx + " failed.");
                })
                .always(function () {
                    completed++;
                    if (completed >= runs) {
                        appendDebug("Ensemble simulation completed.");
                        // Maybe update UI status?
                        $("#prediction_status").html("Ensemble Finished.");
                    } else {
                        $("#prediction_status").html("Running Ensemble: " + completed + "/" + runs);
                    }
                });
        })(i, iterSettings, diffs);
    }
}

function plotEnsemblePath(prediction, index, diffs) {
    var flight_path = prediction.flight_path;
    var landing = prediction.landing;

    // Polyline
    var path_polyline = L.polyline(
        flight_path,
        {
            weight: 2,
            color: '#555555',
            opacity: 0.3
        }
    ).addTo(map);

    map_items['ensemble_path_' + index] = path_polyline;

    // Landing Marker (small dot)
    var land_marker = new L.CircleMarker(landing.latlng, {
        radius: 3,
        fillOpacity: 0.6,
        color: "#000000",
        fillColor: "#ff0000",
        weight: 0
    }).addTo(map);

    // Tooltip content
    if (diffs) {
        var tooltipContent = "<b>Ensemble Run #" + (index + 1) + "</b><br>" +
            "上昇速度: " + diffs.ascent.val.toFixed(2) + " m/s (" + (diffs.ascent.pct > 0 ? "+" : "") + diffs.ascent.pct + "%)<br>" +
            "破裂高度: " + diffs.burst.val.toFixed(0) + " m (" + (diffs.burst.pct > 0 ? "+" : "") + diffs.burst.pct + "%)<br>";

        if (diffs.descent.val) {
            tooltipContent += "下降速度: " + diffs.descent.val.toFixed(2) + " m/s (" + (diffs.descent.pct > 0 ? "+" : "") + diffs.descent.pct + "%)";
        }

        land_marker.bindTooltip(tooltipContent, {
            direction: 'top',
            opacity: 0.9
        });
    }

    map_items['ensemble_land_' + index] = land_marker;

    // Fit bounds on first run
    if (index === 0) {
        map.fitBounds(path_polyline.getBounds());
    }
}

function tawhiriRequest(settings, extra_settings, api_url) {
    // Request a prediction via the Tawhiri API.
    // Settings must be as per the API docs above.

    // Default URL if not passed (though it should be)
    if (!api_url) api_url = "/api/v1/";

    if (settings.pred_type == 'single') {
        hourly_mode = false;
        // APIに送る前に不要なパラメータを削除（Localhost Tawhiriが拒否する）
        var apiSettings = JSON.parse(JSON.stringify(settings));
        delete apiSettings.pred_type;
        $.get(api_url, apiSettings)
            .done(function (data) {
                processTawhiriResults(data, settings, api_url);
            })
            .fail(function (data) {
                var prediction_error = "Prediction failed. ";
                if (api_url.includes("localhost") || api_url.startsWith("/api/")) {
                    prediction_error += "Dockerコンテナが起動しているか確認してください。";
                }

                if (data.hasOwnProperty("responseJSON") && data.responseJSON.error) {
                    var desc = data.responseJSON.error.description;
                    prediction_error += desc;
                    // GFSデータ不足に関するヒントを追加
                    if (desc.toLowerCase().includes("forecast data not found")) {
                        prediction_error += "<br><br><b>ヒント:</b> 選択した日時の気象データ(GFS)がサーバー上に存在しない可能性があります。数日前〜2週間先までの範囲で指定してください。過去のデータが必要な場合は、専用のデータセットを持つローカルAPI環境が必要です。";
                    }
                } else {
                    prediction_error += "サーバーに接続できないか、不明なエラーが発生しました。 (Status: " + data.status + ")";
                }

                throwError(prediction_error);
            })
            .always(function (data) {
                //throwError("test.");
                //console.log(data);
            });
    } else {
        // For Multiple predictions, we do things a bit differently.
        hourly_mode = true;
        // First up clear off anything on the map.
        clearMapItems();

        // Also clean up any hourly prediction data.
        hourly_predictions = {};

        var current_hour = 0;
        var time_step = 24;

        if (settings.pred_type == 'daily') {
            time_step = 24;
        } else if (settings.pred_type == '1_hour') {
            time_step = 1;
        } else if (settings.pred_type == '3_hour') {
            time_step = 3;
        } else if (settings.pred_type == '6_hour') {
            time_step = 6;
        } else if (settings.pred_type == '12_hour') {
            time_step = 12;
        } else {
            throwError("Invalid time step.");
            return;
        }

        // The following block was moved here from runPrediction to ensure launch_moment is correctly set for hourly/daily predictions.
        // It also applies the JST offset directly to the moment object.
        var launch_datetime = extra_settings.launch_datetime;
        var launch_moment;
        var time_was_now = false;

        if (launch_datetime == "now") {
            launch_moment = moment.utc().utcOffset(9 * 60);   // JSTへの変換 / Convert to JST
            time_was_now = true;
        } else {
            launch_moment = moment.utc(launch_datetime).utcOffset(9 * 60);    // JSTへの変換 / Convert to JST
        }

        if (settings.profile != "standard_profile") {
            throwError("Hourly/Daily predictions are only available for the standard flight profile.");
            return;
        }

        // Loop to advance time until end of prediction window
        while (current_hour < MAX_PRED_HOURS) {
            // Update launch time
            var current_moment = moment(extra_settings.launch_moment).add(current_hour, 'hours');

            // Setup entries in the hourly prediction data store.
            hourly_predictions[current_hour] = {};
            hourly_predictions[current_hour]['layers'] = {};
            hourly_predictions[current_hour]['settings'] = { ...settings };
            hourly_predictions[current_hour]['settings']['launch_datetime'] = current_moment.format();

            // Copy our current settings for passing into the requst.
            var current_settings = { ...hourly_predictions[current_hour]['settings'] };
            // APIに送る前に不要なパラメータを削除
            delete current_settings.pred_type;

            $.get({
                url: api_url,
                data: current_settings,
                current_hour: current_hour
            })
                .done(function (data) {
                    processHourlyTawhiriResults(data, current_settings, this.current_hour);
                })
                .fail(function (data) {
                    var prediction_error = "Prediction failed. Tawhiri may be under heavy load, please try again. ";
                    if (data.hasOwnProperty("responseJSON")) {
                        prediction_error += data.responseJSON.error.description;
                    }

                    // Silently handle failed predictions, which are most likely
                    // because the prediction time was too far into the future.
                    delete hourly_predictions[this.current_hour]
                    //throwError(prediction_error);
                })
                .always(function (data) {
                    //throwError("test.");
                    //console.log(data);
                });

            current_hour += time_step;

        }

        // Generate prediction number and information to pass onwards to plotting
        // Run async get call, pass in prediction details.

        // Need new processing functions to plot just the landing spot, and then somehow a line between them?


    }
}

function processTawhiriResults(data, settings, api_url) {
    // Process results from a Tawhiri run.

    if (data.hasOwnProperty('error')) {
        // The prediction API has returned an error.
        throwError("Predictor returned error: " + data.error.description)
    } else {

        var prediction_results = parsePrediction(data.prediction);

        plotStandardPrediction(prediction_results);

        writePredictionInfo(settings, data.metadata, data.request, api_url);

        // Update Chart
        if (typeof updateAltitudeChart === "function") {
            updateAltitudeChart(data.prediction);
        }

        // Update Wind Chart
        if (typeof updateWindChart === "function") {
            updateWindChart(data.prediction);
        }

        // C1: 風速情報を計算・表示
        computeSurfaceWind(data.prediction);
    }

    //console.log(data);

}

// ============================================================
// C1: 放球場所の風速情報を計算・表示
// ============================================================
function computeSurfaceWind(tawhiriPrediction) {
    try {
        var allPoints = [];
        tawhiriPrediction.forEach(function (stage) {
            if (stage.trajectory) {
                stage.trajectory.forEach(function (point) {
                    allPoints.push(point);
                });
            }
        });
        if (allPoints.length < 2) return 0;

        var surfaceSpeeds = [];
        var maxWindSpeed = 0;
        var maxWindAlt = 0;

        for (var i = 1; i < allPoints.length; i++) {
            var p0 = allPoints[i - 1];
            var p1 = allPoints[i];
            var t0 = moment.utc(p0.datetime);
            var t1 = moment.utc(p1.datetime);
            var dt = t1.diff(t0, 'seconds');
            if (dt <= 0) continue;

            var dist = distHaversine(L.latLng(p0.latitude, p0.longitude), L.latLng(p1.latitude, p1.longitude), 1);
            var speed = (dist * 1000) / dt;

            if (p1.altitude <= 500) {
                surfaceSpeeds.push(speed);
            }
            if (speed > maxWindSpeed) {
                maxWindSpeed = speed;
                maxWindAlt = p1.altitude;
            }
        }

        var avgSurface = 0;
        if (surfaceSpeeds.length > 0) {
            var sum = 0;
            for (var j = 0; j < surfaceSpeeds.length; j++) sum += surfaceSpeeds[j];
            avgSurface = sum / surfaceSpeeds.length;
        }

        // UI更新
        $('#launch_surface_wind').text(avgSurface.toFixed(1));
        $('#launch_max_wind').text(maxWindSpeed.toFixed(1));

        return avgSurface;
    } catch (e) {
        console.error("Error in computeSurfaceWind:", e);
        return 0;
    }
}

function parsePrediction(prediction) {
    // Convert a prediction in the Tawhiri API format to a Polyline.

    var flight_path = [];
    var launch = {};
    var burst = {};
    var landing = {};

    var ascent = prediction[0].trajectory;
    var descent = prediction[1].trajectory;

    // Add the ascent track to the flight path array.
    ascent.forEach(function (item, index) {
        var _lat = item.latitude;
        // Correct for API giving us longitudes outside [-180, 180]
        var _lon = item.longitude;
        if (_lon > 180.0) {
            _lon = _lon - 360.0;
        }

        flight_path.push([_lat, _lon, item.altitude]);
    });

    // Add the Descent or Float track to the flight path array.
    descent.forEach(function (item, index) {
        var _lat = item.latitude;
        var _lon = item.longitude;
        // Correct for API giving us longitudes outside [-180, 180]
        if (_lon > 180.0) {
            _lon = _lon - 360.0;
        }

        flight_path.push([_lat, _lon, item.altitude]);
    });

    // Populate the launch, burst and landing points
    var launch_obj = ascent[0];
    var _lon = launch_obj.longitude;
    if (_lon > 180.0) {
        _lon = _lon - 360.0;
    }
    launch.latlng = L.latLng([launch_obj.latitude, _lon, launch_obj.altitude]);
    launch.datetime = moment.utc(launch_obj.datetime);

    var burst_obj = descent[0];
    var _lon = burst_obj.longitude;
    if (_lon > 180.0) {
        _lon = _lon - 360.0;
    }
    burst.latlng = L.latLng([burst_obj.latitude, _lon, burst_obj.altitude]);
    burst.datetime = moment.utc(burst_obj.datetime);

    var landing_obj = descent[descent.length - 1];
    var _lon = landing_obj.longitude;
    if (_lon > 180.0) {
        _lon = _lon - 360.0;
    }
    landing.latlng = L.latLng([landing_obj.latitude, _lon, landing_obj.altitude]);
    landing.datetime = moment.utc(landing_obj.datetime);

    var profile = null;
    if (prediction[1].stage == 'descent') {
        profile = 'standard_profile';
    } else {
        profile = 'float_profile';
    }

    var flight_time = landing.datetime.diff(launch.datetime, 'seconds');

    // Convert to JST for display objects (internally we keep moment objects but add 9h for formatting if strictly needed,
    // but here we just want the values to be correct for display.
    // However, the cleanest way is to add 9 hours in the display function, NOT here, 
    // to preserve the logic that these are "Moments in Time". 
    // But since the UI assumes JST, let's keep it consistent.
    // Actually, let's leave them as UTC here and convert in plotStandardPrediction.

    return { 'flight_path': flight_path, 'launch': launch, 'burst': burst, 'landing': landing, 'profile': profile, 'flight_time': flight_time };
}

function getJSTFormatted(momentObj) {
    return moment(momentObj).utcOffset(9 * 60).format("HH:mm");
}
function getJSTFullFormatted(momentObj) {
    return moment(momentObj).utcOffset(9 * 60).format("YYYY/MM/DD HH:mm:ss");
}
function getJSTDateTimeFormatted(momentObj) {
    var m = moment(momentObj).utcOffset(9 * 60);
    return m.format("YYYY") + "年" + m.format("M") + "月" + m.format("D") + "日" + m.format("HH:mm");
}


var landing_history_markers = [];


function updatePosList(launch, burst, landing) {

    var tbody = $("#pos_list_body");

    var siteName = $("#site option:selected").text();
    var t = getJSTDateTimeFormatted(launch.datetime);
    var lat = landing.latlng.lat.toFixed(4);
    var lon = landing.latlng.lng.toFixed(4);
    var uniqueId = Date.now();

    // Create clickable link for panning
    var locLink = '<a href="#" onclick="map.panTo(new L.LatLng(' + lat + ', ' + lon + ')); return false;">' + lat + ', ' + lon + '</a>';

    var row = "<tr id='tr_" + uniqueId + "'>" +
        "<td>" + siteName + "</td>" +
        "<td>" + t + "</td>" +
        "<td>" + locLink + "</td>" +
        "<td id='land_sea_" + uniqueId + "'>判定中...</td>" +
        "</tr>";

    tbody.prepend(row); // Prepend to show newest first

    // Add click event for the newly created row
    $("#tr_" + uniqueId).css("cursor", "pointer").on("click", function () {
        // Find corresponding marker in history
        for (var i = 0; i < landing_history_markers.length; i++) {
            var m = landing_history_markers[i];
            if (m.uniqueId === uniqueId) {
                map.panTo(m.getLatLng());
                m.openPopup();
                toggleHistoryPath(m);
                break;
            }
        }
    });

    return uniqueId;
}

/**
 * Toggles visibility of a historical path.
 * @param {L.Marker} marker 
 */
function toggleHistoryPath(marker) {
    if (!marker.associatedPath) return;

    var isVisible = marker.associatedPath.options.opacity > 0;

    // Dim all other history paths first (optional but keeps map clean)
    for (var i = 0; i < landing_history_markers.length; i++) {
        var other = landing_history_markers[i];
        if (other.associatedPath) {
            other.associatedPath.setStyle({ opacity: 0, weight: 3 });
        }
    }

    // Toggle the targeted one
    if (!isVisible) {
        marker.associatedPath.setStyle({ opacity: 0.8, weight: 4 });
        marker.associatedPath.bringToFront();
        $("#tr_" + marker.uniqueId).addClass("active-path");
    } else {
        marker.associatedPath.setStyle({ opacity: 0 });
        $("#tr_" + marker.uniqueId).removeClass("active-path");
    }
}

function plotStandardPrediction(prediction) {

    appendDebug("Flight data parsed, creating map plot...");
    clearMapItems();

    var siteName = $("#site option:selected").text();
    var launch = prediction.launch;
    var landing = prediction.landing;
    var burst = prediction.burst;

    // Calculate range and time of flight
    var range = distHaversine(launch.latlng, landing.latlng, 1);
    var flighttime = "";
    var f_hours = Math.floor(prediction.flight_time / 3600);
    var f_minutes = Math.floor(((prediction.flight_time % 86400) % 3600) / 60);
    if (f_minutes < 10) f_minutes = "0" + f_minutes;
    flighttime = f_hours + "hr" + f_minutes;
    $("#cursor_pred_range").html(range);
    $("#cursor_pred_time").html(flighttime);
    cursorPredShow();

    // Make some nice icons
    var launch_icon = L.icon({
        iconUrl: launch_img,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });

    var land_icon = L.icon({
        iconUrl: land_img,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });

    var burst_icon = L.icon({
        iconUrl: burst_img,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });


    var launch_marker = L.marker(
        launch.latlng,
        {
            title: 'Balloon launch (' + launch.latlng.lat.toFixed(4) + ', ' + launch.latlng.lng.toFixed(4) + ') at '
                + getJSTFormatted(launch.datetime) + " JST",
            icon: launch_icon
        }
    ).addTo(map);

    // B1: launch popup
    var launchPopup = '<b>Launch</b><br>' +
        '<b>Site:</b> ' + siteName + '<br>' +
        '<b>Time:</b> ' + getJSTDateTimeFormatted(launch.datetime) + ' JST<br>' +
        '<b>Pos:</b> ' + launch.latlng.lat.toFixed(4) + ', ' + launch.latlng.lng.toFixed(4) + '<br>' +
        '<b>Ascent:</b> ' + parseFloat($('#ascent').val()).toFixed(2) + ' m/s<br>' +
        '<b>Descent:</b> ' + parseFloat($('#drag').val()).toFixed(2) + ' m/s<br>' +
        '<b>Burst Alt:</b> ' + parseFloat($('#burst').val()).toFixed(0) + ' m';
    launch_marker.bindPopup(launchPopup);

    var land_marker = L.marker(
        landing.latlng,
        {
            title: 'Predicted Landing (' + landing.latlng.lat.toFixed(4) + ', ' + landing.latlng.lng.toFixed(4) + ') at '
                + getJSTFormatted(landing.datetime) + " JST",
            icon: land_icon
        }
    ).addTo(map);

    // 項目5: 着地マーカーにポップアップを追加（落下時刻JST表示）
    var landPopupContent = '<b>着地予測</b><br>' +
        '<b>落下時刻:</b> ' + getJSTDateTimeFormatted(landing.datetime) + ' JST<br>' +
        '<b>座標:</b> ' + landing.latlng.lat.toFixed(4) + ', ' + landing.latlng.lng.toFixed(4) + '<br>' +
        '<b>打ち上げ場所:</b> ' + siteName + '<br>' +
        '<b>飛行時間:</b> ' + flighttime + '<br>' +
        '<b>到達距離:</b> ' + range + ' km';
    land_marker.bindPopup(landPopupContent);

    var pop_marker = L.marker(
        burst.latlng,
        {
            title: 'Balloon burst (' + burst.latlng.lat.toFixed(4) + ', ' + burst.latlng.lng.toFixed(4) +
                ' at altitude ' + burst.latlng.alt.toFixed(0) + ') at '
                + getJSTFormatted(burst.datetime) + " JST",
            icon: burst_icon
        }
    ).addTo(map);

    // B1: burst popup
    var burstPopup = '<b>バースト地点</b><br>' +
        '<b>時刻:</b> ' + getJSTDateTimeFormatted(burst.datetime) + ' JST<br>' +
        '<b>座標:</b> ' + burst.latlng.lat.toFixed(4) + ', ' + burst.latlng.lng.toFixed(4) + '<br>' +
        '<b>高度:</b> ' + burst.latlng.alt.toFixed(0) + ' m';
    pop_marker.bindPopup(burstPopup);

    var path_polyline = L.polyline(
        prediction.flight_path,
        {
            weight: 3,
            color: '#000000'
        }
    ).addTo(map);



    // Add the launch/land markers to map
    // We might need access to these later, so push them associatively
    map_items['launch_marker'] = launch_marker;
    map_items['land_marker'] = land_marker;
    map_items['pop_marker'] = pop_marker;
    map_items['path_polyline'] = path_polyline;

    // --- Persistent History Marker with Path ---
    var siteName_hist = $("#site option:selected").text();
    var launchTimeJST = getJSTDateTimeFormatted(launch.datetime);

    // Create a NEW polyline for history (independent of map_items)
    var history_path = L.polyline(
        prediction.flight_path,
        {
            weight: 3,
            color: '#000000',
            opacity: 0 // Hidden by default
        }
    ).addTo(map);

    var historyMarker = L.marker(landing.latlng, {
        icon: land_icon
    }).bindPopup("<b>打ち上げ場所:</b> " + siteName_hist + "<br><b>打ち上げ時刻 (JST):</b> " + launchTimeJST + "<br><small>クリックで軌跡を表示</small>");

    historyMarker.associatedPath = history_path;
    historyMarker.on('click', function () {
        toggleHistoryPath(historyMarker);
    });
    historyMarker.addTo(map);
    landing_history_markers.push(historyMarker);
    // ---------------------------------

    // Pan to the new position
    map.setView(launch.latlng, 8)

    // D1: 放球場所の風速をUIに反映
    computeSurfaceWind(prediction.trajectory);

    // Update List

    var rowId = updatePosList(launch, burst, landing);
    historyMarker.uniqueId = rowId; // Link them

    // Land/Sea Check
    checkLandSea(landing.latlng.lat, landing.latlng.lng, rowId);

    return true;
}

function checkLandSea(lat, lon, rowId) {
    $("#landing_type").text("判定中...");
    $("#landing_type").css("color", "red");
    if (rowId) {
        $("#land_sea_" + rowId).text("判定中...");
        $("#land_sea_" + rowId).css("color", "red");
    }

    classifyLandSeaAt(lat, lon, function (isWater) {
        if (isWater === true) {
            updateLandSeaUI(true, rowId);
            return;
        }
        if (isWater === false) {
            updateLandSeaUI(false, rowId);
            return;
        }
        $("#landing_type").text("不明 (Unknown)").css("color", "gray");
        if (rowId) {
            $("#land_sea_" + rowId).text("不明 (Unknown)").css("color", "gray");
        }
    });
}

var _landSeaDecisionCache = {};
var _landSeaDecisionCacheKeys = [];
var LANDSEA_DECISION_CACHE_LIMIT = 400;

function cacheLandSeaDecision(lat, lon, isWater) {
    var key = lat.toFixed(4) + ',' + lon.toFixed(4);
    _landSeaDecisionCache[key] = isWater;
    _landSeaDecisionCacheKeys.push(key);
    if (_landSeaDecisionCacheKeys.length > LANDSEA_DECISION_CACHE_LIMIT) {
        var oldKey = _landSeaDecisionCacheKeys.shift();
        delete _landSeaDecisionCache[oldKey];
    }
}

function getCachedLandSeaDecision(lat, lon) {
    var key = lat.toFixed(4) + ',' + lon.toFixed(4);
    if (_landSeaDecisionCache.hasOwnProperty(key)) {
        return _landSeaDecisionCache[key];
    }
    return undefined;
}

function monteCarloLandSeaAt(lat, lon) {
    if (typeof LandSea === 'undefined' || !LandSea.isLand) return null;

    var localResult = LandSea.isLand(lat, lon);
    var nearCoast = LandSea.isNearCoast ? LandSea.isNearCoast(lat, lon) : true;

    if (!nearCoast) {
        if (localResult === true) return false;
        if (localResult === false) return null;
    }

    if (localResult === null) return null;

    var sampleCount = nearCoast ? 32 : 12;
    var radiusDeg = nearCoast ? 0.010 : 0.006;
    var landVotes = 0;
    var seaVotes = 0;

    for (var i = 0; i < sampleCount; i++) {
        var theta = Math.random() * Math.PI * 2;
        var r = radiusDeg * Math.sqrt(Math.random());
        var sampleLat = lat + Math.sin(theta) * r;
        var sampleLon = lon + Math.cos(theta) * r;
        var sampleLand = LandSea.isLand(sampleLat, sampleLon);
        if (sampleLand === true) landVotes++;
        else if (sampleLand === false) seaVotes++;
    }

    var totalVotes = landVotes + seaVotes;
    if (totalVotes === 0) return null;

    var landRatio = landVotes / totalVotes;
    var seaRatio = seaVotes / totalVotes;
    if (landRatio >= 0.65) return false;
    if (seaRatio >= 0.65) return true;
    return null;
}

// 単発/13バリアント/放球NG判定で共有する海陸判定
function classifyLandSeaAt(lat, lon, callback) {
    var cached = getCachedLandSeaDecision(lat, lon);
    if (typeof cached !== 'undefined') {
        callback(cached);
        return;
    }

    var geoJsonResult = null;
    var nearCoast = true;

    if (typeof LandSea !== 'undefined') {
        geoJsonResult = LandSea.isLand(lat, lon);
        nearCoast = LandSea.isNearCoast(lat, lon);
    }

    // 内陸かつ海岸から十分離れている場合はローカル判定を優先
    if (geoJsonResult === true && !nearCoast) {
        queryInlandWaterAt(lat, lon, function (inlandWater, err) {
            if (err) {
                cacheLandSeaDecision(lat, lon, false);
                callback(false);
                return;
            }
            var result = inlandWater === true ? true : false;
            cacheLandSeaDecision(lat, lon, result);
            callback(result);
        });
        return;
    }

    // ローカル GeoJSON が海を返した場合でも、山間部の欠損誤判定を避けるため
    // BigDataCloud と内陸水域チェックで再確認する。
    // 沿岸付近ではローカルGeoJSONのモンテカルロ近似を先に使って高速・高精度化
    var monteCarloResult = monteCarloLandSeaAt(lat, lon);
    if (monteCarloResult !== null) {
        cacheLandSeaDecision(lat, lon, monteCarloResult);
        callback(monteCarloResult);
        return;
    }

    var api_url = "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=en";

    $.getJSON(api_url, function (data) {
        var isWater = true;
        var seaEvidence = false;
        var territorialEvidence = false;
        var inlandLandEvidence = false;

        if (data.countryCode && data.countryCode !== "") {
            isWater = false;
        }

        if (data.localityInfo && data.localityInfo.informative) {
            var seaKeywords = ["sea", "ocean", "bay", "gulf", "strait", "channel", "sound", "water", "湾", "海", "灘", "offshore"];
            var territorialKeywords = ["territorial sea", "territorial water", "internal waters"];

            for (var i = 0; i < data.localityInfo.informative.length; i++) {
                var info = data.localityInfo.informative[i];
                var name = (info.name || '').toLowerCase();
                var desc = (info.description || '').toLowerCase();

                for (var tk = 0; tk < territorialKeywords.length; tk++) {
                    if (name.indexOf(territorialKeywords[tk]) !== -1 || desc.indexOf(territorialKeywords[tk]) !== -1) {
                        territorialEvidence = true;
                        break;
                    }
                }

                if (info.order <= 6) {
                    for (var sk = 0; sk < seaKeywords.length; sk++) {
                        if (name.indexOf(seaKeywords[sk]) !== -1 || desc.indexOf(seaKeywords[sk]) !== -1) {
                            seaEvidence = true;
                            break;
                        }
                    }
                }

                if (name.indexOf('prefecture') !== -1 || name.indexOf('city') !== -1 || name.indexOf('municipality') !== -1) {
                    inlandLandEvidence = true;
                }
            }
        }

        if (territorialEvidence || seaEvidence) {
            cacheLandSeaDecision(lat, lon, true);
            callback(true);
            return;
        }

        // APIが陸、ローカルが海、かつ海岸付近なら海を優先
        if (!isWater && geoJsonResult === false && nearCoast && !inlandLandEvidence) {
            cacheLandSeaDecision(lat, lon, true);
            callback(true);
            return;
        }

        // API上で海判定なら即海
        if (isWater) {
            cacheLandSeaDecision(lat, lon, true);
            callback(true);
            return;
        }

        // APIが陸判定なら内陸水域を最終確認
        queryInlandWaterAt(lat, lon, function (inlandWater, err) {
            if (err) {
                cacheLandSeaDecision(lat, lon, false);
                callback(false);
                return;
            }
            var result = inlandWater === true ? true : false;
            cacheLandSeaDecision(lat, lon, result);
            callback(result);
        });
    }).fail(function () {
        // API失敗時のフォールバック
        if (geoJsonResult === true) {
            queryInlandWaterAt(lat, lon, function (inlandWater, _err) {
                var result = inlandWater === true ? true : false;
                cacheLandSeaDecision(lat, lon, result);
                callback(result);
            });
            return;
        }
        if (geoJsonResult === false) {
            cacheLandSeaDecision(lat, lon, true);
            callback(true);
            return;
        }
        callback(null);
    });
}

// Overpass APIで内陸水域を問い合わせる共通関数
function queryInlandWaterAt(lat, lon, callback) {
    var query = '[out:json][timeout:10];('
        + 'way["natural"="water"](around:50,' + lat + ',' + lon + ');'
        + 'relation["natural"="water"](around:50,' + lat + ',' + lon + ');'
        + 'way["waterway"](around:30,' + lat + ',' + lon + ');'
        + ');out count;';

    var api_url = "https://overpass-api.de/api/interpreter";
    appendDebug("Check inland water (Overpass): lat=" + lat + ", lon=" + lon);

    $.ajax({
        url: api_url,
        type: "POST",
        data: { data: query },
        dataType: "json",
        timeout: 15000,
        success: function (data) {
            var count = 0;
            if (data.elements && data.elements.length > 0) {
                count = parseInt(data.elements[0].tags.total) || 0;
            }
            var isWater = (count > 0);
            appendDebug("Overpass inland water count: " + count + " -> " + (isWater ? "WATER" : "LAND"));
            if (callback) callback(isWater, null);
        },
        error: function (jqxhr, textStatus, error) {
            appendDebug("Overpass failed: " + textStatus + ", " + error);
            if (callback) callback(null, textStatus || error || 'overpass error');
        }
    });
}

// Step 2: Check for inland water bodies (lakes, rivers) using Overpass API
function checkInlandWater(lat, lon, rowId) {
    queryInlandWaterAt(lat, lon, function (isWater, err) {
        if (err) {
            // Overpass failed, but BigDataCloud said land — report as land
            appendDebug("Overpass failed -> assuming LAND (BigDataCloud had countryCode)");
            updateLandSeaUI(false, rowId);
            return;
        }
        updateLandSeaUI(!!isWater, rowId);
    });
}

// 海陸判定結果のUI更新
function updateLandSeaUI(isWater, rowId) {
    var text = "";
    var color = "";

    if (isWater) {
        text = "海 (Sea)";
        color = "blue";
    } else {
        text = "陸 (Land)";
        color = "green";
    }

    // Update Main UI
    $("#landing_type").text(text);
    $("#landing_type").css("color", color);

    // Update Table Row if ID provided
    if (rowId) {
        $("#land_sea_" + rowId).text(text);
        $("#land_sea_" + rowId).css("color", color);
    }

    // トースト通知（Phase 3）
    if (typeof showToast === 'function') {
        if (isWater) {
            showToast('着地予測: 海上に落下', 'warning', 5000);
        } else {
            showToast('着地予測: 陸地に落下', 'success', 4000);
        }
    }
}


// Populate and enable the download CSV, KML and Pan To links, and write the 
// time the prediction was run and the model used to the Scenario Info window
function writePredictionInfo(settings, metadata, request, api_url) {
    // populate the download links

    // Create the API URLs based on the current prediction settings
    // API URLが渡されない場合はデフォルトを使用
    if (!api_url) api_url = "/api/v1/";
    _base_url = api_url + "?" + $.param(settings)
    _csv_url = _base_url + "&format=csv";
    _kml_url = _base_url + "&format=kml";


    $("#dlcsv").attr("href", _csv_url);
    $("#dlkml").attr("href", _kml_url);
    $("#panto").click(function () {
        map.panTo(map_items['launch_marker'].getLatLng());
        //map.setZoom(7);
    });

    var run_time = moment.utc(metadata.complete_datetime).add(9, 'hours').format("YYYY/MM/DD HH:mm:ss");
    var dataset = moment.utc(request.dataset).add(9, 'hours').format("YYYYMMDD-HH");


    $("#run_time").html(run_time);
    $("#dataset").html(dataset);
}


function processHourlyTawhiriResults(data, settings, current_hour) {
    // Process results from a Tawhiri run.

    if (data.hasOwnProperty('error')) {
        // The prediction API has returned an error.
        throwError("Predictor returned error: " + data.error.description)
    } else {

        var prediction_results = parsePrediction(data.prediction);

        // Save prediction data into our hourly predictor data store.
        hourly_predictions[current_hour]['results'] = prediction_results;

        // Now plot...
        plotMultiplePrediction(prediction_results, current_hour);

        writeHourlyPredictionInfo(settings, data.metadata, data.request);

    }

    //console.log(data);

}

function plotMultiplePrediction(prediction, current_hour) {

    var launch = prediction.launch;
    var landing = prediction.landing;
    var burst = prediction.burst;


    // Make some nice icons
    var launch_icon = L.icon({
        iconUrl: launch_img,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });


    if (!map_items.hasOwnProperty("launch_marker")) {
        var launch_marker = L.marker(
            launch.latlng,
            {
                title: 'Balloon launch (' + launch.latlng.lat.toFixed(4) + ', ' + launch.latlng.lng.toFixed(4) + ')',
                icon: launch_icon
            }
        ).addTo(map);

        map_items['launch_marker'] = launch_marker;
    }

    var iconColour = ConvertRGBtoHex(evaluate_cmap((current_hour / MAX_PRED_HOURS), 'turbo'));
    var land_marker = new L.CircleMarker(landing.latlng, {
        radius: 5,
        fillOpacity: 1.0,
        zIndexOffset: 1000,
        fillColor: iconColour,
        stroke: true,
        weight: 1,
        color: "#000000",
        title: '<b>Launch Time: </b>' + launch.datetime.format() + '<br/>' + 'Predicted Landing (' + landing.latlng.lat.toFixed(4) + ', ' + landing.latlng.lng.toFixed(4) + ')',
        current_hour: current_hour // Added in so we can extract this when we get a click event.
    }).addTo(map);

    var _base_url = "/api/v1/" + "?" + $.param(hourly_predictions[current_hour]['settings'])
    var _csv_url = _base_url + "&format=csv";
    var _kml_url = _base_url + "&format=kml";

    var predict_description = '<b>Launch Time: </b>' + launch.datetime.format() + '<br/>' +
        '<b>Predicted Landing:</b> ' + landing.latlng.lat.toFixed(4) + ', ' + landing.latlng.lng.toFixed(4) + '</br>' +
        '<b>Landing Time: </b>' + landing.datetime.format() + '<br/>' +
        '<b>Download: </b> <a href="' + _kml_url + '" target="_blank">KML</a>  <a href="' + _csv_url + '" target="_blank">CSV</a></br>';

    var landing_popup = new L.popup(
        {
            autoClose: false,
            closeOnClick: false,
        }).setContent(predict_description);
    land_marker.bindPopup(landing_popup);
    land_marker.on('click', showHideHourlyPrediction);

    hourly_predictions[current_hour]['layers']['landing_marker'] = land_marker;
    hourly_predictions[current_hour]['landing_latlng'] = landing.latlng;

    // Generate polyline latlons.
    landing_track = [];
    landing_track_complete = true;
    for (i in hourly_predictions) {
        if (hourly_predictions[i]['landing_latlng']) {
            landing_track.push(hourly_predictions[i]['landing_latlng']);
        } else {
            landing_track_complete = false;
        }
    }
    // If we dont have any undefined elements, plot.
    if (landing_track_complete) {
        if (hourly_polyline) {
            hourly_polyline.setLatLngs(landing_track);
        } else {
            hourly_polyline = L.polyline(
                landing_track,
                {
                    weight: 2,
                    zIndexOffset: 100,
                    color: '#000000'
                }
            ).addTo(map);
        }

        for (i in hourly_predictions) {
            hourly_predictions[i]['layers']['landing_marker'].remove();
            hourly_predictions[i]['layers']['landing_marker'].addTo(map);
        }

        map.fitBounds(hourly_polyline.getBounds());
        map.setZoom(8);

        $("#cursor_pred_lastrun").show();

    }

    // var pop_marker = L.marker(
    //     burst.latlng,
    //     {
    //         title: 'Balloon burst ('+burst.latlng.lat.toFixed(4)+', '+burst.latlng.lng.toFixed(4)+ 
    //         ' at altitude ' + burst.latlng.alt.toFixed(0) + ') at ' 
    //         + burst.datetime.format("HH:mm") + " UTC",
    //         icon: burst_icon
    //     }
    // ).addTo(map);

    // var path_polyline = L.polyline(
    //     prediction.flight_path,
    //     {
    //         weight: 3,
    //         color: '#000000'
    //     }
    // ).addTo(map);



    // Pan to the new position
    // map.panTo(launch.latlng);
    // map.setZoom(8);

    return true;
}

function showHideHourlyPrediction(e) {

    // Extract the current hour from the marker options.
    var current_hour = e.target.options.current_hour;
    var current_pred = hourly_predictions[current_hour]['results'];
    var landing = current_pred.landing;
    var launch = current_pred.launch;
    var burst = current_pred.burst;


    if (hourly_predictions[current_hour]['layers'].hasOwnProperty('flight_path')) {
        // Flight path layer already exists, remove it and the burst icon.
        hourly_predictions[current_hour]['layers']['flight_path'].remove()
        hourly_predictions[current_hour]['layers']['pop_marker'].remove()
        delete hourly_predictions[current_hour]['layers'].flight_path;
        delete hourly_predictions[current_hour]['layers'].pop_marker;

    } else {
        // We need to make new icons.

        var burst_icon = L.icon({
            iconUrl: burst_img,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        var pop_marker = L.marker(
            burst.latlng,
            {
                title: 'Balloon burst (' + burst.latlng.lat.toFixed(4) + ', ' + burst.latlng.lng.toFixed(4) +
                    ' at altitude ' + burst.latlng.alt.toFixed(0) + ') at '
                    + burst.datetime.format("HH:mm") + " UTC",
                icon: burst_icon,
                current_hour: current_hour
            }
        ).addTo(map);

        hourly_predictions[current_hour]['layers']['pop_marker'] = pop_marker;

        var path_polyline = L.polyline(
            current_pred.flight_path,
            {
                weight: 3,
                color: '#000000',
                current_hour: current_hour
            }
        ).addTo(map);
        path_polyline.on('click', showHideHourlyPrediction);

        hourly_predictions[current_hour]['layers']['flight_path'] = path_polyline;
    }

}

function writeHourlyPredictionInfo(settings, metadata, request) {
    // populate the download links

    // // Create the API URLs based on the current prediction settings
    // _base_url = tawhiri_api + "?" + $.param(settings) 
    // _csv_url = _base_url + "&format=csv";
    // _kml_url = _base_url + "&format=kml";


    // $("#dlcsv").attr("href", _csv_url);
    // $("#dlkml").attr("href", _kml_url);
    // $("#panto").click(function() {
    //         map.panTo(map_items['launch_marker'].getLatLng());
    //         //map.setZoom(7);
    // });

    var run_time = moment.utc(metadata.complete_datetime).format();
    var dataset = moment.utc(request.dataset).format("YYYYMMDD-HH");


    $("#run_time").html(run_time);
    $("#dataset").html(dataset);
}

var batchSites = [
    "南レク南楽園ファミリーパーク",
    "津島プレーランド",
    "須ノ川公園キャンプ場",
    "南レク松軒山公園",
    "南レク御荘公園",
    "南レク城辺公園",
    "土佐西南大規模公園",
    "一本松温泉あけぼの荘"
];

var _batchSimulationState = {
    active: false,
    sites: [],
    index: 0,
    saveTimeout: null
};

function clearBatchSimulationState() {
    if (_batchSimulationState.saveTimeout) {
        clearTimeout(_batchSimulationState.saveTimeout);
        _batchSimulationState.saveTimeout = null;
    }
    _batchSimulationState.active = false;
    _batchSimulationState.sites = [];
    _batchSimulationState.index = 0;
}

function queueNextBatchSite() {
    if (!_batchSimulationState.active) return;

    if (_batchSimulationState.saveTimeout) {
        clearTimeout(_batchSimulationState.saveTimeout);
        _batchSimulationState.saveTimeout = null;
    }

    _batchSimulationState.index++;
    if (_batchSimulationState.index >= _batchSimulationState.sites.length) {
        clearBatchSimulationState();
        if (typeof showToast === 'function') {
            showToast('南レク一括計算が完了しました', 'success', 4000);
        }
        return;
    }

    setTimeout(function () {
        runNextBatchSite();
    }, 1500);
}

function runNextBatchSite() {
    if (!_batchSimulationState.active) return;

    if (_batchSimulationState.index >= _batchSimulationState.sites.length) {
        clearBatchSimulationState();
        return;
    }

    var site = _batchSimulationState.sites[_batchSimulationState.index];
    $("#site").val(site);

    var startPrediction = function () {
        if (typeof showToast === 'function') {
            showToast('一括計算中: ' + site, 'info', 1500);
        }

        if (_batchSimulationState.saveTimeout) {
            clearTimeout(_batchSimulationState.saveTimeout);
        }

        _batchSimulationState.saveTimeout = setTimeout(function () {
            appendDebug('南レク一括: ' + site + ' の保存待ちがタイムアウトしました。次の地点へ進みます。');
            queueNextBatchSite();
        }, 240000);

        runPrediction();
    };

    if (typeof changeLaunchSite === 'function') {
        changeLaunchSite(startPrediction);
    } else {
        startPrediction();
    }
}

function runBatchSimulation() {
    if (_batchSimulationState.active) {
        if (typeof showToast === 'function') {
            showToast('南レク一括計算は実行中です', 'warning', 2500);
        }
        return;
    }

    _batchSimulationState.active = true;
    _batchSimulationState.sites = batchSites.slice();
    _batchSimulationState.index = 0;

    if (typeof showToast === 'function') {
        showToast('南レク一括計算を開始します', 'info', 2500);
    }

    runNextBatchSite();
}

// ============================================================
// 13 Variant Ensemble (Ehime Balloon Experiment Mode)
// ============================================================

function run13VariantEnsemble(settings, api_url) {
    if (!api_url) api_url = "/api/v1/";

    // 外部から設定が渡された場合はそれを優先し、未指定時のみフォーム値を使用する
    // 放球ウィンドウ分析のBASE結果と13バリアントBASE結果の不一致を防ぐ
    var run_settings = settings ? JSON.parse(JSON.stringify(settings)) : getSettings();

    appendDebug("Running 13-Variant Ensemble (Ehime Mode)...");
    clearMapItems();

    // Show statistics panel and clear results table
    $("#ensemble_stats_panel").show();
    // 表示切替
    if (typeof switchTab === 'function') switchTab('results');

    $("#ehime_results_body").empty();
    $("#ehime_results_mobile").empty();
    $("#ensemble_completed").text("0");
    $("#ensemble_total").text("13");
    $("#ensemble_mean_pos").text("-");
    $("#ensemble_max_dev").text("-");
    $("#ensemble_land_pct").text("-");
    $("#ensemble_sea_pct").text("-");

    var baseAscent = run_settings.ascent_rate;
    var baseDescent = run_settings.descent_rate;
    var baseBurst = run_settings.burst_altitude;

    // Margin definitions
    var ASC_MARGIN = 1;     // ±1 m/s
    var DES_MARGIN = 3;     // ±3 m/s
    var BURST_PLUS = 0.10;  // +10%
    var BURST_MINUS = 0.20; // -20%

    // Define the 13 variants
    var variants = [
        { label: "BASE", ascent: 0, descent: 0, burstFactor: 0, desc: "基準 (変更なし)" },
        { label: "ASC-", ascent: -ASC_MARGIN, descent: 0, burstFactor: 0, desc: "上昇 -" + ASC_MARGIN + " m/s" },
        { label: "ASC+", ascent: +ASC_MARGIN, descent: 0, burstFactor: 0, desc: "上昇 +" + ASC_MARGIN + " m/s" },
        { label: "DES-", ascent: 0, descent: -DES_MARGIN, burstFactor: 0, desc: "下降 -" + DES_MARGIN + " m/s" },
        { label: "DES+", ascent: 0, descent: +DES_MARGIN, burstFactor: 0, desc: "下降 +" + DES_MARGIN + " m/s" },
        { label: "BURST-", ascent: 0, descent: 0, burstFactor: -BURST_MINUS, desc: "破裂高度 -" + (BURST_MINUS * 100) + "%" },
        { label: "BURST+", ascent: 0, descent: 0, burstFactor: +BURST_PLUS, desc: "破裂高度 +" + (BURST_PLUS * 100) + "%" },
        { label: "A-D-", ascent: -ASC_MARGIN, descent: -DES_MARGIN, burstFactor: 0, desc: "上昇 -" + ASC_MARGIN + " & 下降 -" + DES_MARGIN },
        { label: "A+D+", ascent: +ASC_MARGIN, descent: +DES_MARGIN, burstFactor: 0, desc: "上昇 +" + ASC_MARGIN + " & 下降 +" + DES_MARGIN },
        { label: "A-B-", ascent: -ASC_MARGIN, descent: 0, burstFactor: -BURST_MINUS, desc: "上昇 -" + ASC_MARGIN + " & 破裂 -" + (BURST_MINUS * 100) + "%" },
        { label: "A+B+", ascent: +ASC_MARGIN, descent: 0, burstFactor: +BURST_PLUS, desc: "上昇 +" + ASC_MARGIN + " & 破裂 +" + (BURST_PLUS * 100) + "%" },
        { label: "D-B-", ascent: 0, descent: -DES_MARGIN, burstFactor: -BURST_MINUS, desc: "下降 -" + DES_MARGIN + " & 破裂 -" + (BURST_MINUS * 100) + "%" },
        { label: "D+B+", ascent: 0, descent: +DES_MARGIN, burstFactor: +BURST_PLUS, desc: "下降 +" + DES_MARGIN + " & 破裂 +" + (BURST_PLUS * 100) + "%" }
    ];

    var completed = 0;
    var landingPoints = [];  // { lat, lng, label, isWater }
    var totalVariants = variants.length;
    var pendingHistoryChecks = totalVariants;
    var historySaved = false;

    function finalizeHistoryCheck() {
        pendingHistoryChecks--;
        if (pendingHistoryChecks <= 0 && !historySaved) {
            historySaved = true;
            saveEhimeHistory(landingPoints, run_settings);
        }
    }

    // グローバル結果をリセット
    _ensembleResults = [];
    // 着地予測エリアは次回描画時に再生成されるため、既存レイヤーだけ先に消す
    if (map_items && map_items['13var_hull']) {
        try { map.removeLayer(map_items['13var_hull']); } catch (_e) { }
        delete map_items['13var_hull'];
    }

    // D4: アンサンブル統計パネルを表示 (Launch Window 等からの呼び出し用)
    $('#ensemble_stats_panel').show();


    // Color palette for variants
    var variantColors = [
        '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
        '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
        '#469990', '#dcbeff', '#9A6324'
    ];

    // Pre-populate table with empty rows to ensure sorting by index
    for (var i = 0; i < totalVariants; i++) {
        var rowId = "ehime_row_" + i;
        var color = variantColors[i % variantColors.length];
        var v = variants[i];
        var row = '<tr id="' + rowId + '">' +
            '<td>' + (i + 1) + '</td>' +
            '<td><span class="color-swatch" style="background:' + color + ';"></span></td>' +
            '<td><b>' + v.label + '</b></td>' +
            '<td>' + v.desc + '</td>' +
            '<td colspan="7" style="text-align:center; color:gray;">計算中...</td>' +
            '</tr>';
        $("#ehime_results_body").append(row);
    }

    for (var i = 0; i < totalVariants; i++) {
        var v = variants[i];
        var iterSettings = JSON.parse(JSON.stringify(run_settings));
        // Remove pred_type so API doesn't get confused
        delete iterSettings.pred_type;

        iterSettings.ascent_rate = baseAscent + v.ascent;
        iterSettings.descent_rate = baseDescent + v.descent;
        iterSettings.burst_altitude = baseBurst * (1 + v.burstFactor);

        // Ensure descent rate is positive
        if (iterSettings.descent_rate <= 0) iterSettings.descent_rate = 0.5;

        (function (idx, variant, currentSets, color) {
            $.get(api_url, currentSets)
                .done(function (data) {
                    var res = parsePrediction(data.prediction);
                    plot13VariantPath(res, idx, variant, color, currentSets, data);

                    // Compute flight time string
                    var ftSec = res.flight_time;
                    var ftH = Math.floor(ftSec / 3600);
                    var ftM = Math.floor((ftSec % 3600) / 60);
                    var flightTimeStr = ftH + "h" + (ftM < 10 ? "0" : "") + ftM + "m";

                    // 着地点データを保存
                    var lp = {
                        lat: res.landing.latlng.lat,
                        lng: res.landing.latlng.lng,
                        label: variant.label,
                        isWater: null
                    };
                    landingPoints.push(lp);

                    // グローバル結果配列にも詳細データを保存（エクスポート用）
                    _ensembleResults.push({
                        index: idx,
                        label: variant.label,
                        description: variant.desc,
                        flight_path: res.flight_path,
                        lat: res.landing.latlng.lat,
                        lng: res.landing.latlng.lng,
                        launch_datetime: res.launch.datetime.toISOString(),
                        burst_datetime: res.burst.datetime.toISOString(),
                        landing_datetime: res.landing.datetime.toISOString(),
                        ascent_rate: currentSets.ascent_rate,
                        descent_rate: currentSets.descent_rate,
                        burst_altitude: currentSets.burst_altitude,
                        flight_time_sec: res.flight_time,
                        flight_time_str: flightTimeStr,
                        launch_lat: res.launch.latlng.lat,
                        launch_lng: res.launch.latlng.lng,
                        burst_lat: res.burst.latlng.lat,
                        burst_lng: res.burst.latlng.lng,
                        burst_alt: res.burst.latlng.alt,
                        isWater: null  // 後で更新
                    });

                    // Update existing row in Ehime results table
                    var rowId = "ehime_row_" + idx;
                    var rowContent =
                        '<td>' + (idx + 1) + '</td>' +
                        '<td><span class="color-swatch" style="background:' + color + ';"></span></td>' +
                        '<td><b>' + variant.label + '</b></td>' +
                        '<td>' + variant.desc + '</td>' +
                        '<td>' + res.landing.latlng.lat.toFixed(4) + '</td>' +
                        '<td>' + res.landing.latlng.lng.toFixed(4) + '</td>' +
                        '<td>' + currentSets.ascent_rate.toFixed(1) + '</td>' +
                        '<td>' + currentSets.descent_rate.toFixed(1) + '</td>' +
                        '<td>' + currentSets.burst_altitude.toFixed(0) + '</td>' +
                        '<td>' + Math.floor(res.flight_time / 60) + '</td>' +
                        '<td id="ehime_ls_' + idx + '" style="color:gray;">判定中...</td>';
                    $("#" + rowId).html(rowContent);

                    // 非同期海陸判定
                    checkLandSea13Var(lp, idx, function () {
                        updateEnsembleWaterStats(landingPoints, totalVariants);
                        // グローバル結果の海陸判定も更新
                        for (var ri = 0; ri < _ensembleResults.length; ri++) {
                            if (_ensembleResults[ri].index === idx) {
                                _ensembleResults[ri].isWater = lp.isWater;
                                break;
                            }
                        }
                        finalizeHistoryCheck();
                    });

                    // 項目4: テーブル行クリック → マップピン表示 & 軌跡強調
                    (function (markerIdx) {
                        $("#" + rowId).css("cursor", "pointer").on("click", function () {
                            var marker = map_items['13var_land_' + markerIdx];
                            if (marker) {
                                map.panTo(marker.getLatLng());
                                marker.openPopup();
                                focusEhimeVariant(markerIdx); // 軌跡強調
                            }
                        });
                    })(idx);

                    // Also generate mobile card
                    var baseClass = (idx === 0) ? ' base' : '';
                    var card = '<div class="ehime-card' + baseClass + '" id="ehime_card_' + idx + '">' +
                        '<span class="swatch" style="background:' + color + ';"></span>' +
                        '<span class="label">' + variant.label + '</span> — ' + variant.desc +
                        '<div class="meta">' +
                        '<span>緯度: ' + res.landing.latlng.lat.toFixed(4) + '</span>' +
                        '<span>経度: ' + res.landing.latlng.lng.toFixed(4) + '</span>' +
                        '<span>上昇: ' + currentSets.ascent_rate.toFixed(1) + '</span>' +
                        '<span>下降: ' + currentSets.descent_rate.toFixed(1) + '</span>' +
                        '<span>破裂: ' + currentSets.burst_altitude.toFixed(0) + 'm</span>' +
                        '<span>飛行: ' + flightTimeStr + '</span>' +
                        '<span id="ehime_mls_' + idx + '" style="color:gray;">判定中...</span>' +
                        '</div></div>';
                    $("#ehime_results_mobile").append(card);

                    // Update altitude chart for BASE only
                    if (idx === 0 && typeof updateAltitudeChart === "function") {
                        updateAltitudeChart(data.prediction);
                    }
                    // Update wind chart for BASE only
                    if (idx === 0 && typeof updateWindChart === "function") {
                        updateWindChart(data.prediction);
                    }
                    // D1: 放球地点の風速表示 (BASE のみ)
                    if (idx === 0 && typeof computeSurfaceWind === "function") {
                        computeSurfaceWind(data.prediction);
                    }
                })
                .fail(function (jqXHR) {
                    console.log("13-Var run " + variant.label + " failed.");
                    var errDesc = '';
                    try {
                        if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                            errDesc = jqXHR.responseJSON.error.description || '';
                        }
                    } catch (_e) { }
                    appendDebug("13-Var " + variant.label + " failed: " + errDesc);
                    // テーブル行を「エラー」表示に更新
                    var rowId = "ehime_row_" + idx;
                    var shortErr = errDesc ? errDesc.substring(0, 40) : '不明なエラー';
                    var rowContent =
                        '<td>' + (idx + 1) + '</td>' +
                        '<td><span class="color-swatch" style="background:' + color + ';"></span></td>' +
                        '<td><b>' + variant.label + '</b></td>' +
                        '<td>' + variant.desc + '</td>' +
                        '<td colspan="7" style="text-align:center; color:var(--color-danger);">\u2716 ' + shortErr + '</td>';
                    $("#" + rowId).html(rowContent);
                    // モバイルカードもエラー表示
                    var card = '<div class="ehime-card" id="ehime_card_' + idx + '">' +
                        '<span class="swatch" style="background:' + color + ';"></span>' +
                        '<span class="label">' + variant.label + '</span> \u2014 ' + variant.desc +
                        '<div class="meta"><span style="color:var(--color-danger);">\u2716 ' + shortErr + '</span></div></div>';
                    $("#ehime_results_mobile").append(card);
                    finalizeHistoryCheck();
                })
                .always(function () {
                    completed++;
                    $("#ensemble_completed").text(completed);
                    $("#prediction_status").html("13バリアント: " + completed + "/" + totalVariants);

                    if (completed >= totalVariants) {
                        var failCount = totalVariants - landingPoints.length;
                        appendDebug("13-Variant ensemble completed. Success: " + landingPoints.length + ", Failed: " + failCount);
                        $("#prediction_status").html("13バリアント完了");
                        // トースト通知（Phase 3）
                        if (typeof showToast === 'function') {
                            if (failCount > 0) {
                                showToast('13バリアント完了 (' + failCount + '件失敗)', 'warning', 6000);
                            } else {
                                showToast('13バリアントアンサンブル完了', 'success', 5000);
                            }
                        }

                        // Compute statistics
                        if (landingPoints.length > 0) {
                            compute13VarStatistics(landingPoints);
                        }

                        // 放球ウィンドウからのフラグをリセット
                        if (typeof _lwEnsembleRunning !== 'undefined') {
                            _lwEnsembleRunning = false;
                            $('#lw_ensemble_status').text('13バリアント完了 (' + landingPoints.length + '/' + totalVariants + ')').show();
                        }
                    }
                });
        })(i, v, iterSettings, variantColors[i]);
    }
}

function plot13VariantPath(prediction, index, variant, color, settings, rawData) {
    var flight_path = prediction.flight_path;
    var landing = prediction.landing;
    var launch = prediction.launch;
    var burst = prediction.burst;

    var isBase = (index === 0);

    // Polyline — BASE is thicker and black
    var path_polyline = L.polyline(
        flight_path,
        {
            weight: isBase ? 3 : 1.5,
            color: isBase ? '#000000' : color,
            opacity: isBase ? 0.8 : 0.4
        }
    ).addTo(map);
    map_items['13var_path_' + index] = path_polyline;

    // Landing Marker — BASE is larger
    var markerRadius = isBase ? 7 : 4;
    var land_marker = new L.CircleMarker(landing.latlng, {
        radius: markerRadius,
        fillOpacity: 0.85,
        color: '#333',
        fillColor: color,
        weight: isBase ? 2 : 1
    }).addTo(map);

    // Build popup content with diff info (Ehime-style)
    var popupContent = "<b>" + variant.label + "</b><br>";
    popupContent += "<b>変更:</b> " + variant.desc + "<br>";
    popupContent += "<b>上昇速度:</b> " + settings.ascent_rate.toFixed(2) + " m/s<br>";
    popupContent += "<b>下降速度:</b> " + settings.descent_rate.toFixed(2) + " m/s<br>";
    popupContent += "<b>破裂高度:</b> " + settings.burst_altitude.toFixed(0) + " m<br>";
    popupContent += "<b>着地点:</b> " + landing.latlng.lat.toFixed(4) + ", " + landing.latlng.lng.toFixed(4) + "<br>";
    popupContent += "<b>落下時刻:</b> " + getJSTDateTimeFormatted(landing.datetime) + " JST<br>";
    popupContent += "<b>打ち上げ時刻:</b> " + getJSTDateTimeFormatted(launch.datetime) + " JST";

    land_marker.bindPopup(popupContent);
    map_items['13var_land_' + index] = land_marker;

    // --- Interactive Path Visibility ---
    land_marker.on('click', function () {
        focusEhimeVariant(index);
    });
    // ------------------------------------

    // Fit bounds on BASE
    if (isBase) {
        // INFOの距離/飛行時間/カーソル距離表示にBASEを使えるように関連マーカーを設定
        map_items['launch_marker'] = L.marker(launch.latlng, { opacity: 0 });
        map_items['land_marker'] = L.marker(landing.latlng, { opacity: 0 });

        var range = distHaversine(launch.latlng, landing.latlng, 1);
        var f_hours = Math.floor(prediction.flight_time / 3600);
        var f_minutes = Math.floor(((prediction.flight_time % 86400) % 3600) / 60);
        if (f_minutes < 10) f_minutes = '0' + f_minutes;
        var flighttime = f_hours + 'hr' + f_minutes;
        $("#cursor_pred_range").html(range);
        $("#cursor_pred_time").html(flighttime);
        cursorPredShow();

        var bounds = path_polyline.getBounds();
        if (bounds && bounds.isValid()) {
            map.fitBounds(bounds);
        } else {
            map.panTo(landing.latlng);
        }
    }
}

function bindEhimeVariantSelection(targetIndex, rowSelector, cardSelector, getMarkerFn, onSelect) {
    var selectVariant = function () {
        var marker = typeof getMarkerFn === 'function' ? getMarkerFn(targetIndex) : null;
        if (marker && typeof marker.getLatLng === 'function') {
            map.panTo(marker.getLatLng());
            if (typeof marker.openPopup === 'function') marker.openPopup();
        }
        if (typeof onSelect === 'function') {
            onSelect(targetIndex, marker);
        } else if (typeof focusEhimeVariant === 'function') {
            focusEhimeVariant(targetIndex);
        }
    };

    if (rowSelector) {
        $(rowSelector).css('cursor', 'pointer').off('click').on('click', selectVariant);
    }
    if (cardSelector) {
        $(cardSelector).css('cursor', 'pointer').off('click').on('click', selectVariant);
    }
}

/**
 * Highlights a specific Ehime variant path and dims others.
 * @param {number} targetIdx 
 */
function focusEhimeVariant(targetIdx) {
    for (var i = 0; i < 13; i++) {
        var p = map_items['13var_path_' + i];
        if (!p) continue;
        var isBase = (i === 0);
        var target = (i === targetIdx);

        if (target) {
            p.setStyle({
                opacity: 1.0,
                weight: 4,
                dashArray: null
            });
            p.bringToFront();
            $("#ehime_row_" + i).addClass("active-path");
        } else {
            p.setStyle({
                opacity: isBase ? 0.3 : 0.1,
                weight: isBase ? 2 : 1.5,
                // dashArray: '2, 5' // Optional: make non-target dashed
            });
            $("#ehime_row_" + i).removeClass("active-path");
        }
    }
}

function compute13VarStatistics(landingPoints) {
    if (landingPoints.length === 0) return;

    if (map_items && map_items['13var_mean_marker']) {
        try { map.removeLayer(map_items['13var_mean_marker']); } catch (_e) { }
        delete map_items['13var_mean_marker'];
    }

    // Mean landing point
    var sumLat = 0, sumLng = 0;
    for (var i = 0; i < landingPoints.length; i++) {
        sumLat += landingPoints[i].lat;
        sumLng += landingPoints[i].lng;
    }
    var meanLat = sumLat / landingPoints.length;
    var meanLng = sumLng / landingPoints.length;

    $("#ensemble_mean_pos").text(meanLat.toFixed(4) + ", " + meanLng.toFixed(4));

    // Max deviation from mean
    var maxDev = 0;
    for (var i = 0; i < landingPoints.length; i++) {
        var d = distHaversine(
            L.latLng(meanLat, meanLng),
            L.latLng(landingPoints[i].lat, landingPoints[i].lng),
            1
        );
        var dist = parseFloat(d);
        if (dist > maxDev) maxDev = dist;
    }
    $("#ensemble_max_dev").text(maxDev.toFixed(2));

    // Draw convex hull using Turf.js
    drawEnsembleHull(landingPoints);

    // Mean marker (blue diamond)
    var meanMarker = L.circleMarker([meanLat, meanLng], {
        radius: 6,
        fillOpacity: 0.9,
        color: '#1565C0',
        fillColor: '#42A5F5',
        weight: 2
    }).addTo(map);
    meanMarker.bindPopup("<b>平均着地点</b><br>" + meanLat.toFixed(4) + ", " + meanLng.toFixed(4) + "<br>最大偏差: " + maxDev.toFixed(2) + " km");
    map_items['13var_mean_marker'] = meanMarker;
}

function drawEnsembleHull(landingPoints) {
    if (landingPoints.length < 3) return;

    try {
        if (map_items && map_items['13var_hull']) {
            try { map.removeLayer(map_items['13var_hull']); } catch (_e) { }
            delete map_items['13var_hull'];
        }

        // Create GeoJSON features for Turf.js
        var features = landingPoints.map(function (p) {
            return turf.point([p.lng, p.lat]);
        });
        var fc = turf.featureCollection(features);
        var hull = turf.convex(fc);

        if (hull) {
            // Convert GeoJSON coords to Leaflet LatLngs
            var coords = hull.geometry.coordinates[0].map(function (c) {
                return [c[1], c[0]]; // [lat, lng]
            });

            var hullPolygon = L.polygon(coords, {
                color: '#e53935',
                fillColor: '#ef9a9a',
                fillOpacity: 0.2,
                weight: 2,
                dashArray: '5, 5',
                interactive: false  // 項目6: クリックを下のマーカーに透過
            }).addTo(map);
            hullPolygon.bindPopup("<b>着地予測エリア</b><br>コンベックスハル (凸包)");
            map_items['13var_hull'] = hullPolygon;

            if (typeof _ensembleHullVisible !== 'undefined' && !_ensembleHullVisible) {
                try { map.removeLayer(hullPolygon); } catch (_e) { }
            }
        }
    } catch (e) {
        console.log("Convex hull error: " + e.message);
    }
}

// Land/Sea check for 13-variant mode (hybrid: local GeoJSON first, API fallback)
function checkLandSea13Var(landingPoint, variantIndex, callback) {
    var lat = landingPoint.lat;
    var lon = landingPoint.lng;

    classifyLandSeaAt(lat, lon, function (isWater) {
        landingPoint.isWater = isWater;
        if (isWater === true) {
            $("#ehime_ls_" + variantIndex).text("海 (Sea)").css("color", "blue");
            $("#ehime_mls_" + variantIndex).text("海").addClass("landsea-sea");
        } else if (isWater === false) {
            $("#ehime_ls_" + variantIndex).text("陸 (Land)").css("color", "green");
            $("#ehime_mls_" + variantIndex).text("陸").css("color", "green");
        } else {
            $("#ehime_ls_" + variantIndex).text("不明").css("color", "gray");
            $("#ehime_mls_" + variantIndex).text("不明").css("color", "gray");
        }
        if (callback) callback();
    });
}

function updateEnsembleWaterStats(landingPoints, total) {
    var determined = 0;
    var waterCount = 0;
    var landCount = 0;

    for (var i = 0; i < landingPoints.length; i++) {
        if (landingPoints[i].isWater === true) {
            waterCount++;
            determined++;
        } else if (landingPoints[i].isWater === false) {
            landCount++;
            determined++;
        }
    }

    if (determined > 0) {
        var landPct = ((landCount / determined) * 100).toFixed(0);
        var seaPct = ((waterCount / determined) * 100).toFixed(0);
        // 通常のパーセンテージ表示
        $("#ensemble_land_pct").text(landPct + "%");
        $("#ensemble_sea_pct").text(seaPct + "%");
    }

}

var _ensembleHullVisible = true;

function updateEnsembleHullToggleText() {
    var button = document.getElementById('ensemble_heatmap_toggle');
    if (!button) return;
    button.textContent = _ensembleHullVisible ? '着地範囲 ON' : '着地範囲 OFF';
}

function toggleEnsembleHeatmap() {
    var hull = map_items && map_items['13var_hull'];
    if (!hull) {
        if (typeof showToast === 'function') {
            showToast('着地予測エリアを表示できる結果がありません', 'warning', 2500);
        }
        return;
    }

    if (_ensembleHullVisible) {
        try { map.removeLayer(hull); } catch (_e) { }
        _ensembleHullVisible = false;
        updateEnsembleHullToggleText();
        if (typeof showToast === 'function') showToast('着地予測エリアを非表示', 'info', 2000);
        return;
    }

    try { hull.addTo(map); } catch (_e) { }
    _ensembleHullVisible = true;
    updateEnsembleHullToggleText();
    if (typeof showToast === 'function') showToast('着地予測エリアを表示', 'success', 2000);
}

function drawEnsembleHeatmap() {
    toggleEnsembleHeatmap();
}

function toFiniteNumber(value) {
    var num = Number(value);
    return isFinite(num) ? num : null;
}

function normalizeEhimeResultRecord(raw) {
    if (!raw) return null;

    var idx = parseInt(raw.index, 10);
    if (!isFinite(idx) || idx < 0) return null;

    var lat = toFiniteNumber(raw.lat);
    var lng = toFiniteNumber(raw.lng);
    if (lat === null || lng === null) return null;

    return {
        index: idx,
        label: raw.label || '-',
        description: raw.description || '-',
        flight_path: Array.isArray(raw.flight_path) ? raw.flight_path : [],
        lat: lat,
        lng: lng,
        launch_datetime: raw.launch_datetime,
        burst_datetime: raw.burst_datetime,
        landing_datetime: raw.landing_datetime,
        ascent_rate: toFiniteNumber(raw.ascent_rate),
        descent_rate: toFiniteNumber(raw.descent_rate),
        burst_altitude: toFiniteNumber(raw.burst_altitude),
        flight_time_sec: toFiniteNumber(raw.flight_time_sec),
        flight_time_str: raw.flight_time_str,
        launch_lat: toFiniteNumber(raw.launch_lat),
        launch_lng: toFiniteNumber(raw.launch_lng),
        burst_lat: toFiniteNumber(raw.burst_lat),
        burst_lng: toFiniteNumber(raw.burst_lng),
        burst_alt: toFiniteNumber(raw.burst_alt),
        isWater: raw.isWater
    };
}

// ============================================================
// C3: 愛媛モード 実行履歴
// ============================================================

var _ehimeHistory = [];  // 最大10件
var EHIME_HISTORY_KEY = 'predictor_ehime_history_v2';

function persistEhimeHistory() {
    try {
        localStorage.setItem(EHIME_HISTORY_KEY, JSON.stringify(_ehimeHistory));
    } catch (e) {
        appendDebug('愛媛履歴の保存に失敗: ' + e);
    }
}

function loadEhimeHistory() {
    try {
        var raw = localStorage.getItem(EHIME_HISTORY_KEY);
        if (!raw) {
            _ehimeHistory = [];
            renderEhimeHistory();
            return;
        }
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            _ehimeHistory = [];
            renderEhimeHistory();
            return;
        }
        _ehimeHistory = parsed.slice(0, 10);
        renderEhimeHistory();
    } catch (e) {
        _ehimeHistory = [];
        renderEhimeHistory();
    }
}

function clearEhimeHistoryCache() {
    _ehimeHistory = [];
    try {
        localStorage.removeItem(EHIME_HISTORY_KEY);
    } catch (_e) { }
    renderEhimeHistory();
}

function saveEhimeHistory(landingPoints, settings) {
    if (!settings || !landingPoints || landingPoints.length === 0) return;

    var launchTimeJST = '';
    try {
        var lt = moment(settings.launch_datetime).utcOffset(9 * 60);
        launchTimeJST = lt.format('MM/DD HH:mm');
    } catch (e) { }

    var landCount = 0;
    var waterCount = 0;
    for (var i = 0; i < landingPoints.length; i++) {
        if (landingPoints[i].isWater === false) landCount++;
        else if (landingPoints[i].isWater === true) waterCount++;
    }

    var entry = {
        id: Date.now(),
        time: launchTimeJST,
        siteName: settings.launch_site_name || $('#site option:selected').text() || '-',
        launch_datetime: settings.launch_datetime,
        launch_lat: settings.launch_latitude,
        launch_lng: settings.launch_longitude,
        initial_alt: settings.initial_alt,
        ascent: settings.ascent_rate || 0,
        burst: settings.burst_altitude || 0,
        descent: settings.descent_rate || 0,
        profile: settings.profile || '',
        prediction_type: settings.pred_type || '',
        api_source: $('#api_source').val() || '',
        api_custom_url: $('#api_custom_url').val() || '',
        successCount: landingPoints.length,
        landCount: landCount,
        waterCount: waterCount,
        meanLat: 0,
        meanLng: 0,
        results: []
    };
    var sumLat = 0, sumLng = 0;
    for (var j = 0; j < landingPoints.length; j++) {
        sumLat += landingPoints[j].lat;
        sumLng += landingPoints[j].lng;
    }
    entry.meanLat = sumLat / landingPoints.length;
    entry.meanLng = sumLng / landingPoints.length;

    // 再描画用に13バリアントの結果を保存
    if (Array.isArray(_ensembleResults) && _ensembleResults.length > 0) {
        var sorted = _ensembleResults.slice().sort(function (a, b) { return a.index - b.index; });
        entry.results = sorted.map(function (r) {
            return {
                index: r.index,
                label: r.label,
                description: r.description,
                flight_path: r.flight_path,
                lat: r.lat,
                lng: r.lng,
                launch_datetime: r.launch_datetime,
                burst_datetime: r.burst_datetime,
                landing_datetime: r.landing_datetime,
                ascent_rate: r.ascent_rate,
                descent_rate: r.descent_rate,
                burst_altitude: r.burst_altitude,
                flight_time_sec: r.flight_time_sec,
                flight_time_str: r.flight_time_str,
                launch_lat: r.launch_lat,
                launch_lng: r.launch_lng,
                burst_lat: r.burst_lat,
                burst_lng: r.burst_lng,
                burst_alt: r.burst_alt,
                isWater: r.isWater
            };
        });
    }

    _ehimeHistory.unshift(entry);
    if (_ehimeHistory.length > 10) _ehimeHistory.pop();
    persistEhimeHistory();

    renderEhimeHistory();

    if (_batchSimulationState && _batchSimulationState.active) {
        queueNextBatchSite();
    }
}

function restoreEhimeHistorySettings(target) {
    if (!target) return;

    if (target.launch_datetime) {
        var launchMoment = moment(target.launch_datetime).utcOffset(9 * 60);
        $('#year').val(launchMoment.year());
        $('#month').val(launchMoment.month() + 1).change();
        $('#day').val(launchMoment.date());
        $('#hour').val(launchMoment.hours());
        $('#min').val(launchMoment.minutes());
    }

    if (typeof target.launch_lat === 'number') $('#lat').val(target.launch_lat);
    if (typeof target.launch_lng === 'number') $('#lon').val(target.launch_lng);
    if (typeof target.initial_alt === 'number') $('#initial_alt').val(target.initial_alt);
    if (typeof target.ascent === 'number') $('#ascent').val(target.ascent);
    if (typeof target.burst === 'number') $('#burst').val(target.burst);
    if (typeof target.descent === 'number') $('#drag').val(target.descent);

    if (target.profile) {
        $('#flight_profile').val(target.profile).change();
    }
    if (target.prediction_type) {
        $('#prediction_type').val(target.prediction_type).change();
    }
    if (target.api_source) {
        $('#api_source').val(target.api_source).change();
    }
    if (typeof target.api_custom_url === 'string' && target.api_custom_url) {
        $('#api_custom_url').val(target.api_custom_url);
    }

    if (target.siteName) {
        var siteSelect = document.getElementById('site');
        if (siteSelect) {
            var matched = false;
            for (var i = 0; i < siteSelect.options.length; i++) {
                var opt = siteSelect.options[i];
                if (opt.text === target.siteName || opt.value === target.siteName) {
                    siteSelect.selectedIndex = i;
                    // $(siteSelect).change(); // 履歴再表示時の非同期クリアを防ぐため無効化
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // $('#site').trigger('change'); // 履歴再表示時の非同期クリアを防ぐため無効化
            }
        }
    }
}

function replayEhimeHistory(historyId) {
    var normalizedHistoryId = parseInt(historyId, 10);
    var target = null;
    for (var i = 0; i < _ehimeHistory.length; i++) {
        var currentId = parseInt(_ehimeHistory[i].id, 10);
        if ((!isNaN(normalizedHistoryId) && currentId === normalizedHistoryId) || String(_ehimeHistory[i].id) === String(historyId)) {
            target = _ehimeHistory[i];
            break;
        }
    }
    if (!target || !Array.isArray(target.results) || target.results.length === 0) {
        if (typeof showToast === 'function') {
            showToast('履歴データが不足しているため同条件で再計算します', 'warning', 4000);
        }
        clearMapItems();
        restoreEhimeHistorySettings(target);
        $("#ensemble_stats_panel").show();
        if (typeof switchTab === 'function') switchTab('results');

        if (typeof run13VariantEnsemble === 'function') {
            var fallbackSettings = {
                launch_datetime: target.launch_datetime,
                launch_latitude: target.launch_lat,
                launch_longitude: target.launch_lng,
                initial_alt: target.initial_alt,
                launch_altitude: target.initial_alt,
                ascent_rate: target.ascent,
                burst_altitude: target.burst,
                descent_rate: target.descent,
                profile: target.profile || 'standard_profile',
                pred_type: 'ensemble_13var',
                launch_site_name: target.siteName || $('#site option:selected').text() || '-'
            };
            setTimeout(function () {
                run13VariantEnsemble(fallbackSettings, target.api_source === 'custom' ? target.api_custom_url : (target.api_source === 'local' ? '/api/v1/' : 'https://api.v2.sondehub.org/tawhiri'));
            }, 0);
        }
        return;
    }

    clearMapItems();
    restoreEhimeHistorySettings(target);
    $("#ensemble_stats_panel").show();
    if (typeof switchTab === 'function') switchTab('results');

    $("#ehime_results_body").empty();
    $("#ehime_results_mobile").empty();

    var sorted = target.results.slice().map(function (r) {
        return normalizeEhimeResultRecord(r);
    }).filter(function (r) {
        return !!r;
    }).sort(function (a, b) { return a.index - b.index; });
    if (sorted.length === 0) {
        if (typeof showToast === 'function') {
            showToast('この履歴は再表示できるデータが不足しています', 'warning', 3000);
        }
        return;
    }
    var landingPoints = [];
    var variantColors = [
        '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
        '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
        '#469990', '#dcbeff', '#9A6324'
    ];

    _ensembleResults = sorted.slice();
    var markerBounds = [];

    for (var j = 0; j < sorted.length; j++) {
        var r = sorted[j];
        var color = variantColors[r.index % variantColors.length];
        var launchMoment = r.launch_datetime ? moment(r.launch_datetime) : moment();
        var burstMoment = r.burst_datetime ? moment(r.burst_datetime) : launchMoment.clone();
        var landingMoment = r.landing_datetime ? moment(r.landing_datetime) : launchMoment.clone();
        var launchLat = (r.launch_lat !== null) ? r.launch_lat : toFiniteNumber(target.launch_lat);
        var launchLng = (r.launch_lng !== null) ? r.launch_lng : toFiniteNumber(target.launch_lng);
        var landingLat = r.lat;
        var landingLng = r.lng;
        var ascentRate = (r.ascent_rate !== null) ? r.ascent_rate : (toFiniteNumber(target.ascent) || 0);
        var descentRate = (r.descent_rate !== null) ? r.descent_rate : (toFiniteNumber(target.descent) || 0);
        var burstAltitude = (r.burst_altitude !== null) ? r.burst_altitude : (toFiniteNumber(target.burst) || 0);
        var flightTimeSec = (r.flight_time_sec !== null) ? r.flight_time_sec : 0;
        var landSeaFlag = (r.isWater === true) ? 'blue' : (r.isWater === false ? 'green' : 'gray');
        var landSeaText = (r.isWater === true) ? '海 (Sea)' : (r.isWater === false ? '陸 (Land)' : '不明');

        if (launchLat === null || launchLng === null) {
            launchLat = landingLat;
            launchLng = landingLng;
        }

        var prediction = {
            flight_path: r.flight_path || [],
            flight_time: flightTimeSec,
            launch: {
                latlng: L.latLng(launchLat, launchLng),
                datetime: launchMoment
            },
            burst: {
                latlng: L.latLng((typeof r.burst_lat === 'number') ? r.burst_lat : launchLat, (typeof r.burst_lng === 'number') ? r.burst_lng : launchLng, (typeof r.burst_alt === 'number') ? r.burst_alt : burstAltitude),
                datetime: burstMoment
            },
            landing: {
                latlng: L.latLng(landingLat, landingLng),
                datetime: landingMoment
            }
        };

        plot13VariantPath(
            prediction,
            r.index,
            { label: r.label, desc: r.description },
            color,
            {
                ascent_rate: ascentRate,
                descent_rate: descentRate,
                burst_altitude: burstAltitude
            }
        );

        var rowHtml = '<tr id="ehime_row_' + r.index + '" data-variant-index="' + r.index + '">' +
            '<td>' + (r.index + 1) + '</td>' +
            '<td><span class="color-swatch" style="background:' + color + ';"></span></td>' +
            '<td><b>' + (r.label || '-') + '</b></td>' +
            '<td>' + (r.description || '-') + '</td>' +
            '<td>' + landingLat.toFixed(4) + '</td>' +
            '<td>' + landingLng.toFixed(4) + '</td>' +
            '<td>' + ascentRate.toFixed(1) + '</td>' +
            '<td>' + descentRate.toFixed(1) + '</td>' +
            '<td>' + burstAltitude.toFixed(0) + '</td>' +
            '<td>' + Math.floor(flightTimeSec / 60) + '</td>' +
            '<td style="color:' + landSeaFlag + ';">' + landSeaText + '</td>' +
            '</tr>';
        $("#ehime_results_body").append(rowHtml);

        var mobileLandText = (r.isWater === true) ? '海' : (r.isWater === false ? '陸' : '不明');
        var card = '<div class="ehime-card' + (r.index === 0 ? ' base' : '') + '" id="ehime_card_' + r.index + '" data-variant-index="' + r.index + '">' +
            '<span class="swatch" style="background:' + color + ';"></span>' +
            '<span class="label">' + (r.label || '-') + '</span> — ' + (r.description || '-') +
            '<div class="meta">' +
            '<span>緯度: ' + landingLat.toFixed(4) + '</span>' +
            '<span>経度: ' + landingLng.toFixed(4) + '</span>' +
            '<span>上昇: ' + ascentRate.toFixed(1) + '</span>' +
            '<span>下降: ' + descentRate.toFixed(1) + '</span>' +
            '<span>破裂: ' + burstAltitude.toFixed(0) + 'm</span>' +
            '<span>飛行: ' + (r.flight_time_str || (Math.floor(flightTimeSec / 60) + '分')) + '</span>' +
            '<span>' + mobileLandText + '</span>' +
            '</div></div>';
        $("#ehime_results_mobile").append(card);

        bindEhimeVariantSelection(r.index, '#ehime_row_' + r.index, '#ehime_card_' + r.index, function (idx) {
            return map_items['13var_land_' + idx];
        });

        markerBounds.push([landingLat, landingLng]);

        landingPoints.push({
            lat: landingLat,
            lng: landingLng,
            label: r.label || '-',
            isWater: r.isWater
        });
    }

    $("#ensemble_total").text(sorted.length);
    $("#ensemble_completed").text(sorted.length);
    updateEnsembleWaterStats(landingPoints, sorted.length);
    compute13VarStatistics(landingPoints);

    if (markerBounds.length > 0) {
        var bounds = L.latLngBounds(markerBounds);
        if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.2));
        }
        var baseMarker = map_items['13var_land_0'];
        if (!baseMarker) {
            var firstMarker = map_items['13var_land_' + sorted[0].index];
            if (firstMarker && typeof firstMarker.getLatLng === 'function') {
                map.panTo(firstMarker.getLatLng());
                if (typeof firstMarker.openPopup === 'function') firstMarker.openPopup();
                focusEhimeVariant(sorted[0].index);
            }
        } else {
            focusEhimeVariant(0);
        }
    }

    updateEnsembleHullToggleText();
    $("#prediction_status").html("13バリアント履歴を再表示");

    if (typeof showToast === 'function') {
        showToast('履歴を再表示しました (' + target.time + ')', 'success', 3000);
    }
}

function renderEhimeHistory() {
    var $panels = $('#ehime_history_panel, #ehime_history_panel_result');
    if ($panels.length === 0) return;

    if (_ehimeHistory.length === 0) {
        $panels.html('<p style="font-size:11px; color:var(--text-secondary); padding:4px;">実行履歴なし</p>');
        return;
    }

    var html = '<table style="width:100%; font-size:11px; border-collapse:separate; border-spacing:0;">' +
        '<thead><tr style="background:var(--bg-input); border-bottom:1px solid var(--border-color);">' +
        '<th style="padding:6px 4px; text-align:left;">時刻/場所</th>' +
        '<th style="padding:6px 4px; text-align:center;">条件</th>' +
        '<th style="padding:6px 4px; text-align:center;">成功</th>' +
        '<th style="padding:6px 4px; text-align:center;">陸/海</th>' +
        '<th style="padding:6px 4px; text-align:left;">平均着地</th>' +
        '<th style="padding:6px 4px; text-align:center;">操作</th>' +
        '</tr></thead><tbody>';

    for (var i = 0; i < _ehimeHistory.length; i++) {
        var e = _ehimeHistory[i];
        var successCount = parseInt(e.successCount, 10) || 0;
        var landCount = parseInt(e.landCount, 10) || 0;
        var waterCount = parseInt(e.waterCount, 10) || 0;
        var landPct = successCount > 0 ? Math.round((landCount / successCount) * 100) : 0;
        var waterPct = successCount > 0 ? Math.round((waterCount / successCount) * 100) : 0;
        var statusColor = e.landCount > 0 ? 'var(--color-danger)' : 'var(--color-success)';
        var meanLat = toFiniteNumber(e.meanLat);
        var meanLng = toFiniteNumber(e.meanLng);
        var hasMean = (meanLat !== null && meanLng !== null);
        var rowBg = (i % 2 === 0) ? 'transparent' : 'var(--bg-input)';
        var replayId = parseInt(e.id, 10);
        if (isNaN(replayId)) replayId = e.id;

        html += '<tr style="background:' + rowBg + '; border-bottom:1px solid var(--border-color);">' +
            '<td style="padding:6px 4px; line-height:1.35;"><b>' + (e.time || '-') + '</b><br><span style="color:var(--text-secondary);">' + (e.siteName || '-') + '</span></td>' +
            '<td style="padding:6px 4px; text-align:center;">上昇 ' + (toFiniteNumber(e.ascent) || 0).toFixed(1) + '<br>下降 ' + (toFiniteNumber(e.descent) || 0).toFixed(1) + '</td>' +
            '<td style="padding:6px 4px; text-align:center;"><b>' + successCount + '/13</b></td>' +
            '<td style="padding:6px 4px; text-align:center; color:' + statusColor + ';"><b>陸 ' + landPct + '%</b><br><span style="color:var(--text-secondary);">海 ' + waterPct + '%</span></td>' +
            '<td style="padding:6px 4px;">' + (hasMean
                ? '<button type="button" class="btn-preset" style="height:22px; font-size:10px; padding:0 6px;" onclick="map.panTo([' + meanLat.toFixed(4) + ',' + meanLng.toFixed(4) + '])">地図へ</button><br><span style="font-size:10px; color:var(--text-secondary);">' + meanLat.toFixed(3) + ', ' + meanLng.toFixed(3) + '</span>'
                : '<span style="color:var(--text-secondary);">データなし</span>') + '</td>' +
            '<td style="padding:6px 4px; text-align:center;"><button type="button" class="btn-preset" style="height:22px; font-size:10px; padding:0 8px;" onclick="replayEhimeHistory(' + replayId + ')">再表示</button></td>' +
            '</tr>';
    }
    html += '</tbody></table>';
    $panels.html(html);
}

$(function () {
    loadEhimeHistory();
});
