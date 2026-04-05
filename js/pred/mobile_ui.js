// Responsive mobile UI controller.
// Re-inits when crossing breakpoint so buttons always work.
(function () {
    var BREAKPOINT = 768;
    var mm = window.matchMedia('(max-width: ' + BREAKPOINT + 'px)');
    var inited = false;
    var nav, panels = {};
    var COMPACT_CLASS = 'compact';

    // Safe closest polyfill (very old browsers)
    if (!Element.prototype.closest) {
        Element.prototype.closest = function (sel) {
            var el = this; while (el) { if (el.matches && el.matches(sel)) return el; el = el.parentElement; } return null;
        };
    }

    function buildPanels() {
        var panelIds = ['input_form', 'scenario_info', 'ensemble_stats_panel', 'burst-calc-wrapper'];
        panels = {};
        panelIds.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) panels[id] = el;
        });
    }

    function closeAll() {
        Object.keys(panels).forEach(function (k) { panels[k].classList.remove('mobile-panel-open'); });
        if (nav) {
            var btns = nav.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
        }
        document.body.classList.remove('mobile-active-panel-open');
    }

    function toggle(id, btn) {
        var panel = panels[id];
        if (!panel) return;
        var isOpen = panel.classList.contains('mobile-panel-open');
        closeAll();
        if (!isOpen) {
            panel.classList.add('mobile-panel-open');
            if (btn) btn.classList.add('active');
            document.body.classList.add('mobile-active-panel-open');
        }
    }

    function init() {
        if (inited) return;
        nav = document.getElementById('mobile_nav');
        if (!nav) return;
        buildPanels();
        nav.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('button[data-target]') : null;
            if (!btn) return;
            toggle(btn.getAttribute('data-target'), btn);
        });
        // Auto-show launch form panel only when in mobile mode
        if (mm.matches) {
            var initialBtn = nav.querySelector('button[data-target="input_form"]');
            if (initialBtn) initialBtn.click();
        }
        inited = true;
    }

    // Re-evaluate on resize
    function handleChange() {
        if (!nav) nav = document.getElementById('mobile_nav');
        if (!nav) return;
        buildPanels();
        if (mm.matches) {
            nav.style.display = 'flex';
            // Apply compact mode to launch panel
            var launch = panels['input_form'];
            if (launch && !launch.classList.contains(COMPACT_CLASS)) launch.classList.add(COMPACT_CLASS);
            // If no panel currently open, auto open launch form
            var anyOpen = false;
            Object.keys(panels).forEach(function (k) { if (panels[k].classList.contains('mobile-panel-open')) anyOpen = true; });
            if (!anyOpen) {
                var btn = nav.querySelector('button[data-target="input_form"]');
                if (btn) btn.click();
            }
        } else {
            nav.style.display = 'none';
            // Leaving mobile mode: close overlays to restore desktop draggable windows
            closeAll();
            ['input_form', 'scenario_info'].forEach(function (id) {
                var el = panels[id];
                if (el) { el.style.display = 'block'; el.classList.remove('mobile-panel-open'); }
            });
            // Remove compact class when not in mobile mode
            var launchDesktop = panels['input_form'];
            if (launchDesktop) launchDesktop.classList.remove(COMPACT_CLASS);
        }
    }

    // Public API (idempotent)
    window.__mobileUI = {
        showEhimePanel: function () {
            var ehimeBtn = document.getElementById('mobile_nav_ehime');
            if (ehimeBtn) { ehimeBtn.style.display = 'block'; }
        },
        openPanel: function (id) {
            var btn = nav && nav.querySelector('button[data-target="' + id + '"]');
            if (btn) btn.click();
        },
        closeAll: closeAll,
        enableCompact: function () { var el = document.getElementById('input_form'); if (el) el.classList.add(COMPACT_CLASS); },
        disableCompact: function () { var el = document.getElementById('input_form'); if (el) el.classList.remove(COMPACT_CLASS); },
        _rebind: function () { buildPanels(); }
    };

    // Init now (even on desktop so that later resize works)
    document.addEventListener('DOMContentLoaded', init);
    // Fallback if script loads after DOM
    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    // Initial compact application if already in mobile viewport
    if (mm.matches) {
        var lf = document.getElementById('input_form'); if (lf) lf.classList.add(COMPACT_CLASS);
        if (nav) nav.style.display = 'flex';
    } else {
        if (nav) nav.style.display = 'none';
    }
    // Listen to breakpoint changes
    if (mm.addEventListener) { mm.addEventListener('change', handleChange); } else if (mm.addListener) { mm.addListener(handleChange); }
    window.addEventListener('resize', handleChange);
})();
